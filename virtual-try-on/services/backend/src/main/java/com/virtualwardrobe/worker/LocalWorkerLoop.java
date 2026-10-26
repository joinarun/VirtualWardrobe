package com.virtualwardrobe.worker;

import com.virtualwardrobe.tryon.TryOnService;
import com.virtualwardrobe.enquiries.EnquiryMaintenance;
import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnExpression("'${app.mode}' == 'worker' and '${app.adapter-mode}' == 'local' and '${app.worker.local-loop-enabled:true}' == 'true'")
public class LocalWorkerLoop {
    private final JdbcTemplate jdbc;private final TryOnWorker worker;private final TryOnService service;private final EnquiryMaintenance enquiries;private final ExecutorService executor=Executors.newFixedThreadPool(2);private final Semaphore slots=new Semaphore(2);private final Set<String> localClaims=ConcurrentHashMap.newKeySet();
    public LocalWorkerLoop(JdbcTemplate jdbc,TryOnWorker worker,TryOnService service,EnquiryMaintenance enquiries){this.jdbc=jdbc;this.worker=worker;this.service=service;this.enquiries=enquiries;}
    @Scheduled(fixedDelay=1000)public void deliveries(){for(var row:jdbc.queryForList("SELECT job_id,sequence FROM vw_task_delivery WHERE processed_at IS NULL ORDER BY created_at LIMIT 10")){UUID id=(UUID)row.get("job_id");int sequence=((Number)row.get("sequence")).intValue();String key=id+":"+sequence;if(!slots.tryAcquire())return;if(!localClaims.add(key)){slots.release();continue;}executor.submit(()->{try{if(worker.run(id,sequence))jdbc.update("UPDATE vw_task_delivery SET processed_at=CURRENT_TIMESTAMP WHERE job_id=? AND sequence=?",id,sequence);}finally{localClaims.remove(key);slots.release();}});}}
    @Scheduled(fixedDelay=5000)public void maintenance(){service.maintenance();enquiries.run();}
    @PreDestroy public void stop(){executor.shutdownNow();}
}
