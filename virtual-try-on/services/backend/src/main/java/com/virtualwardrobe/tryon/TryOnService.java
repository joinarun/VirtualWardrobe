package com.virtualwardrobe.tryon;

import com.virtualwardrobe.foundation.*;
import com.virtualwardrobe.identity.*;
import com.virtualwardrobe.media.*;
import java.io.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.http.*;
import org.springframework.stereotype.Service;

/** Orchestration around short metadata transactions; never hold a connection during external I/O. */
@Service
public class TryOnService {
    private final TryOnTransactions tx;private final TryOnSettings settings;private final MediaStorage storage;private final ImageProcessor images;private final TaskDispatcher dispatcher;private final RateLimits rates;private final boolean cloud;
    private final Semaphore uploads=new Semaphore(2,true),processing=new Semaphore(2,true);
    private final Semaphore deletionDrain=new Semaphore(1);
    private static final long DELETE_START_BUDGET_NANOS=TimeUnit.SECONDS.toNanos(2);
    public TryOnService(TryOnTransactions tx,TryOnSettings settings,MediaStorage storage,ImageProcessor images,TaskDispatcher dispatcher,RateLimits rates,FoundationProperties foundation){this.tx=tx;this.settings=settings;this.storage=storage;this.images=images;this.dispatcher=dispatcher;this.rates=rates;this.cloud=foundation.adapterMode().equals("gcp");}
    public Map<String,Object> authorize(Map<String,Object> body){
        rates.check("photo-upload:"+tx.customer().id(),10);var upload=tx.authorizeSource(body);var m=upload.media();
        try{var signed=storage.signUpload(m.rawKey(),m.declaredMime(),m.bytes(),Duration.ofMinutes(5));if(signed.isPresent()){var s=signed.get();return Map.of("uploadId",m.id(),"uploadUrl",s.url(),"method",s.method(),"headers",s.headers(),"expiresAt",s.expiresAt().toString());}
            return Map.of("uploadId",m.id(),"uploadUrl","/api/v1/private-uploads/"+m.id()+"/content","method","PUT","headers",Map.of("Content-Type",m.declaredMime(),"X-Upload-Token",upload.token()),"expiresAt",m.capExpires().toString());
        }catch(IOException e){tx.rejectSource(m.id(),false,cloud);throw new ApiProblem(503,"STORAGE_UNAVAILABLE","Photo storage is temporarily unavailable");}
    }
    public void upload(UUID id,String token,String mime,InputStream input,long contentLength){
        if(cloud)throw ApiProblem.missing();boolean acquired=false;PrivateMedia m=null;
        try{acquired=uploads.tryAcquire(1,TimeUnit.SECONDS);if(!acquired)throw new ApiProblem(429,"UPLOAD_BUSY","Photo uploads are busy; retry shortly");m=tx.claimRaw(id,token,mime==null?"":mime.toLowerCase(Locale.ROOT));if(contentLength>0&&contentLength!=m.bytes())throw ApiProblem.bad("Photo byte count does not match");byte[] bytes=input.readNBytes(Math.toIntExact(m.bytes()+1));if(bytes.length!=m.bytes())throw ApiProblem.bad("Photo byte count does not match");storage.put(m.rawKey(),bytes,m.declaredMime());tx.uploaded(id);
        }catch(ApiProblem e){if(m!=null)tx.rejectSource(id,false,cloud);throw e;}catch(IOException e){if(m!=null)tx.rejectSource(id,false,cloud);throw new ApiProblem(503,"STORAGE_UNAVAILABLE","Photo could not be stored");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiProblem(429,"UPLOAD_BUSY","Photo upload interrupted");}finally{if(acquired)uploads.release();}
    }
    public Map<String,Object> finalizeUpload(UUID id){
        boolean acquired=false;PrivateMedia m=null;String key=null;
        try{acquired=processing.tryAcquire(1,TimeUnit.SECONDS);if(!acquired)throw new ApiProblem(429,"MEDIA_BUSY","Photo validation is busy; retry shortly");m=tx.beginFinalize(id,cloud);if(m.state().equals("ACTIVE"))return source(m);byte[] raw=storage.read(m.rawKey());if(raw.length!=m.bytes())throw ApiProblem.bad("Stored photo byte count does not match");var image=images.process(raw,m.declaredMime());key="source/"+m.owner()+"/"+m.id()+".jpg";storage.put(key,image.image(),"image/jpeg");var done=tx.sourceComplete(id,key,image.width(),image.height());drainDeletes();return source(done);
        }catch(ApiProblem e){if(m!=null){tx.rejectSource(id,e.status==429,cloud);if(e.status!=429&&key!=null){tx.scheduleDelete(key);deleteQuietly(key);}}throw e;}catch(IOException e){if(m!=null)tx.rejectSource(id,false,cloud);if(key!=null){tx.scheduleDelete(key);deleteQuietly(key);}throw new ApiProblem(503,"STORAGE_UNAVAILABLE","Photo could not be validated or stored");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiProblem(429,"MEDIA_BUSY","Photo validation interrupted");}finally{if(acquired)processing.release();}
    }
    private Map<String,Object> source(PrivateMedia m){return Map.of("source",Map.of("id",m.id(),"state","VALIDATED","expiresAt",m.expires().toString()));}
    public Map<String,Object> create(Map<String,Object> body){var job=tx.create(body);dispatch((UUID)job.get("id"));return job;}
    public void dispatch(UUID jobId){for(var row:tx.undispatched())if(jobId.equals(row.get("id"))){int sequence=((Number)row.get("dispatch_sequence")).intValue();try{dispatcher.dispatch(jobId,sequence);tx.dispatched(jobId,sequence);}catch(IOException ignored){/* Durable queued metadata is reconciled by maintenance. */}return;}}
    public void reconcileDispatch(){for(var row:tx.undispatched()){UUID id=(UUID)row.get("id");int sequence=((Number)row.get("dispatch_sequence")).intValue();try{dispatcher.dispatch(id,sequence);tx.dispatched(id,sequence);}catch(IOException ignored){/* Retry the same deterministic delivery identity later. */}}}
    public Map<String,Object> save(UUID id){var save=tx.beginSave(id);if(!save.performCopy())return tx.get(id);var m=save.media();try{byte[] bytes=storage.read(m.objectKey());storage.put(m.pendingKey(),bytes,"image/jpeg");if(!tx.saved(m.id(),m.pendingKey())){deleteQuietly(m.pendingKey());throw ApiProblem.missing();}drainDeletes();return tx.get(id);}catch(IOException e){tx.saveFailed(m.id(),m.pendingKey());deleteQuietly(m.pendingKey());throw new ApiProblem(503,"STORAGE_UNAVAILABLE","Preview could not be saved; retry shortly");}}
    public ResponseEntity<?> read(UUID id,boolean download){var m=tx.readable(id);try{
        if(!download){var signed=storage.signRead(m.objectKey(),Duration.ofMinutes(5));if(signed.isPresent())return ResponseEntity.status(302).location(signed.get()).cacheControl(CacheControl.noStore()).build();}
        var response=ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_JPEG).header("X-Content-Type-Options","nosniff");if(download)response.header("Content-Disposition","attachment; filename=\"virtualwardrobe-preview.jpg\"");return response.body(storage.read(m.objectKey()));
        }catch(IOException e){throw new ApiProblem(503,"STORAGE_UNAVAILABLE","Preview is temporarily unavailable");}}
    public Map<String,Object> get(UUID id){try{tx.expireOwner();return tx.get(id);}catch(ApiProblem denied){if(denied.status==401||denied.status==403)throw ApiProblem.missing();throw denied;}}
    public Map<String,Object> jobs(int page,int size){tx.expireOwner();return tx.jobs(page,size);}
    public void discard(UUID id){tx.discard(id);drainDeletes();}
    public void discardSource(UUID id){tx.discardSource(id);drainDeletes();}
    public void deleteGallery(UUID id){tx.deleteGallery(id);drainDeletes();}
    public Map<String,Object> maintenance(){for(UUID id:tx.expiredJobs())tx.expireJob(id);for(UUID id:tx.expiredMedia())tx.expireMedia(id);for(UUID id:tx.staleSaves())tx.recoverSave(id);reconcileDispatch();int deleted=drainDeletes();return Map.of("status","OK","deletionAttempts",deleted);}
    public int drainDeletes(){
        if(!deletionDrain.tryAcquire())return 0;
        long started=System.nanoTime();int count=0;
        try{
            for(var row:tx.deletionBatch()){
                // Finish an in-flight bounded SDK call, but do not multiply its retry budget by100.
                if(System.nanoTime()-started>=DELETE_START_BUDGET_NANOS)break;
                String key=row.get("object_key").toString();boolean success=false;
                try{storage.delete(key);success=true;}
                catch(IOException ignored){SafeFailures.record(SafeFailures.Code.DEPENDENCY_UNAVAILABLE);}
                tx.deletionFinished(key,success);count++;
            }
            return count;
        }finally{deletionDrain.release();}
    }
    private void deleteQuietly(String key){if(key==null)return;try{storage.delete(key);}catch(IOException ignored){/* Tracked deletion retries remain durable. */}}
}
