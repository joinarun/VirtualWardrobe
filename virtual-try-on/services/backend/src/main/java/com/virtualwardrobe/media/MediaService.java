package com.virtualwardrobe.media;

import com.virtualwardrobe.foundation.FoundationProperties;
import com.virtualwardrobe.identity.*;
import java.io.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.http.*;
import org.springframework.stereotype.Service;

@Service
public class MediaService {
    private final MediaTransactions transactions;private final MediaStorage storage;private final ImageProcessor images;private final Mp4Validator videos;private final boolean cloud;
    private final Semaphore processing=new Semaphore(2,true);
    private final Semaphore receiving=new Semaphore(2,true);
    public MediaService(MediaTransactions transactions,MediaStorage storage,ImageProcessor images,Mp4Validator videos,FoundationProperties properties){this.transactions=transactions;this.storage=storage;this.images=images;this.videos=videos;this.cloud=properties.adapterMode().equals("gcp");}
    public Map<String,Object> authorize(UUID store,UUID product,UUID brand,String purpose,Map<String,Object> body){
        var reservation=transactions.authorize(store,product,brand,purpose,body);var media=reservation.media();
        try {
            var signed=storage.signUpload(media.objectKey(),media.declaredMime(),media.declaredBytes(),Duration.ofMinutes(5));
            if(signed.isPresent()){var upload=signed.get();return Map.of("uploadId",media.id(),"uploadUrl",upload.url(),"method",upload.method(),"headers",upload.headers(),"expiresAt",upload.expiresAt().toString());}
            return Map.of("uploadId",media.id(),"uploadUrl","/api/v1/uploads/"+media.id()+"/content","method","PUT","headers",Map.of("Content-Type",media.declaredMime(),"X-Upload-Token",reservation.token()),"expiresAt",media.expiresAt().toString());
        }catch(IOException e){transactions.reject(media.id());throw new ApiProblem(503,"STORAGE_UNAVAILABLE","File storage is temporarily unavailable");}
    }
    public void upload(UUID id,String token,String contentType,InputStream input,long contentLength){
        boolean acquired=false;MediaRecord media=null;
        try {
            acquired=receiving.tryAcquire(1,TimeUnit.SECONDS);if(!acquired)throw new ApiProblem(429,"UPLOAD_BUSY","Uploads are busy; retry shortly");
            media=transactions.claimRaw(id,token,contentType==null?"":contentType.toLowerCase(Locale.ROOT));
            if(contentLength>0&&contentLength!=media.declaredBytes())throw ApiProblem.bad("File byte count does not match its authorization");
            byte[] bytes=input.readNBytes(Math.toIntExact(media.declaredBytes()+1));
            if(bytes.length!=media.declaredBytes())throw ApiProblem.bad("File byte count does not match its authorization");
            storage.put(media.objectKey(),bytes,media.declaredMime());transactions.uploaded(id);
        }catch(ApiProblem p){if(media!=null){fail(media,null,null);}throw p;}
        catch(IOException e){if(media!=null){fail(media,null,null);}throw new ApiProblem(503,"STORAGE_UNAVAILABLE","Upload could not be stored");}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiProblem(429,"UPLOAD_BUSY","Upload was interrupted; retry shortly");}
        finally{if(acquired)receiving.release();}
    }
    public Map<String,Object> finalizeUpload(UUID id){
        boolean acquired=false;MediaRecord media=null;String content=null,thumbnail=null;
        try{
            acquired=processing.tryAcquire(1,TimeUnit.SECONDS);if(!acquired)throw new ApiProblem(429,"MEDIA_BUSY","Media processing is busy; retry shortly");
            media=transactions.beginFinalize(id,cloud);if(media.state().equals("VALIDATED"))return Map.of("media",media.dto());
            byte[] raw=storage.read(media.objectKey());if(raw.length!=media.declaredBytes())throw ApiProblem.bad("Stored file size does not match its authorization");
            String prefix="catalog/"+(media.storeId()==null?"global":media.storeId())+"/"+media.id()+"/";
            Integer width=null,height=null;Double duration=null;String mime;
            if(media.video()){duration=videos.validate(raw).durationSeconds();content=prefix+"content.mp4";mime="video/mp4";storage.put(content,raw,mime);}
            else{var processed=images.process(raw,media.declaredMime());width=processed.width();height=processed.height();content=prefix+"content.jpg";thumbnail=prefix+"thumb.jpg";mime="image/jpeg";storage.put(content,processed.image(),mime);storage.put(thumbnail,processed.thumbnail(),mime);}
            var completed=transactions.complete(id,content,thumbnail,mime,width,height,duration);deleteQuietly(media.objectKey());return Map.of("media",completed.dto());
        }catch(ApiProblem p){
            if(media!=null&&!media.state().equals("VALIDATED")){if(p.status==429)transactions.retry(id,cloud);else fail(media,content,thumbnail);}throw p;
        }catch(IOException e){if(media!=null)fail(media,content,thumbnail);throw new ApiProblem(503,"STORAGE_UNAVAILABLE","Media could not be processed or stored");}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiProblem(429,"MEDIA_BUSY","Media processing was interrupted; retry shortly");}
        finally{if(acquired)processing.release();}
    }
    public ResponseEntity<?> read(UUID id,boolean thumbnail){
        var media=transactions.find(id);transactions.readable(media);String key=thumbnail?media.thumbnailKey():media.objectKey();if(key==null)throw ApiProblem.missing();
        CacheControl cache=transactions.publiclyReadable(media)?CacheControl.maxAge(Duration.ofSeconds(240)).cachePublic():CacheControl.noStore();
        try{
            var signed=storage.signRead(key,Duration.ofMinutes(5));if(signed.isPresent())return ResponseEntity.status(302).location(signed.get()).cacheControl(cache).build();
            return ResponseEntity.ok().cacheControl(cache).contentType(MediaType.parseMediaType(thumbnail?"image/jpeg":media.normalizedMime())).header("X-Content-Type-Options","nosniff").body(storage.read(key));
        }catch(IOException e){throw new ApiProblem(503,"STORAGE_UNAVAILABLE","Media is temporarily unavailable");}
    }
    /** Trusted validated garment bytes for future worker calls; never fetch arbitrary URLs. */
    public byte[] referenceBytes(UUID mediaId)throws IOException{var media=transactions.find(mediaId);if(!media.state().equals("VALIDATED")||!media.purpose().equals("PRODUCT_IMAGE")||media.productId()==null)throw ApiProblem.bad("A validated product image is required");return storage.read(media.objectKey());}
    public void remove(UUID store,UUID product,UUID id){transactions.remove(store,product,id);}
    private void fail(MediaRecord media,String content,String thumbnail){for(String key:transactions.failed(media.id(),content,thumbnail))deleteQuietly(key);}
    private void deleteQuietly(String key){if(key==null)return;try{storage.delete(key);}catch(IOException ignored){/* Durable queue rows retain retries and a final late-write verification. */}}
}
