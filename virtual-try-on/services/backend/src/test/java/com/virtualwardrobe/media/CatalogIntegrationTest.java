package com.virtualwardrobe.media;

import com.google.gson.*;
import com.virtualwardrobe.catalog.CatalogService;
import com.virtualwardrobe.foundation.FoundationProperties;
import com.virtualwardrobe.identity.*;
import java.io.*;
import java.sql.DriverManager;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class CatalogIntegrationTest {
    static final String SCHEMA="catalog_test_"+UUID.randomUUID().toString().replace("-","");
    static final String BASE=System.getenv().getOrDefault("SPRING_DATASOURCE_URL","jdbc:postgresql://localhost:5433/virtualwardrobe");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry){
        registry.add("spring.datasource.url",()->BASE+(BASE.contains("?")?"&":"?")+"currentSchema="+SCHEMA);
        registry.add("spring.flyway.schemas",()->SCHEMA);registry.add("spring.flyway.default-schema",()->SCHEMA);
        registry.add("app.bootstrap.email",()->"");registry.add("app.bootstrap.password",()->"");
        registry.add("app.local-data-directory",()->"work/catalog-test/"+SCHEMA);
    }
    @Autowired MockMvc mvc;@Autowired JdbcTemplate jdbc;@Autowired CatalogService catalog;
    @Autowired MediaService media;@Autowired MediaTransactions transactions;@Autowired MediaStorage storage;
    @Autowired StoreService stores;@Autowired ImageProcessor images;@Autowired Mp4Validator videos;
    @Autowired FoundationProperties properties;@Autowired PasswordEncoder passwords;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    UUID global,admin,staff,store,category;final Gson json=new Gson();
    @BeforeEach void clean(){
        SecurityContextHolder.clearContext();jdbc.execute("TRUNCATE vw_account,vw_store,vw_membership,vw_category,vw_brand,vw_product,vw_media_upload,vw_audit_event,vw_rate_limit,SPRING_SESSION CASCADE");
        global=account("global@example.test",true);admin=account("owner@example.test",false);staff=account("staff@example.test",false);
        store=UUID.randomUUID();jdbc.update("INSERT INTO vw_store(id,name,status) VALUES(?,'Silk studio','ACTIVE')",store);member(store,admin,"STORE_ADMIN");member(store,staff,"STAFF");
        as(global);category=(UUID)catalog.category(null,Map.of("name","Sarees")).get("id");as(staff);
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    @AfterAll static void removeSchema()throws Exception{
        try(var connection=DriverManager.getConnection(BASE,System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"),System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD",""));var s=connection.createStatement()){s.execute("DROP SCHEMA "+SCHEMA+" CASCADE");}
    }
    UUID account(String email,boolean superAdmin){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash,super_admin) VALUES(?,'WORKFORCE','Test operator',?,?,?)",id,email,passwords.encode("ValidPassword123!"),superAdmin);return id;}
    UUID member(UUID store,UUID user,String role){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO vw_membership(id,store_id,account_id,role,state,accepted_at) VALUES(?,?,?,?,'ACTIVE',CURRENT_TIMESTAMP)",id,store,user,role);return id;}
    void as(UUID id){SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(id.toString(),null,List.of()));}
    UUID product(String sku){return(UUID)catalog.create(store,Map.of("sku",sku,"title","Floral silk saree","categoryId",category.toString(),"price","1499.00","labels",List.of("Soft silk","Floral"))).get("id");}
    Map<String,Object> authorize(UUID product,byte[] bytes){return media.authorize(store,product,null,"PRODUCT_IMAGE",Map.of("kind","IMAGE","contentType","image/png","bytes",bytes.length,"fileName","saree.png"));}
    @SuppressWarnings("unchecked") UUID upload(UUID product,byte[] bytes){var lease=authorize(product,bytes);UUID id=(UUID)lease.get("uploadId");var headers=(Map<String,String>)lease.get("headers");media.upload(id,headers.get("X-Upload-Token"),headers.get("Content-Type"),new ByteArrayInputStream(bytes),bytes.length);media.finalizeUpload(id);return id;}
    @SuppressWarnings("unchecked") List<Map<String,Object>> items(Map<String,Object> page){return(List<Map<String,Object>>)page.get("items");}
    Cookie login()throws Exception{
        SecurityContextHolder.clearContext();return mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content(json.toJson(Map.of("kind","WORKFORCE","identifier","staff@example.test","password","ValidPassword123!"))))
            .andExpect(status().isOk()).andReturn().getResponse().getCookie("__session");
    }
    @Test void publishSearchAvailabilityAndArchiveRetainHistory()throws Exception{
        UUID product=product("SILK-1");assertThatThrownBy(()->catalog.patch(store,product,Map.of("status","PUBLISHED"))).isInstanceOf(ApiProblem.class);
        UUID picture=upload(product,MediaValidationTest.png(960,1280));var published=catalog.patch(store,product,Map.of("status","PUBLISHED","availability","UNAVAILABLE"));
        assertThat(published.get("coverUrl")).isEqualTo("/api/v1/media/"+picture+"/thumbnail");assertThat(published.get("referenceMediaId")).isEqualTo(picture);
        SecurityContextHolder.clearContext();var results=catalog.products(Map.of("q","Floral","categoryId",category.toString(),"label","soft silk","minPrice","1000","maxPrice","2000","sort","price_asc"),null);
        assertThat(items(results)).hasSize(1);assertThat(items(results).getFirst().get("availability")).isEqualTo("UNAVAILABLE");
        mvc.perform(get("/api/v1/media/"+picture+"/thumbnail")).andExpect(status().isOk()).andExpect(content().contentType("image/jpeg")).andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("public")));
        as(staff);assertThatThrownBy(()->media.remove(store,product,picture)).isInstanceOf(ApiProblem.class);catalog.archive(store,product);
        SecurityContextHolder.clearContext();assertThat(items(catalog.products(Map.of(),null))).isEmpty();
        mvc.perform(get("/api/v1/media/"+picture+"/content")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/products/"+product)).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT status FROM vw_product WHERE id=?",String.class,product)).isEqualTo("ARCHIVED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vw_audit_event WHERE event_type='PRODUCT_UPDATED'",Integer.class)).isGreaterThanOrEqualTo(3);
    }
    @Test void crossStoreAndCategoryBrandBoundariesAreEnforced()throws Exception{
        UUID product=product("PRIVATE-1"),otherStore=UUID.randomUUID();jdbc.update("INSERT INTO vw_store(id,name,status) VALUES(?,'Other store','ACTIVE')",otherStore);member(otherStore,global,"STORE_ADMIN");
        as(global);UUID otherBrand=(UUID)catalog.brand(otherStore,null,Map.of("name","Other brand")).get("id");UUID child=(UUID)catalog.category(null,Map.of("name","Woven","parentId",category.toString())).get("id");
        assertThatThrownBy(()->catalog.category(category,Map.of("name","Sarees","parentId",child.toString()))).isInstanceOf(ApiProblem.class);
        as(staff);assertThatThrownBy(()->catalog.patch(otherStore,product,Map.of("title","Hijack"))).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->media.authorize(otherStore,product,null,"PRODUCT_IMAGE",Map.of("kind","IMAGE","contentType","image/png","bytes",100))).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->catalog.patch(store,product,Map.of("brandId",otherBrand.toString()))).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->catalog.brand(null,null,Map.of("name","Global"))).isInstanceOf(ApiProblem.class);
        UUID second=account("second-staff@example.test",false);member(store,second,"STAFF");byte[] bytes=MediaValidationTest.png(30,40);var lease=authorize(product,bytes);as(second);
        assertThatThrownBy(()->media.finalizeUpload((UUID)lease.get("uploadId"))).isInstanceOf(ApiProblem.class);
        assertThat(items(catalog.products(Map.of(),null))).isEmpty();
    }
    @Test void localCapabilityIsNarrowOneUseAndInvalidContentNeverPublishes()throws Exception{
        UUID product=product("CAP-1");byte[] bytes=MediaValidationTest.png(20,30);var lease=authorize(product,bytes);UUID id=(UUID)lease.get("uploadId");
        @SuppressWarnings("unchecked") var headers=(Map<String,String>)lease.get("headers");
        SecurityContextHolder.clearContext();
        mvc.perform(put(lease.get("uploadUrl").toString()).contentType("image/png").header("X-Upload-Token","forged").content(bytes)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/media/"+id+"/content")).andExpect(status().isNotFound());
        mvc.perform(put(lease.get("uploadUrl").toString()).contentType("image/png").header("X-Upload-Token",headers.get("X-Upload-Token")).content(bytes)).andExpect(status().isNoContent());
        mvc.perform(put(lease.get("uploadUrl").toString()).contentType("image/png").header("X-Upload-Token",headers.get("X-Upload-Token")).content(bytes)).andExpect(status().isConflict());
        var session=login();mvc.perform(post("/api/v1/uploads/"+id+"/finalize").cookie(session)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/uploads/"+id+"/finalize").cookie(session).with(csrf())).andExpect(status().isOk());
        as(staff);byte[] corrupt={1,2,3,4};var bad=authorize(product,corrupt);UUID invalid=(UUID)bad.get("uploadId");@SuppressWarnings("unchecked")var badHeaders=(Map<String,String>)bad.get("headers");
        media.upload(invalid,badHeaders.get("X-Upload-Token"),"image/png",new ByteArrayInputStream(corrupt),4);
        assertThatThrownBy(()->media.finalizeUpload(invalid)).isInstanceOf(ApiProblem.class);
        assertThat(transactions.find(invalid).state()).isEqualTo("REJECTED");assertThatThrownBy(()->storage.read("quarantine/"+invalid)).isInstanceOf(IOException.class);
    }
    @Test void concurrentReservationsCannotExceedTenImagesAndOneVideo()throws Exception{
        UUID product=product("LIMIT-1");byte[] bytes=MediaValidationTest.png(5,5);var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(11);
        try{
            List<Future<Boolean>> calls=new ArrayList<>();for(int i=0;i<11;i++)calls.add(pool.submit(()->{as(staff);start.await();try{authorize(product,bytes);return true;}catch(ApiProblem e){assertThat(e.code).isEqualTo("MEDIA_LIMIT");return false;}finally{SecurityContextHolder.clearContext();}}));
            start.countDown();int won=0;for(var call:calls)if(call.get(20,TimeUnit.SECONDS))won++;assertThat(won).isEqualTo(10);
            UUID rejected=jdbc.queryForObject("SELECT id FROM vw_media_upload WHERE product_id=? LIMIT 1",UUID.class,product);transactions.reject(rejected);as(staff);assertThat(authorize(product,bytes)).containsKey("uploadId");
            media.authorize(store,product,null,"PRODUCT_IMAGE",Map.of("kind","VIDEO","contentType","video/mp4","bytes",100));
            assertThatThrownBy(()->media.authorize(store,product,null,"PRODUCT_IMAGE",Map.of("kind","VIDEO","contentType","video/mp4","bytes",100))).isInstanceOf(ApiProblem.class).hasMessageContaining("maximum");
        }finally{pool.shutdownNow();}
    }
    @Test void revocationDuringStorageReadPreventsAttachmentAndIoHoldsNoDatabaseTransaction()throws Exception{
        UUID product=product("REVOKE-1");byte[] bytes=MediaValidationTest.png(40,50);var lease=authorize(product,bytes);UUID id=(UUID)lease.get("uploadId");@SuppressWarnings("unchecked")var headers=(Map<String,String>)lease.get("headers");
        media.upload(id,headers.get("X-Upload-Token"),"image/png",new ByteArrayInputStream(bytes),bytes.length);
        var reading=new CountDownLatch(1);var proceed=new CountDownLatch(1);var heldTransaction=new AtomicBoolean(false);
        MediaStorage slow=new MediaStorage(){public void put(String key,byte[] value,String type)throws IOException{heldTransaction.compareAndSet(false,TransactionSynchronizationManager.isActualTransactionActive());storage.put(key,value,type);}public byte[] read(String key)throws IOException{heldTransaction.set(TransactionSynchronizationManager.isActualTransactionActive());reading.countDown();try{if(!proceed.await(10,TimeUnit.SECONDS))throw new IOException();}catch(InterruptedException e){throw new IOException(e);}return storage.read(key);}public void delete(String key)throws IOException{storage.delete(key);}};
        var service=new MediaService(transactions,slow,images,videos,properties);var pool=Executors.newSingleThreadExecutor();
        try{
            var outcome=pool.submit(()->{as(staff);try{service.finalizeUpload(id);return 200;}catch(ApiProblem e){return e.status;}finally{SecurityContextHolder.clearContext();}});
            assertThat(reading.await(10,TimeUnit.SECONDS)).isTrue();as(global);UUID membership=jdbc.queryForObject("SELECT id FROM vw_membership WHERE store_id=? AND account_id=?",UUID.class,store,staff);stores.changeMember(store,membership,Map.of(),true);proceed.countDown();
            assertThat(outcome.get(15,TimeUnit.SECONDS)).isEqualTo(403);assertThat(heldTransaction.get()).isFalse();assertThat(transactions.find(id).state()).isEqualTo("REJECTED");
            assertThat(jdbc.queryForObject("SELECT cover_media_id FROM vw_product WHERE id=?",UUID.class,product)).isNull();
        }finally{proceed.countDown();pool.shutdownNow();}
    }
    @Test void processingCapacityReturnsRetryableBusyWithoutClaimingThirdUpload()throws Exception{
        UUID product=product("BUSY-1");byte[] bytes=MediaValidationTest.png(20,30);List<UUID> uploads=new ArrayList<>();
        for(int i=0;i<3;i++){var lease=authorize(product,bytes);UUID id=(UUID)lease.get("uploadId");@SuppressWarnings("unchecked")var headers=(Map<String,String>)lease.get("headers");media.upload(id,headers.get("X-Upload-Token"),"image/png",new ByteArrayInputStream(bytes),bytes.length);uploads.add(id);}
        var reading=new CountDownLatch(2);var proceed=new CountDownLatch(1);
        MediaStorage slow=new MediaStorage(){public void put(String key,byte[] value,String type)throws IOException{storage.put(key,value,type);}public byte[] read(String key)throws IOException{reading.countDown();try{if(!proceed.await(10,TimeUnit.SECONDS))throw new IOException();}catch(InterruptedException e){throw new IOException(e);}return storage.read(key);}public void delete(String key)throws IOException{storage.delete(key);}};
        var service=new MediaService(transactions,slow,images,videos,properties);var pool=Executors.newFixedThreadPool(2);
        try{
            var calls=uploads.subList(0,2).stream().map(id->pool.submit(()->{as(staff);try{return service.finalizeUpload(id);}finally{SecurityContextHolder.clearContext();}})).toList();
            assertThat(reading.await(5,TimeUnit.SECONDS)).isTrue();as(staff);
            assertThatThrownBy(()->service.finalizeUpload(uploads.get(2))).isInstanceOfSatisfying(ApiProblem.class,e->assertThat(e.status).isEqualTo(429));
            assertThat(transactions.find(uploads.get(2)).state()).isEqualTo("UPLOADED");proceed.countDown();for(var call:calls)assertThat(call.get(10,TimeUnit.SECONDS)).containsKey("media");
            assertThat(service.finalizeUpload(uploads.get(2))).containsKey("media");
        }finally{proceed.countDown();pool.shutdownNow();}
    }
    @Test void expiryDuringProcessingCannotAttachAfterItsReservationStopsCounting()throws Exception{
        UUID product=product("EXPIRED-1");byte[] bytes=MediaValidationTest.png(20,30);var lease=authorize(product,bytes);UUID id=(UUID)lease.get("uploadId");@SuppressWarnings("unchecked")var headers=(Map<String,String>)lease.get("headers");
        media.upload(id,headers.get("X-Upload-Token"),"image/png",new ByteArrayInputStream(bytes),bytes.length);
        MediaStorage expiring=new MediaStorage(){public void put(String key,byte[] value,String type)throws IOException{storage.put(key,value,type);}public byte[] read(String key)throws IOException{jdbc.update("UPDATE vw_media_upload SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=?",id);return storage.read(key);}public void delete(String key)throws IOException{storage.delete(key);}};
        var service=new MediaService(transactions,expiring,images,videos,properties);
        assertThatThrownBy(()->service.finalizeUpload(id)).isInstanceOfSatisfying(ApiProblem.class,e->assertThat(e.code).isEqualTo("UPLOAD_EXPIRED"));
        assertThat(transactions.find(id).state()).isEqualTo("REJECTED");assertThat(jdbc.queryForObject("SELECT cover_media_id FROM vw_product WHERE id=?",UUID.class,product)).isNull();
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings={"CATEGORY","WORKFORCE"})
    void demotionWhileWaitingForAdministrationLockCannotUseStaleGlobalRole(String target)throws Exception{
        account("second-global@example.test",true);var pool=Executors.newSingleThreadExecutor();var pending=new java.util.concurrent.atomic.AtomicReference<Future<Integer>>();
        try{
            new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(tx->{
                jdbc.queryForObject("SELECT id FROM vw_administration_guard WHERE id=1 FOR UPDATE",Integer.class);int ownerPid=jdbc.queryForObject("SELECT pg_backend_pid()",Integer.class);
                pending.set(pool.submit(()->{as(global);try{if(target.equals("CATEGORY"))catalog.category(null,Map.of("name","Forbidden after demotion"));else stores.createWorkforce(Map.of("name","Forbidden operator","email","forbidden-after-demotion@example.test","superAdmin",false));return 200;}catch(ApiProblem e){return e.status;}finally{SecurityContextHolder.clearContext();}}));
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean blocked=false;
                while(System.nanoTime()<deadline){if(jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid))",Integer.class,ownerPid)>0){blocked=true;break;}Thread.onSpinWait();}
                assertThat(blocked).isTrue();jdbc.update("UPDATE vw_account SET super_admin=FALSE WHERE id=?",global);
            });
            assertThat(pending.get().get(10,TimeUnit.SECONDS)).isEqualTo(403);assertThat(jdbc.queryForObject("SELECT count(*) FROM vw_category WHERE name='Forbidden after demotion'",Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM vw_account WHERE normalized_identifier='forbidden-after-demotion@example.test'",Integer.class)).isZero();
        }finally{pool.shutdownNow();}
    }
    @Test void coverReferenceOrderingAndLogoPermissionsAreExplicit()throws Exception{
        UUID product=product("ORDER-1");byte[] bytes=MediaValidationTest.png(40,60);UUID first=upload(product,bytes),second=upload(product,bytes);
        var changed=catalog.patch(store,product,Map.of("mediaOrder",List.of(second.toString(),first.toString()),"coverMediaId",second.toString(),"referenceMediaId",first.toString()));
        assertThat(changed.get("coverUrl")).isEqualTo("/api/v1/media/"+second+"/thumbnail");assertThat(changed.get("referenceMediaId")).isEqualTo(first);
        assertThatThrownBy(()->catalog.patch(store,product,Map.of("mediaOrder",List.of(first.toString(),first.toString())))).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->catalog.patch(store,product,Map.of("mediaOrder",Arrays.asList(first.toString(),null)))).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->catalog.patch(store,product,Map.of("tryOnEnabled","false"))).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->media.authorize(store,null,null,"STORE_LOGO",Map.of("kind","IMAGE","contentType","image/png","bytes",bytes.length))).isInstanceOf(ApiProblem.class);
        UUID brand=(UUID)catalog.brand(store,null,Map.of("name","Local silk")).get("id");var lease=media.authorize(store,null,brand,"BRAND_LOGO",Map.of("kind","IMAGE","contentType","image/png","bytes",bytes.length));UUID logo=(UUID)lease.get("uploadId");@SuppressWarnings("unchecked")var headers=(Map<String,String>)lease.get("headers");
        media.upload(logo,headers.get("X-Upload-Token"),"image/png",new ByteArrayInputStream(bytes),bytes.length);media.finalizeUpload(logo);
        assertThat(transactions.publiclyReadable(transactions.find(logo))).isTrue();assertThat(jdbc.queryForObject("SELECT logo_media_id FROM vw_brand WHERE id=?",UUID.class,brand)).isEqualTo(logo);
        as(admin);assertThat(media.authorize(store,null,null,"STORE_LOGO",Map.of("kind","IMAGE","contentType","image/png","bytes",bytes.length))).containsKey("uploadId");
    }
}
