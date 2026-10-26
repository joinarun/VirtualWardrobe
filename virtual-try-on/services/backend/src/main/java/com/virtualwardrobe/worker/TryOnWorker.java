package com.virtualwardrobe.worker;

import com.virtualwardrobe.ai.*;
import com.virtualwardrobe.foundation.SafeFailures;
import com.virtualwardrobe.media.*;
import com.virtualwardrobe.tryon.*;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;

@Service
public class TryOnWorker {
    private final TryOnTransactions tx;private final TryOnService service;private final ImageProvider provider;private final MediaStorage storage;private final MediaService catalogMedia;private final ImageProcessor images;private final TryOnSettings settings;
    private final Semaphore capacity=new Semaphore(2,true);
    public TryOnWorker(TryOnTransactions tx,TryOnService service,ImageProvider provider,MediaStorage storage,MediaService catalogMedia,ImageProcessor images,TryOnSettings settings){this.tx=tx;this.service=service;this.provider=provider;this.storage=storage;this.catalogMedia=catalogMedia;this.images=images;this.settings=settings;}
    public boolean run(UUID id,int sequence){
        if(!capacity.tryAcquire())return false;TryOnTransactions.Claim claim=null;boolean invoked=false;GenerationResult result=null;
        try{
            claim=tx.claim(id,sequence);if(claim==null)return true;
            byte[] person=images.providerJpeg(storage.read(tx.media(claim.source()).objectKey()));byte[] garment=images.providerJpeg(catalogMedia.referenceBytes(claim.reference()));
            if(!tx.providerStarted(claim))return true;invoked=true;result=provider.generate(new GenerationRequest(person,"image/jpeg",garment,"image/jpeg"));
            if(!result.provider().equals(settings.provider())||!result.model().equals(settings.model())||result.demo()!=settings.mock())throw new ProviderFailure(ProviderFailure.Kind.INVALID_RESPONSE,"Provider metadata did not match the recorded request");
            var normalized=images.process(result.image(),result.mimeType());storage.put(claim.outputKey(),normalized.image(),"image/jpeg");
            if(!tx.succeeded(claim,normalized.image().length,normalized.width(),normalized.height(),result))deleteQuietly(claim.outputKey());return true;
        }catch(ProviderFailure failure){
            SafeFailures.record(switch(failure.kind()) {
                case RETRYABLE -> SafeFailures.Code.PROVIDER_TEMPORARY_FAILURE;
                case UNKNOWN_OUTCOME -> SafeFailures.Code.PROVIDER_UNKNOWN_OUTCOME;
                case REJECTED -> SafeFailures.Code.PROVIDER_REJECTED;
                case INVALID_RESPONSE -> SafeFailures.Code.PROVIDER_RESPONSE_INVALID;
                case CONFIGURATION -> SafeFailures.Code.PROVIDER_CONFIGURATION;
            }, id);
            if(claim!=null){if(tx.failed(claim,failure.kind(),invoked))service.dispatch(id);}return true;
        }catch(IOException|RuntimeException failure){
            if(claim==null){
                if(failure instanceof com.virtualwardrobe.identity.ApiProblem problem&&problem.status==404)return true;
                SafeFailures.record(SafeFailures.Code.WORKER_EXECUTION_FAILURE,id);return false;
            }
            SafeFailures.record(result!=null?SafeFailures.Code.WORKER_RESULT_STORAGE_FAILURE:SafeFailures.Code.WORKER_EXECUTION_FAILURE,id);
            if(result!=null)tx.failedAfterResult(claim,result);else tx.failed(claim,invoked?ProviderFailure.Kind.UNKNOWN_OUTCOME:ProviderFailure.Kind.CONFIGURATION,invoked);return true;
        }
        finally{try{service.drainDeletes();}finally{capacity.release();}}
    }
    private void deleteQuietly(String key){try{storage.delete(key);}catch(IOException ignored){/* Conditional completion already tombstoned and scheduled this key. */}}
}
