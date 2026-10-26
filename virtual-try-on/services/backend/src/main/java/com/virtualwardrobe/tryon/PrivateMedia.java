package com.virtualwardrobe.tryon;

import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;

public record PrivateMedia(UUID id,UUID owner,UUID product,UUID job,String purpose,String state,String declaredMime,long bytes,
 String tokenHash,String rawKey,String objectKey,String pendingKey,Instant capExpires,Instant expires,Instant savedAt) {
    public static final RowMapper<PrivateMedia> MAPPER=(r,n)->new PrivateMedia(r.getObject("id",UUID.class),r.getObject("owner_id",UUID.class),r.getObject("product_id",UUID.class),r.getObject("job_id",UUID.class),r.getString("purpose"),r.getString("state"),r.getString("declared_mime"),r.getLong("declared_bytes"),r.getString("token_hash"),r.getString("raw_key"),r.getString("object_key"),r.getString("pending_key"),r.getTimestamp("cap_expires_at").toInstant(),r.getTimestamp("expires_at")==null?null:r.getTimestamp("expires_at").toInstant(),r.getTimestamp("saved_at")==null?null:r.getTimestamp("saved_at").toInstant());
}
