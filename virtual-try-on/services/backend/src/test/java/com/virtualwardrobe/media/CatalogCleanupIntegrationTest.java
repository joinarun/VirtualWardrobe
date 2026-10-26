package com.virtualwardrobe.media;

import com.virtualwardrobe.catalog.CatalogService;
import com.virtualwardrobe.foundation.*;
import com.virtualwardrobe.identity.*;
import com.virtualwardrobe.tryon.*;
import java.io.*;
import java.net.URI;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class CatalogCleanupIntegrationTest {
    static final String SCHEMA="catalog_gc_"+UUID.randomUUID().toString().replace("-","");static final String BASE=System.getenv().getOrDefault("SPRING_DATASOURCE_URL","jdbc:postgresql://localhost:5433/virtualwardrobe");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->BASE+(BASE.contains("?")?"&":"?")+"currentSchema="+SCHEMA);r.add("spring.flyway.schemas",()->SCHEMA);r.add("spring.flyway.default-schema",()->SCHEMA);r.add("app.bootstrap.email",()->"");r.add("app.bootstrap.password",()->"");r.add("app.local-data-directory",()->"work/catalog-gc/"+SCHEMA);}
    @Autowired JdbcTemplate db;@Autowired CatalogService catalog;@Autowired MediaTransactions tx;@Autowired CatalogCleanupTransactions cleanup;@Autowired CatalogMaintenance maintenance;@Autowired ObjectDeletionQueue queue;@Autowired MediaService media;@Autowired MediaStorage storage;@Autowired PlatformTransactionManager manager;@Autowired ImageProcessor images;@Autowired Mp4Validator videos;@Autowired FoundationProperties foundation;@Autowired TryOnTransactions tryonTx;@Autowired TryOnSettings settings;@Autowired RateLimits rates;
    UUID owner,store,product;byte[] png;
    @BeforeEach void setup()throws Exception{
        SecurityContextHolder.clearContext();db.execute("TRUNCATE vw_account,vw_store,vw_category,vw_brand,vw_product,vw_media_upload,vw_audit_event,vw_demo_dataset,vw_demo_object,vw_object_deletion,SPRING_SESSION CASCADE");owner=UUID.randomUUID();store=UUID.randomUUID();product=UUID.randomUUID();db.update("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash,super_admin) VALUES(?,'WORKFORCE','Catalog operator','gc@example.test','not-used-in-this-test',TRUE)",owner);db.update("INSERT INTO vw_store(id,name,status) VALUES(?,'Catalog lifecycle store','ACTIVE')",store);db.update("INSERT INTO vw_product(id,store_id,sku,title) VALUES(?,?,'GC-1','Lifecycle saree')",product,store);asOwner();png=MediaValidationTest.png(40,60);
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    @AfterAll static void remove()throws Exception{try(var c=DriverManager.getConnection(BASE,System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"),System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD",""));var s=c.createStatement()){s.execute("DROP SCHEMA "+SCHEMA+" CASCADE");}}
    void asOwner(){SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(owner.toString(),null,List.of()));}
    @SuppressWarnings("unchecked") UUID uploaded(UUID product,UUID brand,String purpose)throws Exception{var lease=media.authorize(store,product,brand,purpose,Map.of("kind","IMAGE","contentType","image/png","bytes",png.length));UUID id=(UUID)lease.get("uploadId");var headers=(Map<String,String>)lease.get("headers");media.upload(id,headers.get("X-Upload-Token"),"image/png",new ByteArrayInputStream(png),png.length);return id;}
    UUID picture()throws Exception{UUID id=uploaded(product,null,"PRODUCT_IMAGE");media.finalizeUpload(id);return id;}
    String key(UUID id,String name){return "catalog/"+store+"/"+id+"/"+name;}
    void expire(UUID id){db.update("UPDATE vw_media_upload SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=?",id);}
    TryOnService drainer(MediaStorage target){return new TryOnService(tryonTx,settings,target,images,(id,sequence)->{},rates,foundation);}
    void finishDeletes(){db.update("UPDATE vw_object_deletion SET next_attempt_at=CURRENT_TIMESTAMP-INTERVAL '1 second',final_check_at=CURRENT_TIMESTAMP-INTERVAL '1 second'");drainer(storage).drainDeletes();}
    void dataset(String id,String state){db.update("INSERT INTO vw_demo_dataset(id,profile,fingerprint,credential_digest,credentials_json,credentials_text,state,target_products) VALUES(?,'load',?,?,'private/local.json','private/local.txt',?,1)",id,"f".repeat(64),"c".repeat(64),state);}
    UUID abandoned(String dataset,String object,String thumb)throws Exception{UUID id=UUID.randomUUID();db.update("INSERT INTO vw_media_upload(id,owner_id,store_id,product_id,purpose,declared_mime,declared_bytes,token_hash,state,object_key,thumbnail_key,expires_at,dataset_id) VALUES(?,?,?,?,'PRODUCT_IMAGE','image/png',?,'no-capability','PROCESSING',?,?,CURRENT_TIMESTAMP-INTERVAL '1 minute',?)",id,owner,store,product,png.length,object,thumb,dataset);return id;}
    @ParameterizedTest @ValueSource(strings={"STORE_LOGO","BRAND_LOGO"})
    void replacedLogosAreUnreadableAndDurablyDeletedWhileReplacementSurvives(String purpose)throws Exception{
        UUID brand=null;if(purpose.equals("BRAND_LOGO")){brand=UUID.randomUUID();db.update("INSERT INTO vw_brand(id,store_id,name) VALUES(?,?,'Lifecycle brand')",brand,store);}
        UUID old=uploaded(null,brand,purpose);media.finalizeUpload(old);var previous=tx.find(old);UUID replacement=uploaded(null,brand,purpose);media.finalizeUpload(replacement);var current=tx.find(replacement);
        assertThat(tx.find(old).state()).isEqualTo("DELETED");assertThatThrownBy(()->tx.readable(tx.find(old))).isInstanceOf(ApiProblem.class);assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion WHERE object_key IN(?,?)",Integer.class,previous.objectKey(),previous.thumbnailKey())).isEqualTo(2);finishDeletes();assertThatThrownBy(()->storage.read(previous.objectKey())).isInstanceOf(IOException.class);assertThatThrownBy(()->storage.read(previous.thumbnailKey())).isInstanceOf(IOException.class);assertThat(storage.read(current.objectKey())).isNotEmpty();assertThat(storage.read(current.thumbnailKey())).isNotEmpty();assertThat(maintenance.run()).containsEntry("reconciled",0);assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion",Integer.class)).isZero();
    }
    @Test void failedDeletionRetriesOutsideTransactionsAndRemovalNeverRestoresAccess()throws Exception{
        UUID id=picture();var m=tx.find(id);media.remove(store,product,id);var fail=new AtomicBoolean(true);MediaStorage flaky=new MediaStorage(){public void put(String k,byte[] b,String type)throws IOException{storage.put(k,b,type);}public byte[] read(String k)throws IOException{return storage.read(k);}public void delete(String k)throws IOException{assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();if(k.equals(m.objectKey())&&fail.getAndSet(false))throw new IOException("Controlled transient failure");storage.delete(k);}};
        drainer(flaky).drainDeletes();assertThat(storage.read(m.objectKey())).isNotEmpty();assertThat(db.queryForObject("SELECT attempts FROM vw_object_deletion WHERE object_key=?",Integer.class,m.objectKey())).isEqualTo(1);assertThatThrownBy(()->tx.readable(tx.find(id))).isInstanceOf(ApiProblem.class);finishDeletes();assertThatThrownBy(()->storage.read(m.objectKey())).isInstanceOf(IOException.class);assertThat(maintenance.run()).containsEntry("reconciled",0);assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion",Integer.class)).isZero();
    }
    @Test void abandonedPartialWriteAndTenMinuteFinalPassRemoveLateDerivative()throws Exception{
        UUID id=uploaded(product,null,"PRODUCT_IMAGE");tx.beginFinalize(id,false);String full=key(id,"content.jpg"),thumb=key(id,"thumb.jpg");storage.put(full,png,"image/jpeg");expire(id);assertThat(maintenance.run()).containsEntry("reconciled",1);assertThat(tx.find(id).state()).isEqualTo("DELETED");assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion WHERE object_key=?",Integer.class,thumb)).isEqualTo(1);drainer(storage).drainDeletes();assertThatThrownBy(()->storage.read(full)).isInstanceOf(IOException.class);
        storage.put(thumb,png,"image/jpeg");assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion WHERE object_key=? AND final_check_at>CURRENT_TIMESTAMP+INTERVAL '9 minutes'",Integer.class,thumb)).isEqualTo(1);finishDeletes();assertThatThrownBy(()->storage.read(thumb)).isInstanceOf(IOException.class);assertThatThrownBy(()->tx.complete(id,full,thumb,"image/jpeg",40,60,null)).isInstanceOf(ApiProblem.class);assertThat(maintenance.run()).containsEntry("reconciled",0);assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion",Integer.class)).isZero();
    }
    @Test void explicitLateFailureRearmsFinishedTasksButCannotDeleteValidatedImages()throws Exception{
        UUID id=uploaded(product,null,"PRODUCT_IMAGE");tx.beginFinalize(id,false);expire(id);maintenance.run();finishDeletes();String full=key(id,"content.jpg"),thumb=key(id,"thumb.jpg");storage.put(full,png,"image/jpeg");tx.failed(id,full,thumb);assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion WHERE object_key=?",Integer.class,full)).isEqualTo(1);finishDeletes();assertThatThrownBy(()->storage.read(full)).isInstanceOf(IOException.class);
        UUID valid=picture();var m=tx.find(valid);tx.failed(valid,m.objectKey(),m.thumbnailKey());finishDeletes();assertThat(tx.find(valid).state()).isEqualTo("VALIDATED");assertThat(storage.read(m.objectKey())).isNotEmpty();assertThat(storage.read(m.thumbnailKey())).isNotEmpty();
    }
    @Test void archivedValidatedMediaSurvivesHistoricalRawBackfillAndRepeatedSweeps()throws Exception{
        UUID id=picture();var m=tx.find(id);db.update("UPDATE vw_media_upload SET raw_cleanup_enqueued_at=NULL WHERE id=?",id);storage.put("quarantine/"+id,png,"image/png");catalog.archive(store,product);assertThat(maintenance.run()).containsEntry("reconciled",1);assertThat(maintenance.run()).containsEntry("reconciled",0);finishDeletes();assertThatThrownBy(()->storage.read("quarantine/"+id)).isInstanceOf(IOException.class);assertThat(storage.read(m.objectKey())).isNotEmpty();assertThat(storage.read(m.thumbnailKey())).isNotEmpty();assertThat(tx.find(id).state()).isEqualTo("VALIDATED");assertThat(db.queryForObject("SELECT cleanup_enqueued_at IS NULL FROM vw_media_upload WHERE id=?",Boolean.class,id)).isTrue();assertThat(maintenance.run()).containsEntry("reconciled",0);
    }
    @ParameterizedTest @ValueSource(strings={"PREPARING","DELETING"})
    void datasetInFlightIsRecheckedWithoutAcquiringItsRowLock(String state)throws Exception{
        String dataset="protected-dataset";dataset(dataset,"ACTIVE");String full="demo/"+dataset+"/catalog/full.jpg",thumb="demo/"+dataset+"/catalog/thumb.jpg";UUID id=abandoned(dataset,full,thumb);storage.put(full,png,"image/jpeg");assertThat(cleanup.candidates()).contains(id);db.update("UPDATE vw_demo_dataset SET state=? WHERE id=?",state,dataset);
        var pool=Executors.newSingleThreadExecutor();try{new TransactionTemplate(manager).executeWithoutResult(s->{db.queryForObject("SELECT id FROM vw_demo_dataset WHERE id=? FOR UPDATE",String.class,dataset);try{assertThat(pool.submit(()->cleanup.reconcile(id)).get(3,TimeUnit.SECONDS)).isFalse();}catch(Exception e){throw new AssertionError("Cleanup must not wait for a dataset lock",e);}});}finally{pool.shutdownNow();}
        assertThat(tx.find(id).state()).isEqualTo("PROCESSING");assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion",Integer.class)).isZero();assertThat(storage.read(full)).isNotEmpty();assertThat(cleanup.candidates()).doesNotContain(id);
    }
    @Test void explicitDatasetObjectsKeepOwnershipAndNeverInventRuntimeKeys()throws Exception{
        String dataset="owned-active-dataset";dataset(dataset,"ACTIVE");String full="demo/"+dataset+"/catalog/full.jpg",thumb="demo/"+dataset+"/catalog/thumb.jpg";UUID id=abandoned(dataset,full,thumb);assertThat(cleanup.reconcile(id)).isTrue();assertThat(db.queryForList("SELECT object_key FROM vw_object_deletion ORDER BY object_key",String.class)).containsExactlyInAnyOrder(full,thumb);assertThat(db.queryForList("SELECT DISTINCT dataset_id FROM vw_object_deletion",String.class)).containsExactly(dataset);finishDeletes();assertThat(maintenance.run()).containsEntry("reconciled",0);
    }
    @Test void queueOwnershipConflictRollsBackCleanupWithoutReassigningTheObject()throws Exception{
        String dataset="catalog-owner";dataset(dataset,"ACTIVE");String key="demo/catalog-owner/catalog/full.jpg";UUID id=abandoned(dataset,key,null);queue.enqueue(key,"another-owner");assertThatThrownBy(()->cleanup.reconcile(id)).isInstanceOfSatisfying(ApiProblem.class,e->assertThat(e.code).isEqualTo("CATALOG_CLEANUP_CONFLICT"));assertThat(tx.find(id).state()).isEqualTo("PROCESSING");assertThat(db.queryForObject("SELECT cleanup_enqueued_at IS NULL FROM vw_media_upload WHERE id=?",Boolean.class,id)).isTrue();assertThat(db.queryForObject("SELECT dataset_id FROM vw_object_deletion WHERE object_key=?",String.class,key)).isEqualTo("another-owner");assertThat(maintenance.run()).containsEntry("failed",1);
    }
    @Test void liveSharedPointerIsPreservedEvenWhenTheOtherRowIsRetired()throws Exception{
        UUID active=picture();var live=tx.find(active);UUID orphan=abandoned(null,live.objectKey(),live.thumbnailKey());assertThat(cleanup.reconcile(orphan)).isTrue();assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion WHERE object_key IN(?,?)",Integer.class,live.objectKey(),live.thumbnailKey())).isZero();finishDeletes();assertThat(storage.read(live.objectKey())).isNotEmpty();assertThat(storage.read(live.thumbnailKey())).isNotEmpty();
    }
    @Test void livePrivateOutputsPendingSavesAndSourceRawKeysAreNeverCatalogGarbage()throws Exception{
        UUID customer=UUID.randomUUID();db.update("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash) VALUES(?,'CUSTOMER','Private customer','+919123456789','unused-test-hash')",customer);var protectedKeys=new ArrayList<String>();
        for(String state:List.of("PROCESSING","ACTIVE","SAVING","SAVED")){
            UUID id=UUID.randomUUID();String full="private-guard/"+id+"/content.jpg",pending="private-guard/"+id+"/pending.jpg";protectedKeys.addAll(List.of(full,pending));db.update("INSERT INTO vw_private_media(id,owner_id,purpose,state,declared_mime,declared_bytes,object_key,pending_key,cap_expires_at,expires_at) VALUES(?,?,'OUTPUT',?,'image/jpeg',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '1 day')",id,customer,state,png.length,full,pending);UUID orphan=abandoned(null,full,pending);assertThat(cleanup.reconcile(orphan)).isTrue();
        }
        UUID source=UUID.randomUUID();String raw="private-guard/"+source+"/raw.jpg",normalized="private-guard/"+source+"/normalized.jpg";protectedKeys.addAll(List.of(raw,normalized));db.update("INSERT INTO vw_private_media(id,owner_id,purpose,state,declared_mime,declared_bytes,raw_key,object_key,cap_expires_at,expires_at) VALUES(?,?,'SOURCE','ACTIVE','image/jpeg',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '1 day')",source,customer,png.length,raw,normalized);assertThat(cleanup.reconcile(abandoned(null,raw,normalized))).isTrue();
        for(String key:protectedKeys)storage.put(key,png,"image/jpeg");assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion",Integer.class)).isZero();finishDeletes();for(String key:protectedKeys)assertThat(storage.read(key)).isNotEmpty();assertThat(db.queryForObject("SELECT count(*) FROM vw_private_media WHERE owner_id=? AND state NOT IN('DELETED','REJECTED')",Integer.class,customer)).isEqualTo(5);
    }
    @Test void successfulFinalizeQueuesRawInSameTransactionAndRedirectCacheHasExpiryMargin()throws Exception{
        UUID id=picture();assertThat(db.queryForObject("SELECT count(*) FROM vw_object_deletion WHERE object_key=?",Integer.class,"quarantine/"+id)).isEqualTo(1);assertThat(db.queryForObject("SELECT raw_cleanup_enqueued_at IS NOT NULL FROM vw_media_upload WHERE id=?",Boolean.class,id)).isTrue();
        MediaStorage signed=new MediaStorage(){public void put(String k,byte[]b,String t){}public byte[] read(String k){return png;}public void delete(String k){}public Optional<URI> signRead(String k,Duration ttl){assertThat(ttl).isEqualTo(Duration.ofSeconds(300));return Optional.of(URI.create("https://storage.googleapis.com/owned-test/object"));}};
        var service=new MediaService(tx,signed,images,videos,foundation);assertThat(service.read(id,true).getHeaders().getCacheControl()).isEqualTo("no-store");db.update("UPDATE vw_product SET status='PUBLISHED' WHERE id=?",product);var response=service.read(id,true);assertThat(response.getStatusCode().value()).isEqualTo(302);assertThat(response.getHeaders().getCacheControl()).contains("max-age=240","public");
    }
}
