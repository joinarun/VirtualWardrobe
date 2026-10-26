package com.virtualwardrobe.media;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.RowMapper;

public record MediaRecord(UUID id,UUID ownerId,UUID storeId,UUID productId,UUID brandId,String purpose,String declaredMime,long declaredBytes,
                          String tokenHash,String state,String objectKey,String thumbnailKey,String normalizedMime,Integer width,Integer height,Double durationSeconds,int position,Instant expiresAt) {
    public static final RowMapper<MediaRecord> MAPPER=(r,n)->new MediaRecord(r.getObject("id",UUID.class),r.getObject("owner_id",UUID.class),r.getObject("store_id",UUID.class),r.getObject("product_id",UUID.class),r.getObject("brand_id",UUID.class),r.getString("purpose"),r.getString("declared_mime"),r.getLong("declared_bytes"),r.getString("token_hash"),r.getString("state"),r.getString("object_key"),r.getString("thumbnail_key"),r.getString("normalized_mime"),(Integer)r.getObject("width"),(Integer)r.getObject("height"),r.getBigDecimal("duration_seconds")==null?null:r.getBigDecimal("duration_seconds").doubleValue(),r.getInt("position"),r.getTimestamp("expires_at").toInstant());
    public boolean video(){return purpose.equals("PRODUCT_VIDEO");}
    public Map<String,Object> dto(){
        var value=new LinkedHashMap<String,Object>();value.put("id",id);value.put("kind",video()?"VIDEO":"IMAGE");value.put("state",state);value.put("mimeType",normalizedMime);value.put("position",position);
        value.put("url","/api/v1/media/"+id+"/content");if(thumbnailKey!=null)value.put("thumbnailUrl","/api/v1/media/"+id+"/thumbnail");
        if(width!=null)value.put("width",width);if(height!=null)value.put("height",height);if(durationSeconds!=null)value.put("durationSeconds",durationSeconds);return value;
    }
}
