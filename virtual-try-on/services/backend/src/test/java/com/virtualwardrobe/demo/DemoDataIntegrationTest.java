package com.virtualwardrobe.demo;

import com.google.gson.Gson;
import com.virtualwardrobe.media.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.sql.DriverManager;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class DemoDataIntegrationTest {
    static final String SCHEMA="demo_test_"+UUID.randomUUID().toString().replace("-","");static final String BASE=System.getenv().getOrDefault("SPRING_DATASOURCE_URL","jdbc:postgresql://localhost:5433/virtualwardrobe");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->BASE+(BASE.contains("?")?"&":"?")+"currentSchema="+SCHEMA);r.add("spring.flyway.schemas",()->SCHEMA);r.add("spring.flyway.default-schema",()->SCHEMA);r.add("app.bootstrap.email",()->"");r.add("app.bootstrap.password",()->"");r.add("app.local-data-directory",()->"work/demo-tests/"+SCHEMA);}
    @Autowired JdbcTemplate db;@Autowired PlatformTransactionManager manager;@TempDir Path temporary;Path assets,credentials;TrackingStorage storage;DemoDataService service;UUID bootstrap;
    static final String DATASET="virtualwardrobe-demo-test";
    @BeforeEach void setup()throws Exception{
        db.execute("TRUNCATE vw_account,vw_store,vw_category,vw_brand,vw_product,vw_media_upload,vw_enquiry,vw_enquiry_event,vw_audit_event,vw_demo_dataset,vw_demo_object,vw_object_deletion,SPRING_SESSION CASCADE");
        bootstrap=UUID.randomUUID();db.update("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash,super_admin) VALUES(?,'WORKFORCE','Existing operator','bootstrap@example.test','unchanged-existing-hash',TRUE)",bootstrap);
        assets=temporary.resolve("assets");Files.createDirectory(assets);var provenance=new ArrayList<Map<String,String>>();var png=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(12,18,BufferedImage.TYPE_INT_RGB),"png",png);
        for(String style:DemoAssets.STYLES){String name="saree-"+style+".png";Files.write(assets.resolve(name),png.toByteArray());provenance.add(Map.of("file",name,"source","Original synthetic test fixture","usage","Owned demo only"));}for(String name:List.of("saree-ruby-detail.png","saree-ruby-back.png")){Files.write(assets.resolve(name),png.toByteArray());provenance.add(Map.of("file",name,"source","Original synthetic test fixture","usage","Owned demo only"));}
        Files.write(assets.resolve("demo-preview.mp4"),getClass().getResourceAsStream("/catalog/valid-2s.mp4").readAllBytes());provenance.add(Map.of("file","demo-preview.mp4","source","Owned video fixture","usage","Owned demo only"));Files.writeString(assets.resolve("provenance.json"),new Gson().toJson(provenance));
        credentials=temporary.resolve("credentials/demo-credentials-test.json");storage=new TrackingStorage();service=new DemoDataService(db,manager,storage,"local");storage.bytes.put("unrelated/keep.jpg",new byte[]{1,2,3});
    }
    @AfterAll static void remove()throws Exception{try(var c=DriverManager.getConnection(BASE,System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"),System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD",""));var s=c.createStatement()){s.execute("DROP SCHEMA "+SCHEMA+" CASCADE");}}
    DemoDataService.Result seed()throws Exception{return service.seed(DATASET,"standard",30,assets,credentials);}
    long count(String table){return db.queryForObject("SELECT count(*) FROM "+table+" WHERE dataset_id=?",Long.class,DATASET);}
    void assertPreserved(){assertThat(db.queryForObject("SELECT password_hash FROM vw_account WHERE id=?",String.class,bootstrap)).isEqualTo("unchanged-existing-hash");assertThat(storage.bytes.get("unrelated/keep.jpg")).containsExactly(1,2,3);}
    @Test void realSeedHasEveryRoleGalleryHistoryAndIdempotentCredentials()throws Exception{
        var result=seed();assertThat(result.state()).isEqualTo("ACTIVE");assertThat(result.counts()).containsEntry("super_admin",3L).containsEntry("store_admin",3L).containsEntry("staff",3L).containsEntry("customer",3L).containsEntry("product",30L).containsEntry("savedPreviews",3L);assertThat(count("vw_store")).isEqualTo(3);assertThat(count("vw_recovery_code")).isEqualTo(24);
        assertThat(db.queryForList("SELECT status FROM vw_enquiry WHERE dataset_id=?",String.class,DATASET)).containsExactlyInAnyOrder("NEW","OPEN","IN_PROGRESS","AWAITING_CUSTOMER_RESPONSE","CUSTOMER_REPLIED","CLOSED");assertThat(db.queryForObject("SELECT COUNT(*) FROM vw_enquiry_event WHERE dataset_id=? AND visibility='INTERNAL'",Long.class,DATASET)).isGreaterThan(5);
        assertThat(db.queryForObject("SELECT duration_seconds FROM vw_media_upload WHERE dataset_id=? AND purpose='PRODUCT_VIDEO'",Double.class,DATASET)).isEqualTo(2.0);assertThat(db.queryForObject("SELECT COUNT(*) FROM vw_product p JOIN vw_media_upload m ON m.id=p.cover_media_id WHERE p.dataset_id=? AND m.thumbnail_key<>m.object_key AND m.width=12 AND m.height=18",Long.class,DATASET)).isEqualTo(30);
        assertThat(db.queryForObject("SELECT count(*) FROM vw_product p JOIN vw_category c ON c.id=p.category_id WHERE p.dataset_id=? AND c.name='Sarees' AND p.status='PUBLISHED'",Long.class,DATASET)).isEqualTo(30);
        int puts=storage.puts;byte[] original=Files.readAllBytes(credentials);String hash=db.queryForObject("SELECT password_hash FROM vw_account WHERE dataset_id=? ORDER BY id LIMIT 1",String.class,DATASET);db.update("UPDATE vw_account SET name='Changed by operator' WHERE id=?",DemoFixtures.id(DATASET,"user:staff:0"));assertThat(seed().changed()).isFalse();assertThat(storage.puts).isEqualTo(puts);assertThat(Files.readAllBytes(credentials)).isEqualTo(original);assertThat(db.queryForObject("SELECT password_hash FROM vw_account WHERE dataset_id=? ORDER BY id LIMIT 1",String.class,DATASET)).isEqualTo(hash);assertThat(db.queryForObject("SELECT name FROM vw_account WHERE id=?",String.class,DemoFixtures.id(DATASET,"user:staff:0"))).isEqualTo("Changed by operator");assertPreserved();
    }
    @Test void partialStorageFailureKeepsPublicDataInactiveAndResumesWithoutDuplicates()throws Exception{
        storage.failPut=4;assertThatThrownBy(this::seed).isInstanceOf(IOException.class);assertThat(service.status(DATASET).state()).isEqualTo("PREPARING");assertThat(count("vw_account")).isEqualTo(12);assertThat(db.queryForObject("SELECT count(*) FROM vw_account WHERE dataset_id=? AND enabled",Long.class,DATASET)).isZero();assertThat(count("vw_category")).isZero();assertThat(count("vw_brand")).isZero();assertThat(db.queryForObject("SELECT count(*) FROM vw_product WHERE dataset_id=? AND status='PUBLISHED'",Long.class,DATASET)).isZero();
        storage.failPut=0;assertThat(seed().state()).isEqualTo("ACTIVE");assertThat(count("vw_product")).isEqualTo(30);assertPreserved();
    }
    @Test void dryRunAndCleanupRemoveOnlyOwnedRecordsAndObjectsAndRetireId()throws Exception{
        seed();var before=service.status(DATASET);int deletes=storage.deletes;var plan=service.cleanup(DATASET,true);assertThat(plan.counts()).isEqualTo(before.counts());assertThat(plan.changed()).isFalse();assertThat(storage.deletes).isEqualTo(deletes);assertThat(service.status(DATASET).state()).isEqualTo("ACTIVE");var result=service.cleanup(DATASET,false);assertThat(result.state()).isEqualTo("DELETED");assertThat(result.counts()).isEqualTo(plan.counts());assertThat(count("vw_account")).isZero();assertThat(storage.bytes.keySet()).containsExactly("unrelated/keep.jpg");assertThat(service.cleanup(DATASET,false).changed()).isFalse();assertThatThrownBy(this::seed).isInstanceOfSatisfying(DemoFailure.class,e->assertThat(e.code).isEqualTo("DEMO_DATASET_RETIRED"));assertPreserved();
    }
    @Test void ordinaryRuntimeIncomingForeignKeyBlocksBeforeAnyMutation()throws Exception{
        seed();UUID store=DemoFixtures.id(DATASET,"store:0");db.update("INSERT INTO vw_membership(id,store_id,account_id,role,state) VALUES(?,?,?,'STAFF','ACTIVE')",UUID.randomUUID(),store,bootstrap);int deletes=storage.deletes;assertThatThrownBy(()->service.cleanup(DATASET,false)).isInstanceOfSatisfying(DemoFailure.class,e->assertThat(e.code).isEqualTo("DEMO_UNSAFE_INCOMING_REFERENCE"));assertThat(service.status(DATASET).state()).isEqualTo("ACTIVE");assertThat(storage.deletes).isEqualTo(deletes);assertThat(db.queryForObject("SELECT count(*) FROM vw_membership WHERE account_id=?",Long.class,bootstrap)).isEqualTo(1);assertPreserved();
    }
    @Test void polymorphicAuditAndSharedObjectReferencesAlsoRefuse()throws Exception{
        seed();UUID event=UUID.randomUUID();db.update("INSERT INTO vw_audit_event(id,actor_id,event_type,subject_id) VALUES(?,?,'RUNTIME_ACTION',?)",event,bootstrap,DemoFixtures.id(DATASET,"product:0"));assertThatThrownBy(()->service.cleanup(DATASET,true)).isInstanceOf(DemoFailure.class);db.update("DELETE FROM vw_audit_event WHERE id=?",event);String key=db.queryForObject("SELECT object_key FROM vw_demo_object WHERE dataset_id=? LIMIT 1",String.class,DATASET);db.update("INSERT INTO vw_object_deletion(object_key,final_check_at) VALUES(?,CURRENT_TIMESTAMP)",key);assertThatThrownBy(()->service.cleanup(DATASET,false)).isInstanceOf(DemoFailure.class);assertThat(storage.deletes).isZero();assertThat(service.status(DATASET).state()).isEqualTo("ACTIVE");
    }
    @Test void partialCleanupCanResumeAndPreservesUnrelatedData()throws Exception{
        seed();var planned=service.cleanup(DATASET,true).counts();storage.failDelete=3;assertThatThrownBy(()->service.cleanup(DATASET,false)).isInstanceOf(IOException.class);assertThat(service.status(DATASET).state()).isEqualTo("DELETING");assertThat(count("vw_account")).isEqualTo(12);storage.failDelete=0;var result=service.cleanup(DATASET,false);assertThat(result.state()).isEqualTo("DELETED");assertThat(result.counts()).isEqualTo(planned);assertPreserved();
    }
    @Test void missingOrChangedCredentialNeverResetsExistingAccounts()throws Exception{
        seed();String hash=db.queryForObject("SELECT password_hash FROM vw_account WHERE dataset_id=? ORDER BY id LIMIT 1",String.class,DATASET);Files.delete(credentials);assertThatThrownBy(this::seed).isInstanceOf(IOException.class);assertThat(db.queryForObject("SELECT password_hash FROM vw_account WHERE dataset_id=? ORDER BY id LIMIT 1",String.class,DATASET)).isEqualTo(hash);assertThat(Files.exists(credentials)).isFalse();
    }
    @Test void identityCollisionRefusesWithoutOverwritingExistingUser()throws Exception{
        var definition=DemoFixtures.definitions(DATASET,"standard").getFirst();db.update("UPDATE vw_account SET normalized_identifier=? WHERE id=?",definition.identifier(),bootstrap);assertThatThrownBy(this::seed).isInstanceOfSatisfying(DemoFailure.class,e->assertThat(e.code).isEqualTo("DEMO_IDENTIFIER_COLLISION"));assertThat(count("vw_account")).isZero();assertThat(service.status(DATASET).state()).isEqualTo("ABSENT");assertPreserved();
    }
    @Test void productionAndWrongProjectRefuseBeforeFilesDatabaseOrStorage()throws Exception{
        assertThatThrownBy(()->new DemoDataService(db,manager,storage,"production").seed(DATASET,"standard",30,assets,credentials)).isInstanceOf(DemoFailure.class);assertThat(Files.exists(credentials)).isFalse();assertThat(storage.puts).isZero();assertThat(service.status(DATASET).state()).isEqualTo("ABSENT");
        assertThatThrownBy(()->DemoMain.run(new String[]{"seed","--dataset",DATASET},Map.of("APP_ENVIRONMENT","demo","APP_ADAPTER_MODE","gcp","APP_GCP_PROJECT","correct-project","SPRING_DATASOURCE_URL","jdbc:postgresql:///?cloudSqlInstance=other-project:region:instance"))).isInstanceOfSatisfying(DemoFailure.class,e->assertThat(e.code).isEqualTo("DEMO_PROJECT_MISMATCH"));
    }
    @Test void separateSmallLoadDatasetIsPublishedAndCleanupPreservesStandard()throws Exception{
        seed();Path load=temporary.resolve("load/demo-credentials-load.json");var result=service.seed("virtualwardrobe-load-test","load",12,assets,load);assertThat(result.counts()).containsEntry("product",12L).containsEntry("store",1L).containsEntry("store_admin",1L);assertThat(db.queryForObject("SELECT count(*) FROM vw_product WHERE dataset_id='virtualwardrobe-load-test' AND status='PUBLISHED'",Long.class)).isEqualTo(12);assertThat(service.cleanup("virtualwardrobe-load-test",false).state()).isEqualTo("DELETED");assertThat(count("vw_product")).isEqualTo(30);assertPreserved();
    }
    @Test void changedAssetDefinitionCannotReuseActiveDataset()throws Exception{
        seed();var image=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(13,18,BufferedImage.TYPE_INT_RGB),"png",image);Files.write(assets.resolve("saree-ruby.png"),image.toByteArray());assertThatThrownBy(this::seed).isInstanceOf(IOException.class);assertThat(service.status(DATASET).state()).isEqualTo("ACTIVE");assertThat(count("vw_product")).isEqualTo(30);
    }
    @Test void lateIncomingReferencePreventsFinalRelationalDeletion()throws Exception{
        seed();UUID event=UUID.randomUUID();storage.beforeDelete=()->{db.update("INSERT INTO vw_audit_event(id,actor_id,event_type,subject_id) VALUES(?,?,'LATE_RUNTIME_ACTION',?)",event,bootstrap,DemoFixtures.id(DATASET,"product:0"));};
        assertThatThrownBy(()->service.cleanup(DATASET,false)).isInstanceOfSatisfying(DemoFailure.class,e->assertThat(e.code).isEqualTo("DEMO_UNSAFE_INCOMING_REFERENCE"));assertThat(service.status(DATASET).state()).isEqualTo("DELETING");assertThat(count("vw_account")).isEqualTo(12);assertThat(db.queryForObject("SELECT count(*) FROM vw_audit_event WHERE id=?",Long.class,event)).isEqualTo(1);
        db.update("DELETE FROM vw_audit_event WHERE id=?",event);assertThat(service.cleanup(DATASET,false).state()).isEqualTo("DELETED");assertPreserved();
    }
    @Test void cleanupRefusesToRemoveLastUsablePlatformAdministrators()throws Exception{
        seed();db.update("UPDATE vw_account SET password_change_required=TRUE WHERE id=?",bootstrap);int deletes=storage.deletes;
        assertThatThrownBy(()->service.cleanup(DATASET,false)).isInstanceOfSatisfying(DemoFailure.class,e->assertThat(e.code).isEqualTo("DEMO_LAST_SUPER_ADMIN"));
        assertThat(service.status(DATASET).state()).isEqualTo("ACTIVE");assertThat(storage.deletes).isEqualTo(deletes);assertThat(db.queryForObject("SELECT count(*) FROM vw_account WHERE dataset_id=? AND enabled AND super_admin",Long.class,DATASET)).isEqualTo(3);
        db.update("UPDATE vw_account SET password_change_required=FALSE WHERE id=?",bootstrap);assertThat(service.cleanup(DATASET,false).state()).isEqualTo("DELETED");assertPreserved();
    }
    @Test void standaloneStatusAndDryRunDoNotMigrateAnEmptySchema()throws Exception{
        String empty="demo_empty_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+empty);try{
            var env=new HashMap<String,String>();env.put("APP_ENVIRONMENT","local");env.put("SPRING_DATASOURCE_URL",BASE+(BASE.contains("?")?"&":"?")+"currentSchema="+empty);env.put("SPRING_DATASOURCE_USERNAME",System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"));env.put("SPRING_DATASOURCE_PASSWORD",System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD",""));
            assertThat(DemoMain.run(new String[]{"status","--dataset",DATASET},env).state()).isEqualTo("ABSENT");assertThat(DemoMain.run(new String[]{"cleanup","--dataset",DATASET,"--dry-run"},env).state()).isEqualTo("ABSENT");assertThat(db.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_schema=?",Long.class,empty)).isZero();assertThat(Files.exists(credentials)).isFalse();assertThat(storage.puts).isZero();
        }finally{db.execute("DROP SCHEMA "+empty+" CASCADE");}
    }
    final class TrackingStorage implements MediaStorage {
        final Map<String,byte[]> bytes=new HashMap<>();int puts,deletes,failPut,failDelete;Runnable beforeDelete;
        public void put(String key,byte[] value,String type)throws IOException{assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();if(++puts==failPut)throw new IOException("Controlled object write failure");bytes.put(key,value);}
        public byte[] read(String key){return bytes.get(key);}
        public void delete(String key)throws IOException{if(beforeDelete!=null){var callback=beforeDelete;beforeDelete=null;callback.run();}assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();if(++deletes==failDelete)throw new IOException("Controlled object delete failure");bytes.remove(key);}
    }
}
