package com.virtualwardrobe.media;

import com.virtualwardrobe.identity.IdentityService;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Catalog cleanup is metadata only. Dataset locks are never taken after administration/store locks. */
@Service
public class CatalogCleanupTransactions {
    private static final Set<String> UNFINISHED=Set.of("AUTHORIZED","UPLOADING","UPLOADED","PROCESSING");
    private final JdbcTemplate jdbc;private final IdentityService identity;private final ObjectDeletionQueue queue;
    public CatalogCleanupTransactions(JdbcTemplate jdbc,IdentityService identity,ObjectDeletionQueue queue){this.jdbc=jdbc;this.identity=identity;this.queue=queue;}
    public List<UUID> candidates(){return jdbc.queryForList("SELECT m.id FROM vw_media_upload m LEFT JOIN vw_demo_dataset d ON d.id=m.dataset_id WHERE COALESCE(d.state,'') NOT IN('PREPARING','DELETING') AND ((m.cleanup_enqueued_at IS NULL AND (m.state IN('DELETED','REJECTED') OR (m.state IN('AUTHORIZED','UPLOADING','UPLOADED','PROCESSING') AND m.expires_at<=CURRENT_TIMESTAMP))) OR (m.state='VALIDATED' AND m.raw_cleanup_enqueued_at IS NULL)) ORDER BY m.created_at,m.id LIMIT 100",UUID.class);}
    private Map<String,Object> locked(UUID id){
        identity.lockAdministration();var first=jdbc.queryForList("SELECT * FROM vw_media_upload WHERE id=?",id);if(first.isEmpty()||protectedDataset(first.getFirst()))return null;
        var row=first.getFirst();if(row.get("store_id")!=null)identity.lockStore((UUID)row.get("store_id"));
        var rows=jdbc.queryForList("SELECT * FROM vw_media_upload WHERE id=? FOR UPDATE",id);if(rows.isEmpty()||protectedDataset(rows.getFirst()))return null;return rows.getFirst();
    }
    private boolean protectedDataset(Map<String,Object> row){
        if(row.get("dataset_id")==null)return false;
        // Deliberately nonlocking: seed/cleanup take dataset -> administration, so reversing it deadlocks.
        var states=jdbc.queryForList("SELECT state FROM vw_demo_dataset WHERE id=?",String.class,row.get("dataset_id"));return !states.isEmpty()&&Set.of("PREPARING","DELETING").contains(states.getFirst());
    }
    private String prefix(Map<String,Object> row){return "catalog/"+Objects.toString(row.get("store_id"),"global")+"/"+row.get("id")+"/";}
    private Set<String> derived(Map<String,Object> row){String prefix=prefix(row);return Set.of(prefix+"content.jpg",prefix+"content.mp4",prefix+"thumb.jpg");}
    private boolean runtime(Map<String,Object> row){String key=Objects.toString(row.get("object_key"),"");return key.equals("quarantine/"+row.get("id"))||derived(row).contains(key);}
    private List<String> enqueueTerminal(Map<String,Object> row,String... attempted){
        var keys=new LinkedHashSet<String>();keys.add((String)row.get("object_key"));keys.add((String)row.get("thumbnail_key"));
        if(runtime(row)){keys.add("quarantine/"+row.get("id"));keys.addAll(derived(row));}
        for(String key:attempted)if(key!=null&&(derived(row).contains(key)||keys.contains(key)))keys.add(key);
        var enqueued=new ArrayList<String>();for(String key:keys)if(queue.enqueue(key,(String)row.get("dataset_id")))enqueued.add(key);
        jdbc.update("UPDATE vw_media_upload SET cleanup_enqueued_at=CURRENT_TIMESTAMP WHERE id=?",row.get("id"));return enqueued;
    }
    private boolean enqueueRaw(Map<String,Object> row){
        if(row.get("raw_cleanup_enqueued_at")!=null)return false;
        if(runtime(row))queue.enqueue("quarantine/"+row.get("id"),(String)row.get("dataset_id"));
        jdbc.update("UPDATE vw_media_upload SET raw_cleanup_enqueued_at=CURRENT_TIMESTAMP WHERE id=?",row.get("id"));return true;
    }
    @Transactional public void completed(UUID id){var row=locked(id);if(row!=null&&row.get("state").equals("VALIDATED"))enqueueRaw(row);}
    @Transactional public void retired(UUID id){var row=locked(id);if(row!=null&&Set.of("DELETED","REJECTED").contains(row.get("state"))&&row.get("cleanup_enqueued_at")==null)enqueueTerminal(row);}
    /** Explicit late callbacks may rearm deletion even after an earlier task finished. Never delete validated output. */
    @Transactional public List<String> failed(UUID id,String... attempted){
        var row=locked(id);if(row==null)return List.of();if(row.get("state").equals("VALIDATED")){enqueueRaw(row);return List.of();}
        if(!row.get("state").equals("DELETED"))jdbc.update("UPDATE vw_media_upload SET state='REJECTED' WHERE id=?",id);
        return enqueueTerminal(row,attempted);
    }
    @Transactional public boolean reconcile(UUID id){
        var row=locked(id);if(row==null)return false;String state=(String)row.get("state");
        if(state.equals("VALIDATED"))return enqueueRaw(row);
        if(row.get("cleanup_enqueued_at")!=null)return false;
        if(UNFINISHED.contains(state)){
            if(((java.sql.Timestamp)row.get("expires_at")).toInstant().isAfter(Instant.now()))return false;
            jdbc.update("UPDATE vw_media_upload SET state='DELETED' WHERE id=? AND state=?",id,state);
        }else if(!Set.of("DELETED","REJECTED").contains(state))return false;
        enqueueTerminal(row);return true;
    }
}
