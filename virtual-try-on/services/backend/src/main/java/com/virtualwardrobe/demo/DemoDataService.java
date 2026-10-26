package com.virtualwardrobe.demo;

import com.google.gson.Gson;
import com.virtualwardrobe.media.MediaStorage;
import java.io.IOException;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Operator-only dataset lifecycle. All object I/O happens outside database transactions. */
public final class DemoDataService {
    public record Result(int schemaVersion,String command,String datasetId,String profile,String state,boolean changed,boolean dryRun,Map<String,Long> counts,long objects,String credentialsJson,String credentialsText) { }
    private static final List<String> TABLES=List.of("vw_account","vw_store","vw_category","vw_brand","vw_membership","vw_product","vw_media_upload","vw_tryon_consent","vw_private_media","vw_tryon_job","vw_tryon_attempt","vw_enquiry","vw_enquiry_event","vw_recovery_code","vw_audit_event");
    private static final List<String> DELETE_ORDER=List.of("vw_enquiry_event","vw_enquiry","vw_audit_event","vw_recovery_code","vw_membership","vw_tryon_attempt","vw_tryon_job","vw_private_media","vw_tryon_consent","vw_media_upload","vw_product","vw_brand","vw_category","vw_store","vw_account");
    private final JdbcTemplate db;private final TransactionTemplate tx;private final MediaStorage storage;private final String environment;
    public DemoDataService(JdbcTemplate db,PlatformTransactionManager manager,MediaStorage storage,String environment){this.db=db;this.tx=new TransactionTemplate(manager);this.storage=storage;this.environment=environment;}
    public static void guardEnvironment(String environment){if(!Set.of("local","demo").contains(environment))throw new DemoFailure("DEMO_ENVIRONMENT_REFUSED");}
    private void guard(String dataset){guardEnvironment(environment);if(dataset==null||!dataset.matches("[a-z][a-z0-9-]{2,49}"))throw new DemoFailure("DEMO_DATASET_INVALID");}
    private boolean schema(){return db.queryForObject("SELECT to_regclass('vw_demo_dataset') IS NOT NULL",Boolean.class);}
    private Map<String,Object> dataset(String id){var rows=db.queryForList("SELECT * FROM vw_demo_dataset WHERE id=?",id);return rows.isEmpty()?null:rows.getFirst();}
    public Result status(String id){guard(id);if(!schema())return absent("status",id,false);return receipt("status",id,false,false,null);}
    public Result seed(String id,String profile,int count,Path assetsDirectory,Path credentialsPath)throws IOException{
        guard(id);if(!Set.of("standard","load").contains(profile)||(profile.equals("standard")&&count!=30)||count<1||count>2000)throw new DemoFailure("DEMO_PROFILE_INVALID");
        Map<String,Object> previous=dataset(id);if(previous!=null&&Set.of("DELETING","DELETED").contains(previous.get("state")))throw new DemoFailure("DEMO_DATASET_RETIRED");
        DemoAssets assets=DemoAssets.load(assetsDirectory,profile,count);var credentials=DemoCredentials.loadOrCreate(credentialsPath,id,profile,assets.fingerprint,DemoFixtures.definitions(id,profile),previous!=null);
        if(previous!=null){matches(previous,profile,count,assets.fingerprint,credentials.digest());if(previous.get("state").equals("ACTIVE"))return receipt("seed",id,false,false,null);}
        var plan=DemoFixtures.build(id,profile,count,credentials,assets);UUID lease=UUID.randomUUID();
        tx.executeWithoutResult(s->{var current=lockDataset(id);if(current==null){
            for(var u:credentials.users())if(db.queryForObject("SELECT COUNT(*) FROM vw_account WHERE kind=? AND normalized_identifier=?",Long.class,u.kind(),u.identifier())>0)throw new DemoFailure("DEMO_IDENTIFIER_COLLISION");
            db.update("INSERT INTO vw_demo_dataset(id,profile,fingerprint,credential_digest,credentials_json,credentials_text,state,target_products,lease_token,lease_expires_at) VALUES(?,?,?,?,?,?,'PREPARING',?,?,CURRENT_TIMESTAMP+INTERVAL '10 minutes')",id,profile,assets.fingerprint,credentials.digest(),credentials.jsonPath().toString(),credentials.textPath().toString(),count,lease);
            insertPlan(plan,false);for(var object:plan.objects())db.update("INSERT INTO vw_demo_object(object_key,dataset_id,content_hash,content_type,bytes) VALUES(?,?,?,?,?)",object.key(),id,object.digest(),object.mime(),object.bytes().length);
        }else{matches(current,profile,count,assets.fingerprint,credentials.digest());if(!current.get("state").equals("PREPARING"))throw new DemoFailure("DEMO_STATE_CONFLICT");claimLease(id,lease);}});
        try{
            Set<String> stored=new HashSet<>(db.queryForList("SELECT object_key FROM vw_demo_object WHERE dataset_id=? AND state='STORED'",String.class,id));
            for(var object:plan.objects())if(!stored.contains(object.key())){renew(id,lease);storage.put(object.key(),object.bytes(),object.mime());db.update("UPDATE vw_demo_object SET state='STORED',updated_at=CURRENT_TIMESTAMP WHERE dataset_id=? AND object_key=?",id,object.key());}
            tx.executeWithoutResult(s->{requireLease(id,lease,"PREPARING");administrationGuard();if(db.queryForObject("SELECT COUNT(*) FROM vw_demo_object WHERE dataset_id=? AND state<>'STORED'",Long.class,id)>0)throw new DemoFailure("DEMO_OBJECTS_INCOMPLETE");activate(plan);db.update("UPDATE vw_demo_dataset SET state='ACTIVE',activated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,lease_token=NULL,lease_expires_at=NULL WHERE id=?",id);});
            return receipt("seed",id,true,false,null);
        }finally{release(id,lease);}
    }
    private void matches(Map<String,Object> d,String profile,int count,String fingerprint,String digest){if(!profile.equals(d.get("profile"))||((Number)d.get("target_products")).intValue()!=count||!fingerprint.equals(d.get("fingerprint"))||!digest.equals(d.get("credential_digest")))throw new DemoFailure("DEMO_DEFINITION_CHANGED");}
    private Map<String,Object> lockDataset(String id){var rows=db.queryForList("SELECT * FROM vw_demo_dataset WHERE id=? FOR UPDATE",id);return rows.isEmpty()?null:rows.getFirst();}
    private void claimLease(String id,UUID token){if(db.update("UPDATE vw_demo_dataset SET lease_token=?,lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '10 minutes',updated_at=CURRENT_TIMESTAMP WHERE id=? AND (lease_token IS NULL OR lease_expires_at<CURRENT_TIMESTAMP)",token,id)!=1)throw new DemoFailure("DEMO_OPERATION_BUSY");}
    private void requireLease(String id,UUID token,String state){var d=lockDataset(id);if(d==null||!token.equals(d.get("lease_token"))||!state.equals(d.get("state")))throw new DemoFailure("DEMO_LEASE_LOST");}
    private void renew(String id,UUID token){if(db.update("UPDATE vw_demo_dataset SET lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '10 minutes' WHERE id=? AND lease_token=?",id,token)!=1)throw new DemoFailure("DEMO_LEASE_LOST");}
    private void release(String id,UUID token){db.update("UPDATE vw_demo_dataset SET lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?",id,token);}
    private void administrationGuard(){db.queryForObject("SELECT id FROM vw_administration_guard WHERE id=1 FOR UPDATE",Integer.class);}
    private LinkedHashMap<String,Object> staged(DemoFixtures.Row row){var v=new LinkedHashMap<>(row.values());switch(row.table()){
        case "vw_account"->v.put("enabled",false);
        case "vw_store"->{v.put("status","PENDING");v.put("logo_media_id",null);v.put("logo_url",null);}
        case "vw_product"->{v.put("status","DRAFT");for(String c:List.of("category_id","brand_id","cover_media_id","reference_media_id"))v.put(c,null);}
        case "vw_media_upload"->{v.put("state","PROCESSING");v.put("brand_id",null);}
        case "vw_private_media"->{v.put("job_id",null);if(v.get("purpose").equals("OUTPUT"))v.put("state","PROCESSING");}
        case "vw_tryon_job"->v.put("output_id",null);
        default->{} }return v;}
    private void insertPlan(DemoFixtures.Plan plan,boolean ignored){for(String table:TABLES)if(!table.equals("vw_category")&&!table.equals("vw_brand")){Map<String,List<Object[]>> groups=new LinkedHashMap<>();for(var row:plan.rows())if(row.table().equals(table)){var v=staged(row);String sql="INSERT INTO "+table+"("+String.join(",",v.keySet())+") VALUES("+String.join(",",Collections.nCopies(v.size(),"?"))+")";groups.computeIfAbsent(sql,k->new ArrayList<>()).add(v.values().toArray());}groups.forEach((sql,params)->db.batchUpdate(sql,params));}}
    private void insert(String table,LinkedHashMap<String,Object> values){String columns=String.join(",",values.keySet()),marks=String.join(",",Collections.nCopies(values.size(),"?"));db.update("INSERT INTO "+table+"("+columns+") VALUES("+marks+")",values.values().toArray());}
    private void activate(DemoFixtures.Plan plan){
        for(String table:List.of("vw_category","vw_brand"))for(var row:plan.rows())if(row.table().equals(table))insert(table,row.values());
        Map<String,List<Object[]>> groups=new LinkedHashMap<>();
        for(var row:plan.rows())if(Set.of("vw_account","vw_store","vw_product","vw_media_upload","vw_private_media","vw_tryon_job").contains(row.table())){
            var stage=staged(row);var values=new LinkedHashMap<String,Object>();row.values().forEach((k,v)->{if(!Objects.equals(v,stage.get(k)))values.put(k,v);});if(values.isEmpty())continue;
            String sql="UPDATE "+row.table()+" SET "+String.join(",",values.keySet().stream().map(k->k+"=?").toList())+" WHERE id=?";var params=new ArrayList<>(values.values());params.add(row.values().get("id"));groups.computeIfAbsent(sql,k->new ArrayList<>()).add(params.toArray());
        }groups.forEach((sql,params)->db.batchUpdate(sql,params));
    }

