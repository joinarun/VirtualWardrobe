package com.virtualwardrobe.identity;

import com.google.gson.*;
import java.sql.DriverManager;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import jakarta.servlet.http.Cookie;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class IdentityIntegrationTest {
    static final String SCHEMA="identity_test_"+UUID.randomUUID().toString().replace("-","");
    static final String BASE=System.getenv().getOrDefault("SPRING_DATASOURCE_URL","jdbc:postgresql://localhost:5433/virtualwardrobe");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry){
        registry.add("spring.datasource.url",()->BASE+(BASE.contains("?")?"&":"?")+"currentSchema="+SCHEMA);
        registry.add("spring.flyway.schemas",()->SCHEMA);registry.add("spring.flyway.default-schema",()->SCHEMA);
        registry.add("app.bootstrap.email",()->"");registry.add("app.bootstrap.password",()->"");
    }
    @Autowired MockMvc mvc;@Autowired JdbcTemplate jdbc;@Autowired IdentityService identities;@Autowired StoreService stores;@Autowired PasswordEncoder passwords;
    @Autowired SessionSupport sessions;
    final Gson json=new Gson();
    @BeforeEach void clean(){SecurityContextHolder.clearContext();jdbc.execute("TRUNCATE vw_account,vw_store,vw_membership,vw_recovery_code,vw_audit_event,vw_rate_limit,SPRING_SESSION CASCADE");}
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    @AfterAll static void removeTestSchema()throws Exception{
        try(var connection=DriverManager.getConnection(BASE,System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"),System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD",""));var s=connection.createStatement()){s.execute("DROP SCHEMA "+SCHEMA+" CASCADE");}
    }
    UUID account(String kind,String identifier,boolean superAdmin,boolean rotation){
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash,super_admin,password_change_required,temp_password_expires_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP+INTERVAL '24 hours' ELSE NULL END)",id,kind,"Test user",identifier,passwords.encode("ValidPassword123!"),superAdmin,rotation,rotation);return id;
    }
    void as(UUID id){SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(id.toString(),null,List.of()));}
    UUID store(UUID admin){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO vw_store(id,name,status) VALUES(?,'Test store','ACTIVE')",id);member(id,admin,"STORE_ADMIN");return id;}
    UUID member(UUID store,UUID user,String role){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO vw_membership(id,store_id,account_id,role,state,accepted_at) VALUES(?,?,?,?,'ACTIVE',CURRENT_TIMESTAMP)",id,store,user,role);return id;}
    Cookie login(String kind,String identifier,String password)throws Exception{
        var result=mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.toJson(Map.of("kind",kind,"identifier",identifier,"password",password))))
            .andExpect(status().isOk()).andReturn();return result.getResponse().getCookie("__session");
    }
    @Test void signupRecoveryIsOneTimeAndHashed()throws Exception{
        var result=mvc.perform(post("/api/v1/auth/signup").with(csrf()).contentType("application/json").content(json.toJson(Map.of("name","Anaya","countryCode","+91","mobile","9876543210","password","ValidPassword123!","privacyAccepted",true,"captchaToken","local-development"))))
            .andExpect(status().isOk()).andReturn();
        var payload=JsonParser.parseString(result.getResponse().getContentAsString()).getAsJsonObject();String recovery=payload.getAsJsonArray("recoveryCodes").get(0).getAsString();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vw_recovery_code WHERE code_hash=?",Integer.class,recovery)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vw_recovery_code",Integer.class)).isEqualTo(8);
        var body=Map.of("phone","+919876543210","recoveryCode",recovery,"newPassword","Replacement123!");
        mvc.perform(post("/api/v1/auth/recover").with(csrf()).contentType("application/json").content(json.toJson(body))).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/recover").with(csrf()).contentType("application/json").content(json.toJson(body))).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM SPRING_SESSION WHERE PRINCIPAL_NAME IS NOT NULL",Integer.class)).isZero();
        login("CUSTOMER","+919876543210","Replacement123!");
    }
    @Test void csrfAndTemporaryPasswordGateAreServerSide()throws Exception{
        account("WORKFORCE","temporary@example.test",true,true);
        mvc.perform(post("/api/v1/auth/login").contentType("application/json").content("{}")).andExpect(status().isForbidden());
        var session=login("WORKFORCE","temporary@example.test","ValidPassword123!");
        mvc.perform(get("/api/v1/stores?managed=true").cookie(session)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/password").cookie(session).with(csrf()).contentType("application/json").content(json.toJson(Map.of("currentPassword","ValidPassword123!","newPassword","ChangedPassword123!"))))
            .andExpect(status().isNoContent());
        login("WORKFORCE","temporary@example.test","ChangedPassword123!");
    }
    @Test void failedAuthenticationCountersDoNotRollback()throws Exception{
        account("CUSTOMER","+919999999999",false,false);
        for(int i=0;i<12;i++)mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.toJson(Map.of("kind","CUSTOMER","identifier",i%2==0?"+919999999999":"+91 99999 99999","password","WrongPassword123!"))))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.toJson(Map.of("kind","CUSTOMER","identifier","+919999999999","password","ValidPassword123!"))))
            .andExpect(status().isTooManyRequests());
    }
    @Test void storeAdminCannotManageAnotherStoreOrResetCustomer(){
        UUID admin=account("WORKFORCE","admin@example.test",false,false),other=account("WORKFORCE","other@example.test",false,false),customer=account("CUSTOMER","+919888888888",false,false);
        UUID a=store(admin),b=store(other);as(admin);
        assertThatThrownBy(()->stores.members(b)).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->stores.patch(b,Map.of("name","Hijacked"))).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->stores.resetWorkforce(customer)).isInstanceOf(ApiProblem.class);
        assertThat(stores.members(a)).containsKey("items");
    }
    @Test void invitationDoesNotResetExistingPasswordOrLeakOtherMemberships(){
        UUID admin=account("WORKFORCE","inviteadmin@example.test",false,false),existing=account("WORKFORCE","existing@example.test",false,false);
        UUID a=store(admin),b=store(existing);String before=identities.find(existing).hash();as(admin);
        var response=stores.provision(a,Map.of("email","existing@example.test","name","Existing","role","STAFF"));
        assertThat(response).doesNotContainKey("temporaryPassword");assertThat(identities.find(existing).hash()).isEqualTo(before);
        @SuppressWarnings("unchecked") var user=(Map<String,Object>)response.get("user");
        @SuppressWarnings("unchecked") var memberships=(List<Map<String,Object>>)user.get("memberships");
        assertThat(memberships).hasSize(1);assertThat(memberships.getFirst().get("storeId")).isEqualTo(a);
        @SuppressWarnings("unchecked") var m=(Map<String,Object>)response.get("membership");
        as(existing);stores.accept((UUID)m.get("id"));assertThat(identities.user(identities.find(existing)).get("memberships").toString()).contains(b.toString());
    }
    @Test void finalSuperAdminAndStoreAdminAreProtected(){
        UUID admin=account("WORKFORCE","only@example.test",true,false);UUID store=store(admin);as(admin);
        UUID membership=jdbc.queryForObject("SELECT id FROM vw_membership WHERE store_id=?",UUID.class,store);
        assertThatThrownBy(()->stores.changeMember(store,membership,Map.of(),true)).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->stores.patchWorkforce(admin,Map.of("enabled",false))).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->stores.patchWorkforce(admin,Map.of("superAdmin",false))).isInstanceOf(ApiProblem.class);
        assertThat(identities.find(admin).enabled()).isTrue();
    }
    @Test void simultaneousAdminRemovalLeavesOneActive()throws Exception{
        UUID global=account("WORKFORCE","global@example.test",true,false),a=account("WORKFORCE","a@example.test",false,false),b=account("WORKFORCE","b@example.test",false,false);
        UUID store=store(a),second=member(store,b,"STORE_ADMIN");UUID first=jdbc.queryForObject("SELECT id FROM vw_membership WHERE store_id=? AND account_id=?",UUID.class,store,a);
        var start=new CountDownLatch(1);var executor=Executors.newFixedThreadPool(2);
        try {
            var calls=List.of(first,second).stream().map(id->executor.submit(()->{as(global);start.await();try{stores.changeMember(store,id,Map.of(),true);return true;}catch(ApiProblem e){return false;}finally{SecurityContextHolder.clearContext();}})).toList();
            start.countDown();int won=0;for(var call:calls)if(call.get(15,TimeUnit.SECONDS))won++;
            assertThat(won).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM vw_membership WHERE store_id=? AND state='ACTIVE' AND role='STORE_ADMIN'",Integer.class,store)).isEqualTo(1);
        }finally{executor.shutdownNow();}
    }
    @Test void expiredCredentialsAndOversizedUtf8PasswordAreRejected()throws Exception{
        UUID id=account("WORKFORCE","expired@example.test",false,true);jdbc.update("UPDATE vw_account SET temp_password_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE id=?",id);
        assertThatThrownBy(()->identities.login("WORKFORCE","expired@example.test","ValidPassword123!")).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->Inputs.password(Map.of("password","😀".repeat(30)),"password")).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->identities.login("WORKFORCE","expired@example.test","😀".repeat(30))).isInstanceOf(ApiProblem.class);
    }
    @Test void globalDisableCannotStrandAnotherStoreOrResetCustomer(){
        UUID global=account("WORKFORCE","top@example.test",true,false),target=account("WORKFORCE","storeowner@example.test",false,false),customer=account("CUSTOMER","+919555555555",false,false);
        store(target);as(global);
        assertThatThrownBy(()->stores.patchWorkforce(target,Map.of("enabled",false))).isInstanceOf(ApiProblem.class);
        assertThat(identities.find(target).enabled()).isTrue();
        assertThatThrownBy(()->stores.resetWorkforce(customer)).isInstanceOf(ApiProblem.class);
    }
    @Test void twoRecoveryAttemptsConsumeOnlyOneCode()throws Exception{
        UUID customer=account("CUSTOMER","+919444444444",false,false);String code=Inputs.secret();
        jdbc.update("INSERT INTO vw_recovery_code(id,account_id,code_hash) VALUES(?,?,?)",UUID.randomUUID(),customer,Inputs.hash(code));
        var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        try {
            List<Future<Boolean>> calls=new ArrayList<>();for(int i=0;i<2;i++)calls.add(pool.submit(()->{start.await();try{identities.recover(Map.of("phone","+919444444444","recoveryCode",code,"newPassword","RecoveredPassword123!"));return true;}catch(ApiProblem p){return false;}}));
            start.countDown();int successful=0;for(var call:calls)if(call.get(15,TimeUnit.SECONDS))successful++;
            assertThat(successful).isEqualTo(1);
        }finally{pool.shutdownNow();}
    }
    @Test void simultaneousGlobalDemotionsKeepAnActiveSuperAdmin()throws Exception{
        UUID a=account("WORKFORCE","global-a@example.test",true,false),b=account("WORKFORCE","global-b@example.test",true,false);
        var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        try {
            var calls=List.of(a,b).stream().map(id->pool.submit(()->{as(id);start.await();try{stores.patchWorkforce(id,Map.of("superAdmin",false));return true;}catch(ApiProblem p){return false;}finally{SecurityContextHolder.clearContext();}})).toList();
            start.countDown();int successful=0;for(var call:calls)if(call.get(15,TimeUnit.SECONDS))successful++;
            assertThat(successful).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM vw_account WHERE enabled=TRUE AND super_admin=TRUE",Integer.class)).isEqualTo(1);
        }finally{pool.shutdownNow();}
    }
    @Test void browserCsrfHeaderAndCookieContractWorksWithoutTestPostProcessor()throws Exception{
        account("CUSTOMER","+919333333333",false,false);
        var bootstrap=mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
        Cookie cookie=bootstrap.getResponse().getCookie("__session");assertThat(cookie).isNotNull();assertThat(cookie.isHttpOnly()).isTrue();
        String token=JsonParser.parseString(bootstrap.getResponse().getContentAsString()).getAsJsonObject().get("token").getAsString();
        var login=mvc.perform(post("/api/v1/auth/login").cookie(cookie).header("X-CSRF-TOKEN",token).contentType("application/json")
            .content(json.toJson(Map.of("kind","CUSTOMER","identifier","+919333333333","password","ValidPassword123!")))).andExpect(status().isOk()).andReturn();
        Cookie authenticated=login.getResponse().getCookie("__session");assertThat(authenticated).isNotNull();assertThat(authenticated.getValue()).isNotEqualTo(cookie.getValue());
        mvc.perform(get("/api/v1/auth/session").cookie(authenticated)).andExpect(status().isOk()).andExpect(jsonPath("$.user.phoneVerified").value(false));
    }
    @Test void cloudCannotEnableTheLocalCaptchaByAccident(){
        var captcha=new CaptchaService("demo","local","","project","signup","example.web.app",.5);
        assertThat(captcha.config().get("signupEnabled")).isEqualTo(false);
        assertThatThrownBy(()->captcha.verify("local-development")).isInstanceOf(ApiProblem.class);
    }
    @Test void customerDeletionRevokesCredentialsAndAnonymizesAccount()throws Exception{
        UUID customer=account("CUSTOMER","+919222222222",false,false);
        jdbc.update("INSERT INTO vw_recovery_code(id,account_id,code_hash) VALUES(?,?,?)",UUID.randomUUID(),customer,Inputs.hash(Inputs.secret()));
        login("CUSTOMER","+919222222222","ValidPassword123!");as(customer);
        identities.deleteCustomer(identities.customer(),Map.of("password","ValidPassword123!","confirm",true));
        var deleted=identities.find(customer);assertThat(deleted.enabled()).isFalse();assertThat(deleted.identifier()).doesNotContain("9222222222");assertThat(deleted.name()).isEqualTo("Deleted account");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vw_recovery_code WHERE account_id=?",Integer.class,customer)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?",Integer.class,customer.toString())).isZero();
    }
    @Test void staleSuccessfulLoginCannotCreateUsableSessionAfterPasswordRotation()throws Exception{
        account("CUSTOMER","+919111111111",false,false);
        var validatedBeforeRotation=identities.login("CUSTOMER","+919111111111","ValidPassword123!");
        var controlRequest=new MockHttpServletRequest("GET","/api/v1/me/previews");var controlResponse=new MockHttpServletResponse();
        sessions.signIn(validatedBeforeRotation,controlRequest,controlResponse);
        var controlReached=new java.util.concurrent.atomic.AtomicBoolean(false);
        new AccountAccessFilter(identities,"api").doFilter(controlRequest,controlResponse,(request,response)->controlReached.set(true));
        assertThat(controlReached.get()).isTrue();
        identities.changePassword(validatedBeforeRotation,Map.of("currentPassword","ValidPassword123!","newPassword","RotatedPassword123!"));
        // Simulate the original in-flight login completing only after rotation and revocation.
        var lateRequest=new MockHttpServletRequest("GET","/api/v1/me/previews");var lateResponse=new MockHttpServletResponse();
        sessions.signIn(validatedBeforeRotation,lateRequest,lateResponse);
        var privateRouteReached=new java.util.concurrent.atomic.AtomicBoolean(false);
        new AccountAccessFilter(identities,"api").doFilter(lateRequest,lateResponse,(request,response)->privateRouteReached.set(true));
        assertThat(privateRouteReached.get()).isFalse();assertThat(lateResponse.getStatus()).isEqualTo(401);
        assertThat(identities.find(validatedBeforeRotation.id()).credentialVersion()).isGreaterThan(validatedBeforeRotation.credentialVersion());
    }
}
