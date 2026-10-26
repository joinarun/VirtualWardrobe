package com.virtualwardrobe.media;

import com.virtualwardrobe.catalog.CatalogService;
import com.virtualwardrobe.identity.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Short metadata transactions only. Never call storage or decode images while holding these locks. */
@Service
public class MediaTransactions {
    public record Reservation(MediaRecord media,String token) { }
    private final JdbcTemplate jdbc;private final IdentityService identity;private final CatalogService catalog;private final MediaLimits limits;
    public MediaTransactions(JdbcTemplate jdbc,IdentityService identity,CatalogService catalog,MediaLimits limits){this.jdbc=jdbc;this.identity=identity;this.catalog=catalog;this.limits=limits;}
    public MediaRecord find(UUID id){return jdbc.query("SELECT * FROM vw_media_upload WHERE id=?",MediaRecord.MAPPER,id).stream().findFirst().orElseThrow(ApiProblem::missing);}
    private void scope(IdentityService.Account actor,MediaRecord media){
        identity.lockAdministration();actor=identity.workforce();
        if(media.storeId()!=null){identity.lockStore(media.storeId());identity.requireStore(actor,media.storeId(),media.purpose().equals("STORE_LOGO"));}
        else if(!actor.superAdmin())throw ApiProblem.forbidden();
        if(media.productId()!=null){catalog.lockProduct(media.storeId(),media.productId());String status=jdbc.queryForObject("SELECT status FROM vw_product WHERE id=?",String.class,media.productId());if(status.equals("ARCHIVED"))throw new ApiProblem(409,"PRODUCT_ARCHIVED","Restore the product to a draft before uploading media");}
        if(media.brandId()!=null){var rows=jdbc.queryForList("SELECT store_id FROM vw_brand WHERE id=?",media.brandId());if(rows.isEmpty()||!Objects.equals(rows.getFirst().get("store_id"),media.storeId()))throw ApiProblem.missing();}
    }
    @Transactional public Reservation authorize(UUID store,UUID product,UUID brand,String purpose,Map<String,Object> body){
        var actor=identity.workforce();String type=Inputs.text(body,"contentType",100).toLowerCase(Locale.ROOT),kind=Inputs.text(body,"kind",10);long bytes;
        try{bytes=new java.math.BigDecimal(body.get("bytes").toString()).longValueExact();}catch(Exception e){throw ApiProblem.bad("A valid file byte count is required");}
        if(!Set.of("IMAGE","VIDEO").contains(kind)||(!purpose.equals("PRODUCT_IMAGE")&&kind.equals("VIDEO")))throw ApiProblem.bad("This target accepts images only");
        if(kind.equals("VIDEO"))purpose="PRODUCT_VIDEO";
        if(kind.equals("IMAGE")&&!Set.of("image/png","image/jpeg","image/webp").contains(type))throw ApiProblem.bad("Upload JPEG, PNG or WebP images");
        if(kind.equals("VIDEO")&&!type.equals("video/mp4"))throw ApiProblem.bad("Upload an MP4 video");
        long limit=kind.equals("VIDEO")?limits.videoBytes():limits.imageBytes();if(bytes<1||bytes>limit)throw new ApiProblem(413,"FILE_TOO_LARGE","File exceeds the allowed size");
        UUID id=UUID.randomUUID();String token=Inputs.secret();int position=0;
        var pending=new MediaRecord(id,actor.id(),store,product,brand,purpose,type,bytes,Inputs.hash(token),"AUTHORIZED","quarantine/"+id,null,null,null,null,null,0,Instant.now().plusSeconds(300));scope(actor,pending);
        if(product!=null){int count=jdbc.queryForObject("SELECT count(*) FROM vw_media_upload WHERE product_id=? AND purpose=? AND state NOT IN('REJECTED','DELETED') AND (state='VALIDATED' OR expires_at>CURRENT_TIMESTAMP)",Integer.class,product,purpose);if(count>=(kind.equals("VIDEO")?1:10))throw new ApiProblem(409,"MEDIA_LIMIT","This product already has the maximum files or pending uploads");position=jdbc.queryForObject("SELECT COALESCE(MAX(position),-1)+1 FROM vw_media_upload WHERE product_id=?",Integer.class,product);}
        jdbc.update("INSERT INTO vw_media_upload(id,owner_id,store_id,product_id,brand_id,purpose,declared_mime,declared_bytes,token_hash,state,object_key,position,expires_at) VALUES(?,?,?,?,?,?,?,?,?,'AUTHORIZED',?,?,?)",id,actor.id(),store,product,brand,purpose,type,bytes,Inputs.hash(token),pending.objectKey(),position,java.sql.Timestamp.from(pending.expiresAt()));
        return new Reservation(find(id),token);
    }
    @Transactional public MediaRecord claimRaw(UUID id,String token,String contentType){
        var media=find(id);if(token==null||!java.security.MessageDigest.isEqual(Inputs.hash(token).getBytes(java.nio.charset.StandardCharsets.US_ASCII),media.tokenHash().getBytes(java.nio.charset.StandardCharsets.US_ASCII)))throw ApiProblem.forbidden();
        if(!media.declaredMime().equals(contentType)||media.expiresAt().isBefore(Instant.now()))throw new ApiProblem(409,"UPLOAD_EXPIRED","Upload authorization expired or does not match this file");
        if(jdbc.update("UPDATE vw_media_upload SET state='UPLOADING' WHERE id=? AND state='AUTHORIZED'",id)!=1)throw new ApiProblem(409,"UPLOAD_USED","This upload capability was already used");return media;
    }
    @Transactional public void uploaded(UUID id){if(jdbc.update("UPDATE vw_media_upload SET state='UPLOADED' WHERE id=? AND state='UPLOADING'",id)!=1)throw new ApiProblem(409,"UPLOAD_CHANGED","Upload state changed");}
    @Transactional public MediaRecord beginFinalize(UUID id,boolean cloud){
        var actor=identity.workforce();var media=find(id);if(!actor.id().equals(media.ownerId()))throw ApiProblem.forbidden();scope(actor,media);
        if(media.state().equals("VALIDATED"))return media;
        if(media.expiresAt().isBefore(Instant.now()))throw new ApiProblem(409,"UPLOAD_EXPIRED","Upload expired; choose the file again");
        String expected=cloud?"AUTHORIZED":"UPLOADED";
        if(jdbc.update("UPDATE vw_media_upload SET state='PROCESSING' WHERE id=? AND state=?",id,expected)!=1)throw new ApiProblem(409,"UPLOAD_NOT_READY","This upload is not ready or is already being processed");return media;
    }
    @Transactional public MediaRecord complete(UUID id,String contentKey,String thumbnailKey,String mime,Integer width,Integer height,Double duration){
        var actor=identity.workforce();var media=find(id);if(!actor.id().equals(media.ownerId()))throw ApiProblem.forbidden();scope(actor,media);
        // An expired processing lease no longer reserves a file slot. It must never attach later.
        if(media.expiresAt().isBefore(Instant.now()))throw new ApiProblem(409,"UPLOAD_EXPIRED","Upload expired during processing; choose the file again");
        if(jdbc.update("UPDATE vw_media_upload SET state='VALIDATED',object_key=?,thumbnail_key=?,normalized_mime=?,width=?,height=?,duration_seconds=? WHERE id=? AND state='PROCESSING'",contentKey,thumbnailKey,mime,width,height,duration,id)!=1)throw new ApiProblem(409,"UPLOAD_CHANGED","Upload state changed before attachment");
        if(media.productId()!=null&&!media.video())jdbc.update("UPDATE vw_product SET cover_media_id=COALESCE(cover_media_id,?),reference_media_id=COALESCE(reference_media_id,?),updated_at=CURRENT_TIMESTAMP WHERE id=?",id,id,media.productId());
        if(media.purpose().equals("STORE_LOGO")){
            jdbc.update("UPDATE vw_media_upload SET state='DELETED' WHERE id=(SELECT logo_media_id FROM vw_store WHERE id=?)",media.storeId());
            jdbc.update("UPDATE vw_store SET logo_media_id=?,logo_url=? WHERE id=?",id,"/api/v1/media/"+id+"/thumbnail",media.storeId());
        }
        if(media.purpose().equals("BRAND_LOGO")){
            jdbc.update("UPDATE vw_media_upload SET state='DELETED' WHERE id=(SELECT logo_media_id FROM vw_brand WHERE id=?)",media.brandId());jdbc.update("UPDATE vw_brand SET logo_media_id=? WHERE id=?",id,media.brandId());
        }
        identity.audit(actor.id(),media.storeId(),"MEDIA_VALIDATED",id);return find(id);
    }
    @Transactional public void reject(UUID id){jdbc.update("UPDATE vw_media_upload SET state='REJECTED' WHERE id=? AND state NOT IN('VALIDATED','DELETED')",id);}
    @Transactional public void retry(UUID id,boolean cloud){jdbc.update("UPDATE vw_media_upload SET state=? WHERE id=? AND state='PROCESSING'",cloud?"AUTHORIZED":"UPLOADED",id);}
    @Transactional public MediaRecord remove(UUID store,UUID product,UUID id){
        var actor=identity.workforce();identity.lockAdministration();identity.lockStore(store);identity.requireStore(actor,store,false);catalog.lockProduct(store,product);
        var media=find(id);if(!product.equals(media.productId())||!store.equals(media.storeId())||!media.state().equals("VALIDATED"))throw ApiProblem.missing();
        String status=jdbc.queryForObject("SELECT status FROM vw_product WHERE id=?",String.class,product);
        if(!media.video()&&status.equals("PUBLISHED")&&jdbc.queryForObject("SELECT count(*) FROM vw_media_upload WHERE product_id=? AND purpose='PRODUCT_IMAGE' AND state='VALIDATED'",Integer.class,product)<=1)throw new ApiProblem(409,"PUBLISHED_IMAGE_REQUIRED","A published product must retain an image");
        jdbc.update("UPDATE vw_media_upload SET state='DELETED' WHERE id=?",id);
        var images=jdbc.queryForList("SELECT id FROM vw_media_upload WHERE product_id=? AND purpose='PRODUCT_IMAGE' AND state='VALIDATED' ORDER BY position,created_at",UUID.class,product);UUID replacement=images.isEmpty()?null:images.getFirst();
        jdbc.update("UPDATE vw_product SET cover_media_id=CASE WHEN cover_media_id=? THEN ? ELSE cover_media_id END,reference_media_id=CASE WHEN reference_media_id=? THEN ? ELSE reference_media_id END,updated_at=CURRENT_TIMESTAMP WHERE id=?",id,replacement,id,replacement,product);
        identity.audit(actor.id(),store,"MEDIA_REMOVED",id);return media;
    }
    public boolean publiclyReadable(MediaRecord media){
        if(!media.state().equals("VALIDATED"))return false;
        if(media.purpose().equals("PRODUCT_IMAGE")||media.purpose().equals("PRODUCT_VIDEO"))return jdbc.queryForObject("SELECT count(*) FROM vw_product p JOIN vw_store s ON s.id=p.store_id WHERE p.id=? AND p.status='PUBLISHED' AND s.status='ACTIVE'",Integer.class,media.productId())>0;
        if(media.purpose().equals("STORE_LOGO"))return jdbc.queryForObject("SELECT count(*) FROM vw_store WHERE id=? AND status='ACTIVE' AND logo_media_id=?",Integer.class,media.storeId(),media.id())>0;
        if(media.purpose().equals("BRAND_LOGO")&&media.brandId()!=null)return jdbc.queryForObject("SELECT count(*) FROM vw_brand b LEFT JOIN vw_store s ON s.id=b.store_id WHERE b.id=? AND b.logo_media_id=? AND (b.store_id IS NULL OR s.status='ACTIVE')",Integer.class,media.brandId(),media.id())>0;return false;
    }
    public void readable(MediaRecord media){
        if(!media.state().equals("VALIDATED")||!Set.of("PRODUCT_IMAGE","PRODUCT_VIDEO","STORE_LOGO","BRAND_LOGO").contains(media.purpose()))throw ApiProblem.missing();if(publiclyReadable(media))return;
        try{var actor=identity.workforce();if(media.storeId()==null){if(!actor.superAdmin())throw ApiProblem.forbidden();}else identity.requireStore(actor,media.storeId(),false);}catch(ApiProblem denied){throw ApiProblem.missing();}
    }
}