    public Result cleanup(String id,boolean dryRun)throws IOException{
        guard(id);if(!schema()||dataset(id)==null)return absent("cleanup",id,dryRun);Map<String,Object> before=dataset(id);if(before.get("state").equals("DELETED"))return receipt("cleanup",id,false,dryRun,null);
        UUID lease=UUID.randomUUID();Map<String,Long> counts=tx.execute(s->{var d=lockDataset(id);administrationGuard();db.queryForList("SELECT id FROM vw_store WHERE dataset_id=? ORDER BY id FOR UPDATE",id);checkIncoming(id);checkLastSuperAdmin(id);var c=d.get("state").equals("DELETING")&&d.get("cleanup_counts")!=null?storedCounts(d.get("cleanup_counts").toString()):counts(id);if(!dryRun){claimLease(id,lease);if(!d.get("state").equals("DELETING"))db.update("UPDATE vw_demo_dataset SET state='DELETING',cleanup_counts=?::jsonb WHERE id=?",new Gson().toJson(c),id);hide(id);}return c;});
        if(dryRun)return receipt("cleanup",id,false,true,counts);
        try{
            for(String key:db.queryForList("SELECT object_key FROM vw_demo_object WHERE dataset_id=? AND state<>'DELETED' ORDER BY object_key",String.class,id)){renew(id,lease);storage.delete(key);db.update("UPDATE vw_demo_object SET state='DELETED',updated_at=CURRENT_TIMESTAMP WHERE object_key=? AND dataset_id=?",key,id);}
            tx.executeWithoutResult(s->{requireLease(id,lease,"DELETING");administrationGuard();checkIncoming(id);for(String sql:List.of("UPDATE vw_store SET logo_media_id=NULL WHERE dataset_id=?","UPDATE vw_brand SET logo_media_id=NULL WHERE dataset_id=?","UPDATE vw_product SET cover_media_id=NULL,reference_media_id=NULL WHERE dataset_id=?","UPDATE vw_private_media SET job_id=NULL WHERE dataset_id=?","UPDATE vw_tryon_job SET output_id=NULL,garment_media_id=NULL WHERE dataset_id=?","UPDATE vw_category SET parent_id=NULL WHERE dataset_id=?"))db.update(sql,id);
                for(String table:DELETE_ORDER)db.update("DELETE FROM "+table+" WHERE dataset_id=?",id);db.update("UPDATE vw_demo_dataset SET state='DELETED',deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,lease_token=NULL,lease_expires_at=NULL WHERE id=?",id);});
            return receipt("cleanup",id,true,false,counts);
        }finally{release(id,lease);}
    }
    private Map<String,Long> storedCounts(String json){var result=new LinkedHashMap<String,Long>();com.google.gson.JsonParser.parseString(json).getAsJsonObject().entrySet().forEach(e->result.put(e.getKey(),e.getValue().getAsLong()));return result;}
    private void checkLastSuperAdmin(String id){
        long owned=db.queryForObject("SELECT count(*) FROM vw_account WHERE dataset_id=? AND super_admin AND enabled AND deleted_at IS NULL",Long.class,id);
        long usable=db.queryForObject("SELECT count(*) FROM vw_account WHERE dataset_id IS DISTINCT FROM ? AND super_admin AND enabled AND NOT password_change_required AND deleted_at IS NULL",Long.class,id);
        if(owned>0&&usable==0)throw new DemoFailure("DEMO_LAST_SUPER_ADMIN");
    }
    private void hide(String id){db.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME IN(SELECT id::text FROM vw_account WHERE dataset_id=?)",id);db.update("UPDATE vw_account SET enabled=FALSE,credential_version=credential_version+1 WHERE dataset_id=?",id);db.update("UPDATE vw_product SET status='ARCHIVED' WHERE dataset_id=?",id);db.update("UPDATE vw_store SET status='ARCHIVED' WHERE dataset_id=?",id);db.update("UPDATE vw_media_upload SET state='DELETED' WHERE dataset_id=?",id);db.update("UPDATE vw_private_media SET state='DELETED' WHERE dataset_id=?",id);}
    private void checkIncoming(String id){
        // Discover actual FK boundaries, including later migrations. Never assume all incoming rows are ours.
        var fks=db.queryForList("SELECT c.relname child,p.relname parent,ca.attname child_col,pa.attname parent_col FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class p ON p.oid=f.confrelid JOIN LATERAL unnest(f.conkey,f.confkey) AS k(ca,pa) ON true JOIN pg_attribute ca ON ca.attrelid=c.oid AND ca.attnum=k.ca JOIN pg_attribute pa ON pa.attrelid=p.oid AND pa.attnum=k.pa WHERE f.contype='f' AND n.nspname=current_schema()");
        for(var fk:fks){String child=(String)fk.get("child"),parent=(String)fk.get("parent");if(!TABLES.contains(parent)||child.equals("vw_demo_object"))continue;String cc=(String)fk.get("child_col"),pc=(String)fk.get("parent_col");boolean owned=TABLES.contains(child);String sql="SELECT COUNT(*) FROM "+child+" c JOIN "+parent+" p ON c."+cc+"=p."+pc+" WHERE p.dataset_id=?"+(owned?" AND c.dataset_id IS DISTINCT FROM ?":"");Long found=owned?db.queryForObject(sql,Long.class,id,id):db.queryForObject(sql,Long.class,id);if(found>0)throw new DemoFailure("DEMO_UNSAFE_INCOMING_REFERENCE");}
        String ids=String.join(" UNION ALL ",TABLES.stream().filter(t->!Set.of("vw_tryon_attempt","vw_enquiry_event").contains(t)).map(t->"SELECT id FROM "+t+" WHERE dataset_id=?").toList());var args=new ArrayList<Object>();args.add(id);for(int i=0;i<TABLES.size()-2;i++)args.add(id);if(db.queryForObject("SELECT COUNT(*) FROM vw_audit_event WHERE dataset_id IS DISTINCT FROM ? AND subject_id IN("+ids+")",Long.class,args.toArray())>0)throw new DemoFailure("DEMO_UNSAFE_INCOMING_REFERENCE");
        for(String sql:List.of("SELECT COUNT(*) FROM vw_media_upload m JOIN vw_demo_object o ON (m.object_key=o.object_key OR m.thumbnail_key=o.object_key) WHERE o.dataset_id=? AND m.dataset_id IS DISTINCT FROM ?","SELECT COUNT(*) FROM vw_private_media m JOIN vw_demo_object o ON (m.object_key=o.object_key OR m.raw_key=o.object_key OR m.pending_key=o.object_key) WHERE o.dataset_id=? AND m.dataset_id IS DISTINCT FROM ?","SELECT COUNT(*) FROM vw_object_deletion m JOIN vw_demo_object o USING(object_key) WHERE o.dataset_id=? AND m.dataset_id IS DISTINCT FROM ?"))if(db.queryForObject(sql,Long.class,id,id)>0)throw new DemoFailure("DEMO_UNSAFE_INCOMING_REFERENCE");
    }
    private Map<String,Long> counts(String id){var out=new LinkedHashMap<String,Long>();for(String table:TABLES)out.put(table.substring(3),db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE dataset_id=?",Long.class,id));for(String role:List.of("SUPER_ADMIN","STORE_ADMIN","STAFF","CUSTOMER")){String where=role.equals("CUSTOMER")?"kind='CUSTOMER'":role.equals("SUPER_ADMIN")?"super_admin":"NOT super_admin AND kind='WORKFORCE' AND EXISTS(SELECT 1 FROM vw_membership m WHERE m.account_id=vw_account.id AND m.role='"+role+"')";out.put(role.toLowerCase(Locale.ROOT),db.queryForObject("SELECT COUNT(*) FROM vw_account WHERE dataset_id=? AND "+where,Long.class,id));}out.put("savedPreviews",db.queryForObject("SELECT COUNT(*) FROM vw_private_media WHERE dataset_id=? AND state='SAVED'",Long.class,id));return out;}
    private Result absent(String command,String id,boolean dry){return new Result(1,command,id,null,"ABSENT",false,dry,Map.of(),0,null,null);}
    private Result receipt(String command,String id,boolean changed,boolean dry,Map<String,Long> override){var d=dataset(id);if(d==null)return absent(command,id,dry);return new Result(1,command,id,(String)d.get("profile"),(String)d.get("state"),changed,dry,override==null?counts(id):override,db.queryForObject("SELECT COUNT(*) FROM vw_demo_object WHERE dataset_id=?",Long.class,id),(String)d.get("credentials_json"),(String)d.get("credentials_text"));}
}
