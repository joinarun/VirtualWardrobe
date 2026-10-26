package com.virtualwardrobe.identity;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class RateLimits {
    private final JdbcTemplate jdbc;
    public RateLimits(JdbcTemplate jdbc) {this.jdbc=jdbc;}
    public void check(String key,int maximum) {
        Integer count=jdbc.queryForObject("""
            INSERT INTO vw_rate_limit(key_hash,window_start,attempts) VALUES(?,CURRENT_TIMESTAMP,1)
            ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN vw_rate_limit.window_start < CURRENT_TIMESTAMP-INTERVAL '10 minutes' THEN 1 ELSE vw_rate_limit.attempts+1 END,
            window_start=CASE WHEN vw_rate_limit.window_start < CURRENT_TIMESTAMP-INTERVAL '10 minutes' THEN CURRENT_TIMESTAMP ELSE vw_rate_limit.window_start END RETURNING attempts
            """,Integer.class,Inputs.hash(key));
        if(count!=null && count>maximum) throw new ApiProblem(429,"RATE_LIMITED","Too many attempts. Please try again later.");
    }
}
