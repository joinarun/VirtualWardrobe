package com.virtualwardrobe.identity;

import com.google.gson.*;
import java.net.*;
import java.net.http.*;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.*;
import static org.assertj.core.api.Assertions.*;

/** Actual servlet/JDBC requests; restarting the cookie jar retains persistent cookies only. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class SessionPersistenceIntegrationTest {
    static final String SCHEMA="session_test_"+UUID.randomUUID().toString().replace("-","");
    static final String BASE=System.getenv().getOrDefault("SPRING_DATASOURCE_URL","jdbc:postgresql://localhost:5433/virtualwardrobe");
    static final String PASSWORD="SessionTestPassword123!";
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->BASE+(BASE.contains("?")?"&":"?")+"currentSchema="+SCHEMA);r.add("spring.flyway.schemas",()->SCHEMA);r.add("spring.flyway.default-schema",()->SCHEMA);r.add("app.bootstrap.email",()->"");r.add("app.bootstrap.password",()->"");}
    @Autowired JdbcTemplate jdbc;@Autowired PasswordEncoder passwords;@Autowired Environment environment;
    final Gson json=new Gson();URI origin;
    @BeforeEach void setup(){jdbc.execute("TRUNCATE vw_account,vw_rate_limit,SPRING_SESSION CASCADE");origin=URI.create("http://127.0.0.1:"+environment.getRequiredProperty("local.server.port"));}
    @AfterAll static void removeSchema()throws Exception{try(var c=DriverManager.getConnection(BASE,System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"),System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD",""));var s=c.createStatement()){s.execute("DROP SCHEMA "+SCHEMA+" CASCADE");}}
    UUID account(String kind,String identifier,boolean temporary){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash,password_change_required,temp_password_expires_at) VALUES(?,?,'Session test',?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP+INTERVAL '24 hours' ELSE NULL END)",id,kind,identifier,passwords.encode(PASSWORD),temporary,temporary);return id;}
    final class Browser {
        final CookieManager jar=new CookieManager(null,CookiePolicy.ACCEPT_ALL);
        final HttpClient client=HttpClient.newBuilder().cookieHandler(jar).connectTimeout(Duration.ofSeconds(5)).build();
        HttpResponse<String> get(String path)throws Exception{return send("GET",path,null,null);}
        HttpResponse<String> send(String method,String path,Map<String,Object> body,String csrf)throws Exception{var request=HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(10));if(csrf!=null)request.header("X-CSRF-TOKEN",csrf);if(body!=null)request.header("Content-Type","application/json");return client.send(request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.toJson(body))).build(),HttpResponse.BodyHandlers.ofString());}
        String csrf()throws Exception{var response=get("/api/v1/auth/csrf");assertThat(response.statusCode()).isEqualTo(200);return JsonParser.parseString(response.body()).getAsJsonObject().get("token").getAsString();}
        HttpResponse<String> login(String kind,String identifier)throws Exception{var response=send("POST","/api/v1/auth/login",Map.of("kind",kind,"identifier",identifier,"password",PASSWORD),csrf());assertThat(response.statusCode()).isEqualTo(200);return response;}
        Browser restart(){var restarted=new Browser();for(var cookie:jar.getCookieStore().getCookies())if(cookie.getMaxAge()>0&&!cookie.hasExpired())restarted.jar.getCookieStore().add(origin,(HttpCookie)cookie.clone());return restarted;}
        HttpCookie cookie(){return jar.getCookieStore().getCookies().stream().filter(c->c.getName().equals("__session")&&!c.hasExpired()).findFirst().orElseThrow();}
        boolean signedIn()throws Exception{var response=get("/api/v1/auth/session");assertThat(response.statusCode()).isEqualTo(200);assertThat(response.headers().firstValue("cache-control")).contains("no-store");return !JsonParser.parseString(response.body()).getAsJsonObject().get("user").isJsonNull();}
    }
    @Test void customerPersistentCookieSurvivesNewClientAndServerUsesThirtyDayIdle()throws Exception{
        UUID id=account("CUSTOMER","+919876540001",false);var browser=new Browser();var login=browser.login("CUSTOMER","+919876540001");
        String header=login.headers().firstValue("set-cookie").orElseThrow();for(String attribute:List.of("HttpOnly","SameSite=Lax","Path=/","Max-Age=2592000"))assertThat(header.contains(attribute)).as("cookie attribute %s",attribute).isTrue();
        assertThat(browser.cookie().getMaxAge()).isEqualTo(2592000);assertThat(browser.restart().signedIn()).isTrue();
        assertThat(jdbc.queryForObject("SELECT MAX_INACTIVE_INTERVAL FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?",Integer.class,id.toString())).isEqualTo(2592000);
    }
    @Test void anonymousAndWorkforceServerIdleStayShorterThanCookie()throws Exception{
        var anonymous=new Browser();anonymous.csrf();assertThat(jdbc.queryForObject("SELECT MAX_INACTIVE_INTERVAL FROM SPRING_SESSION WHERE PRINCIPAL_NAME IS NULL",Integer.class)).isEqualTo(1800);
        UUID id=account("WORKFORCE","session-worker@example.test",false);var worker=new Browser();worker.login("WORKFORCE","session-worker@example.test");assertThat(worker.restart().signedIn()).isTrue();
        assertThat(jdbc.queryForObject("SELECT MAX_INACTIVE_INTERVAL FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?",Integer.class,id.toString())).isEqualTo(28800);
    }
    @Test void legacySessionCookieIsLostAtRestartWhileServerRowRemainsValidUntilExplicitLogin()throws Exception{
        UUID id=account("CUSTOMER","+919876540002",false);var legacy=new Browser();legacy.login("CUSTOMER","+919876540002");legacy.cookie().setMaxAge(-1);
        jdbc.update("UPDATE SPRING_SESSION SET MAX_INACTIVE_INTERVAL=28800,EXPIRY_TIME=LAST_ACCESS_TIME+28800000 WHERE PRINCIPAL_NAME=?",id.toString());
        assertThat(legacy.signedIn()).isTrue();assertThat(jdbc.queryForObject("SELECT MAX_INACTIVE_INTERVAL FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?",Integer.class,id.toString())).isEqualTo(28800);
        assertThat(legacy.restart().signedIn()).isFalse();assertThat(jdbc.queryForObject("SELECT count(*) FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?",Integer.class,id.toString())).isEqualTo(1);
        legacy.login("CUSTOMER","+919876540002");assertThat(legacy.restart().signedIn()).isTrue();
    }
    @Test void persistedCookieCannotBypassServerExpiryDisableCredentialVersionOrLogout()throws Exception{
        UUID id=account("CUSTOMER","+919876540003",false);var browser=new Browser();browser.login("CUSTOMER","+919876540003");
        jdbc.update("UPDATE SPRING_SESSION SET EXPIRY_TIME=0,LAST_ACCESS_TIME=0 WHERE PRINCIPAL_NAME=?",id.toString());assertThat(browser.restart().signedIn()).isFalse();
        browser=new Browser();browser.login("CUSTOMER","+919876540003");jdbc.update("UPDATE vw_account SET enabled=FALSE WHERE id=?",id);assertThat(browser.restart().signedIn()).isFalse();
        jdbc.update("UPDATE vw_account SET enabled=TRUE WHERE id=?",id);browser=new Browser();browser.login("CUSTOMER","+919876540003");jdbc.update("UPDATE vw_account SET credential_version=credential_version+1 WHERE id=?",id);assertThat(browser.restart().signedIn()).isFalse();
        browser=new Browser();browser.login("CUSTOMER","+919876540003");var stolen=browser.restart();var logout=browser.send("POST","/api/v1/auth/logout",null,browser.csrf());assertThat(logout.statusCode()).isEqualTo(204);assertThat(logout.headers().firstValue("set-cookie").orElseThrow()).contains("Max-Age=0");assertThat(stolen.signedIn()).isFalse();assertThat(browser.restart().signedIn()).isFalse();
    }
    @Test void temporaryPasswordAbsoluteDeadlineRevokesAlreadyOpenSession()throws Exception{
        UUID id=account("WORKFORCE","temporary-session@example.test",true);var browser=new Browser();browser.login("WORKFORCE","temporary-session@example.test");assertThat(browser.get("/api/v1/stores?managed=true").statusCode()).isEqualTo(403);
        jdbc.update("UPDATE vw_account SET temp_password_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=?",id);assertThat(browser.restart().signedIn()).isFalse();assertThat(browser.get("/api/v1/stores?managed=true").statusCode()).isEqualTo(401);
    }
    @Test void persistenceKeepsCsrfAndPasswordRotationRevokesOtherClients()throws Exception{
        UUID id=account("CUSTOMER","+919876540004",false);var browser=new Browser();browser.login("CUSTOMER","+919876540004");var other=browser.restart();
        assertThat(browser.send("POST","/api/v1/auth/logout",null,null).statusCode()).isEqualTo(403);
        var rotated=browser.send("POST","/api/v1/auth/password",Map.of("currentPassword",PASSWORD,"newPassword","RotatedSessionPassword123!"),browser.csrf());assertThat(rotated.statusCode()).isEqualTo(204);assertThat(browser.restart().signedIn()).isTrue();assertThat(other.signedIn()).isFalse();assertThat(jdbc.queryForObject("SELECT credential_version FROM vw_account WHERE id=?",Long.class,id)).isGreaterThan(0);
    }
}
