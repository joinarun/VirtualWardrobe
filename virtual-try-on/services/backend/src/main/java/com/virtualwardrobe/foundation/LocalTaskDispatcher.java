package com.virtualwardrobe.foundation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;

@Component
@ConditionalOnProperty(name="app.adapter-mode",havingValue="local",matchIfMissing=true)
public class LocalTaskDispatcher implements TaskDispatcher {
    private final JdbcTemplate jdbc;
    public LocalTaskDispatcher(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public void dispatch(UUID jobId,int sequence)throws IOException{
        if(sequence<1||sequence>2)throw new IOException("Invalid dispatch sequence");
        try{jdbc.update("INSERT INTO vw_task_delivery(job_id,sequence) VALUES(?,?) ON CONFLICT DO NOTHING",jobId,sequence);}catch(RuntimeException e){throw new IOException("Local delivery could not be persisted");}
    }
}
