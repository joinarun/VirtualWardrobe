package com.virtualwardrobe.media;

import com.virtualwardrobe.foundation.SafeFailures;
import com.virtualwardrobe.identity.ApiProblem;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Shared durable deletion metadata. The caller owns the business transaction and object authorization. */
@Component
public class ObjectDeletionQueue {
    private final JdbcTemplate jdbc;
    public ObjectDeletionQueue(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public boolean enqueue(String key,String dataset){
        if(key==null)return false;
        // A retained image must never become collateral damage from a stale/legacy shared pointer.
        if(jdbc.queryForObject("SELECT count(*) FROM vw_media_upload WHERE state='VALIDATED' AND (object_key=? OR thumbnail_key=?)",Integer.class,key,key)>0)return false;
        if(jdbc.queryForObject("SELECT count(*) FROM vw_private_media WHERE state NOT IN('DELETED','REJECTED') AND (object_key=? OR pending_key=? OR (purpose='SOURCE' AND raw_key=?))",Integer.class,key,key,key)>0)return false;
        int changed=jdbc.update("INSERT INTO vw_object_deletion(object_key,dataset_id,final_check_at) VALUES(?,?,CURRENT_TIMESTAMP+INTERVAL '10 minutes') ON CONFLICT(object_key) DO UPDATE SET next_attempt_at=LEAST(vw_object_deletion.next_attempt_at,CURRENT_TIMESTAMP),final_check_at=GREATEST(vw_object_deletion.final_check_at,EXCLUDED.final_check_at) WHERE vw_object_deletion.dataset_id IS NOT DISTINCT FROM EXCLUDED.dataset_id",key,dataset);
        if(changed!=1){SafeFailures.record(SafeFailures.Code.CATALOG_CLEANUP_CONFLICT);throw new ApiProblem(409,"CATALOG_CLEANUP_CONFLICT","Media cleanup ownership changed; contact the platform administrator");}return true;
    }
}
