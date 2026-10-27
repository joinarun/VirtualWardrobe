package com.virtualwardrobe.tryon;

import com.google.gson.*;
import com.google.gson.reflect.TypeToken;
import com.virtualwardrobe.ai.*;
import com.virtualwardrobe.identity.*;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Metadata transactions only: storage and providers must be invoked by the orchestration layer. */
@Service
public class TryOnTransactions {
    public record Upload(PrivateMedia media,String token) { }
    public record Claim(UUID job,UUID owner,UUID source,UUID reference,UUID output,String outputKey,int sequence,UUID token) { }
    public record Save(PrivateMedia media,boolean performCopy) { }
    private final JdbcTemplate jdbc;private final IdentityService identity;private final TryOnSettings settings;private final Gson json=new Gson();
    public TryOnTransactions(JdbcTemplate jdbc,IdentityService identity,TryOnSettings settings){this.jdbc=jdbc;this.identity=identity;this.settings=settings;}
    private UUID id(Map<String,Object> row,String key){return(UUID)row.get(key);}
    private String text(Map<String,Object> row,String key){return Objects.toString(row.get(key),"");}
    private int number(Map<String,Object> row,String key){return((Number)row.get(key)).intValue();}
    private Instant time(Map<String,Object> row,String key){return row.get(key)==null?null:((Timestamp)row.get(key)).toInstant();}
    private boolean deleted(Map<String,Object> job){return job.get("deleted_at")!=null;}
    private boolean active(Map<String,Object> job){return Set.of("QUEUED","RUNNING").contains(text(job,"state"));}
    public IdentityService.Account customer(){var a=identity.current();if(!a.kind().equals("CUSTOMER"))throw ApiProblem.missing();return a;}
    private void lockOwner(UUID owner){if(jdbc.query("SELECT id FROM vw_account WHERE id=? FOR UPDATE",(r,n)->r.getObject(1),owner).isEmpty())throw ApiProblem.missing();}
    private UUID ownerLock(){UUID owner=customer().id();lockOwner(owner);if(!customer().id().equals(owner))throw ApiProblem.missing();return owner;}
    public PrivateMedia media(UUID id){return jdbc.query("SELECT * FROM vw_private_media WHERE id=?",PrivateMedia.MAPPER,id).stream().findFirst().orElseThrow(ApiProblem::missing);}
    private PrivateMedia ownedMedia(UUID id){var m=media(id);if(!m.owner().equals(customer().id()))throw ApiProblem.missing();return m;}
    private Map<String,Object> row(UUID id,boolean lock){var rows=jdbc.queryForList("SELECT * FROM vw_tryon_job WHERE id=?"+(lock?" FOR UPDATE":""),id);if(rows.isEmpty())throw ApiProblem.missing();return rows.getFirst();}
    private LocalDate day(Map<String,Object> job){return((java.sql.Date)job.get("quota_day")).toLocalDate();}
    private void lockDay(LocalDate day){jdbc.update("INSERT INTO vw_generation_day(day) VALUES(?) ON CONFLICT DO NOTHING",day);jdbc.queryForObject("SELECT day FROM vw_generation_day WHERE day=? FOR UPDATE",java.sql.Date.class,day);}
    private Map<String,Object> lockedJob(UUID id){var initial=row(id,false);lockOwner(id(initial,"owner_id"));lockDay(day(initial));return row(id,true);}
    private Map<String,Object> ownedJob(UUID jobId,boolean includeDeleted){var initial=row(jobId,false);UUID owner=customer().id();if(!owner.equals(id(initial,"owner_id")))throw ApiProblem.missing();var job=lockedJob(jobId);if(!includeDeleted&&deleted(job))throw ApiProblem.missing();return job;}
    private Map<String,Object> eligibleProduct(UUID product){
        var rows=jdbc.queryForList("SELECT p.*,s.name AS store_name,s.status AS store_status FROM vw_product p JOIN vw_store s ON s.id=p.store_id WHERE p.id=?",product);
        if(rows.isEmpty())throw ApiProblem.missing();var p=rows.getFirst();
        if(!text(p,"status").equals("PUBLISHED")||!text(p,"store_status").equals("ACTIVE")||!text(p,"availability").equals("AVAILABLE")||!Boolean.TRUE.equals(p.get("try_on_enabled")))throw new ApiProblem(409,"PRODUCT_UNAVAILABLE","This product is currently unavailable for try-on");
        if(p.get("reference_media_id")==null||jdbc.queryForObject("SELECT count(*) FROM vw_media_upload WHERE id=? AND product_id=? AND purpose='PRODUCT_IMAGE' AND state='VALIDATED'",Integer.class,p.get("reference_media_id"),product)!=1)throw new ApiProblem(409,"PRODUCT_REFERENCE_UNAVAILABLE","The store must provide a validated garment reference");return p;
    }
    private Map<String,Object> snapshot(Map<String,Object> p){return Map.of("id",p.get("id"),"title",p.get("title"),"sku",p.get("sku"),"storeId",p.get("store_id"),"storeName",p.get("store_name"),"price",((BigDecimal)p.get("price")).toPlainString(),"currency","INR");}
    private void reserve(LocalDate day,BigDecimal amount,boolean request){
        var usage=jdbc.queryForMap("SELECT * FROM vw_generation_day WHERE day=?",day);
        if(request&&number(usage,"accepted_requests")>=settings.globalDaily)throw new ApiProblem(429,"GLOBAL_DAILY_LIMIT","Generation is full for today; try again after the UTC reset");
        if(((BigDecimal)usage.get("reserved_usd")).add((BigDecimal)usage.get("committed_usd")).add(amount).compareTo(settings.dailyBudget)>0)throw new ApiProblem(429,"PROVIDER_BUDGET_LIMIT","Today's provider budget is fully reserved");
        jdbc.update("UPDATE vw_generation_day SET reserved_usd=reserved_usd+?,accepted_requests=accepted_requests+? WHERE day=?",amount,request?1:0,day);
    }
    @Transactional public Upload authorizeSource(Map<String,Object> body){
        settings.requireEnabled();UUID owner=ownerLock(),product=Inputs.id(Inputs.text(body,"productId",40));eligibleProduct(product);
        String basis=requestBasis(body);boolean legacy=basis.equals("LEGACY_ATTESTATION");
        String mime=Inputs.text(body,"contentType",100).toLowerCase(Locale.ROOT);if(!Set.of("image/jpeg","image/png").contains(mime))throw ApiProblem.bad("Upload one JPEG or PNG photo");long bytes;
        try{bytes=new BigDecimal(body.get("bytes").toString()).longValueExact();}catch(Exception e){throw ApiProblem.bad("A valid file size is required");}
        if(bytes<1||bytes>10*1024*1024)throw new ApiProblem(413,"FILE_TOO_LARGE","Photo must be no larger than 10 MiB");
        int pending=jdbc.queryForObject("SELECT count(*) FROM vw_private_media WHERE owner_id=? AND purpose='SOURCE' AND job_id IS NULL AND state NOT IN('DELETED','REJECTED') AND expires_at>CURRENT_TIMESTAMP AND (state='ACTIVE' OR cap_expires_at>CURRENT_TIMESTAMP)",Integer.class,owner);
        if(pending>=3)throw new ApiProblem(429,"SOURCE_UPLOAD_LIMIT","Discard unused photo uploads before starting another");
        UUID consentId=UUID.randomUUID(),id=UUID.randomUUID();String token=Inputs.secret();
        Boolean attestation=legacy?Boolean.TRUE:null;
        jdbc.update("INSERT INTO vw_tryon_consent(id,owner_id,version,provider,model,location,notice,request_basis,adult,own_photo,provider_processing) VALUES(?,?,?,?,?,?,?,?,?,?,?)",consentId,owner,legacy?settings.version():settings.processingVersion(),settings.provider(),settings.model(),settings.location(),legacy?settings.consentNotice():settings.processingNotice(),basis,attestation,attestation,attestation);
        jdbc.update("INSERT INTO vw_private_media(id,owner_id,product_id,consent_id,purpose,state,declared_mime,declared_bytes,token_hash,raw_key,object_key,cap_expires_at,expires_at) VALUES(?,?,?,?,'SOURCE','AUTHORIZED',?,?,?,?,?,CURRENT_TIMESTAMP+INTERVAL '5 minutes',CURRENT_TIMESTAMP+INTERVAL '24 hours')",id,owner,product,consentId,mime,bytes,Inputs.hash(token),"uploads/private/"+owner+"/"+id,"source/"+owner+"/"+id+".jpg");
        return new Upload(media(id),token);
    }
    private String requestBasis(Map<String,Object> body){
        boolean action=body.containsKey("processingRequest"),legacy=body.containsKey("consent");
        if(action==legacy||body.containsKey("adult")||body.containsKey("ownPhoto")||body.containsKey("providerProcessing"))throw requestChanged();
        if(action){
            if(!(body.get("processingRequest") instanceof Map<?,?> request)||!request.keySet().equals(Set.of("version","action"))||!settings.processingVersion().equals(request.get("version"))||!"TRY_ON".equals(request.get("action")))throw requestChanged();
            return "USER_ACTION";
        }
        if(!(body.get("consent") instanceof Map<?,?> consent)||!settings.version().equals(consent.get("version"))||!Boolean.TRUE.equals(consent.get("adult"))||!Boolean.TRUE.equals(consent.get("ownPhoto"))||!Boolean.TRUE.equals(consent.get("providerProcessing")))throw requestChanged();
        return "LEGACY_ATTESTATION";
    }
    private ApiProblem requestChanged(){return new ApiProblem(409,"CONSENT_UPDATED","Preview request settings changed; choose your photo again");}
    private boolean validRequestSnapshot(Map<String,Object> receipt){
        if(!settings.provider().equals(receipt.get("provider"))||!settings.model().equals(receipt.get("model"))||!settings.location().equals(receipt.get("location")))return false;
        return switch(Objects.toString(receipt.get("request_basis"),"")){
            case "USER_ACTION" -> settings.processingVersion().equals(receipt.get("version"))&&receipt.get("adult")==null&&receipt.get("own_photo")==null&&receipt.get("provider_processing")==null;
            case "LEGACY_ATTESTATION" -> settings.version().equals(receipt.get("version"))&&Boolean.TRUE.equals(receipt.get("adult"))&&Boolean.TRUE.equals(receipt.get("own_photo"))&&Boolean.TRUE.equals(receipt.get("provider_processing"));
            default -> false;
        };
    }
    @Transactional public PrivateMedia claimRaw(UUID id,String token,String mime){
        var m=media(id);if(!m.purpose().equals("SOURCE")||token==null||!java.security.MessageDigest.isEqual(Inputs.hash(token).getBytes(java.nio.charset.StandardCharsets.US_ASCII),Objects.toString(m.tokenHash(),"").getBytes(java.nio.charset.StandardCharsets.US_ASCII)))throw ApiProblem.missing();
        if(m.capExpires().isBefore(Instant.now())||!m.declaredMime().equals(mime))throw new ApiProblem(409,"UPLOAD_EXPIRED","Photo upload authorization expired or does not match");
        if(jdbc.update("UPDATE vw_private_media SET state='UPLOADING' WHERE id=? AND state='AUTHORIZED'",id)!=1)throw new ApiProblem(409,"UPLOAD_USED","This upload authorization was already used");return m;
    }
    @Transactional public void uploaded(UUID id){if(jdbc.update("UPDATE vw_private_media SET state='UPLOADED' WHERE id=? AND state='UPLOADING'",id)!=1)throw new ApiProblem(409,"UPLOAD_CHANGED","Photo was removed during upload");}
    @Transactional public PrivateMedia beginFinalize(UUID id,boolean cloud){UUID owner=ownerLock();var m=ownedMedia(id);if(!m.purpose().equals("SOURCE"))throw ApiProblem.missing();eligibleProduct(m.product());
        if(m.state().equals("ACTIVE"))return m;if(m.capExpires().isBefore(Instant.now()))throw new ApiProblem(409,"UPLOAD_EXPIRED","Choose your photo again; upload authorization expired");
        if(jdbc.update("UPDATE vw_private_media SET state='PROCESSING' WHERE id=? AND state=? AND owner_id=?",id,cloud?"AUTHORIZED":"UPLOADED",owner)!=1)throw new ApiProblem(409,"UPLOAD_NOT_READY","Photo is not ready or is already being processed");return m;
    }
    @Transactional public PrivateMedia sourceComplete(UUID id,String key,int width,int height){ownerLock();var m=ownedMedia(id);eligibleProduct(m.product());if(m.capExpires().isBefore(Instant.now()))throw new ApiProblem(409,"UPLOAD_EXPIRED","Photo expired during validation");
        if(jdbc.update("UPDATE vw_private_media SET state='ACTIVE',object_key=?,width=?,height=? WHERE id=? AND state='PROCESSING'",key,width,height,id)!=1)throw new ApiProblem(409,"UPLOAD_CHANGED","Photo was removed during validation");scheduleDelete(m.rawKey());return media(id);
    }
    @Transactional public void rejectSource(UUID id,boolean retry,boolean cloud){var m=media(id);if(retry){jdbc.update("UPDATE vw_private_media SET state=? WHERE id=? AND state='PROCESSING'",cloud?"AUTHORIZED":"UPLOADED",id);return;}if(jdbc.update("UPDATE vw_private_media SET state='REJECTED',deleted_at=CURRENT_TIMESTAMP WHERE id=? AND state NOT IN('ACTIVE','SAVED','DELETED')",id)>0){scheduleDelete(m.rawKey());scheduleDelete(m.objectKey());}}
    @Transactional public void discardSource(UUID id){ownerLock();var m=ownedMedia(id);if(!m.purpose().equals("SOURCE"))throw ApiProblem.missing();if(m.job()!=null)throw new ApiProblem(409,"SOURCE_IN_USE","Cancel or discard the generation job instead");deleteMedia(m);}
    public void scheduleDelete(String key){if(key!=null)jdbc.update("INSERT INTO vw_object_deletion(object_key,final_check_at) VALUES(?,CURRENT_TIMESTAMP+INTERVAL '10 minutes') ON CONFLICT(object_key) DO UPDATE SET next_attempt_at=LEAST(vw_object_deletion.next_attempt_at,CURRENT_TIMESTAMP),final_check_at=GREATEST(vw_object_deletion.final_check_at,EXCLUDED.final_check_at)",key);}
    private void deleteMedia(PrivateMedia m){jdbc.update("UPDATE vw_private_media SET state='DELETED',deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP) WHERE id=?",m.id());scheduleDelete(m.rawKey());scheduleDelete(m.objectKey());scheduleDelete(m.pendingKey());}
    @Transactional public Map<String,Object> create(Map<String,Object> body){
        UUID owner=ownerLock(),product=Inputs.id(Inputs.text(body,"productId",40)),source=Inputs.id(Inputs.text(body,"sourceUploadId",40));String key=Inputs.text(body,"idempotencyKey",100);
        if(!key.matches("[A-Za-z0-9._:-]{16,100}"))throw ApiProblem.bad("Use a stable unique idempotency key for this request");String fingerprint=Inputs.hash(product+"|"+source);
        var previous=jdbc.queryForList("SELECT * FROM vw_tryon_job WHERE owner_id=? AND idempotency_key=?",owner,key);
        if(!previous.isEmpty()){var old=previous.getFirst();if(!fingerprint.equals(old.get("fingerprint")))throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","This request key was already used for different input");if(deleted(old))throw new ApiProblem(409,"REQUEST_DISCARDED","This request was discarded; start a new request");return dto(old);}
        settings.requireEnabled();var p=eligibleProduct(product);var m=ownedMedia(source);
        if(!m.purpose().equals("SOURCE")||!m.state().equals("ACTIVE")||!product.equals(m.product())||m.job()!=null||m.expires().isBefore(Instant.now()))throw new ApiProblem(409,"SOURCE_UNAVAILABLE","Upload a new photo for this product");
        var consent=jdbc.queryForMap("SELECT c.* FROM vw_tryon_consent c JOIN vw_private_media m ON m.consent_id=c.id WHERE m.id=?",source);
        if(!validRequestSnapshot(consent))throw requestChanged();
        LocalDate day=LocalDate.now(ZoneOffset.UTC);lockDay(day);jdbc.update("INSERT INTO vw_customer_generation_day(owner_id,day) VALUES(?,?) ON CONFLICT DO NOTHING",owner,day);
        int used=jdbc.queryForObject("SELECT used FROM vw_customer_generation_day WHERE owner_id=? AND day=?",Integer.class,owner,day);if(used>=settings.customerDaily)throw new ApiProblem(429,"CUSTOMER_DAILY_LIMIT","Your daily preview allowance is used; try after the UTC reset");
        reserve(day,settings.attemptCost(),true);UUID job=UUID.randomUUID();jdbc.update("UPDATE vw_customer_generation_day SET used=used+1 WHERE owner_id=? AND day=?",owner,day);
        jdbc.update("INSERT INTO vw_tryon_job(id,owner_id,product_id,source_id,idempotency_key,fingerprint,product_snapshot,state,provider,model,demo,evaluation_demo,quota_day,deadline_at,garment_media_id) VALUES(?,?,?,?,?,?,?::jsonb,'QUEUED',?,?,?,?,?,CURRENT_TIMESTAMP+INTERVAL '180 seconds',?)",job,owner,product,source,key,fingerprint,json.toJson(snapshot(p)),settings.provider(),settings.model(),settings.mock(),settings.evaluation(),day,p.get("reference_media_id"));
        jdbc.update("INSERT INTO vw_tryon_attempt(job_id,sequence,reserved_usd) VALUES(?,1,?)",job,settings.attemptCost());jdbc.update("UPDATE vw_private_media SET job_id=? WHERE id=?",job,source);return dto(row(job,false));
    }
    public Map<String,Object> quota(){UUID owner=customer().id();LocalDate day=LocalDate.now(ZoneOffset.UTC);var used=jdbc.queryForList("SELECT used FROM vw_customer_generation_day WHERE owner_id=? AND day=?",Integer.class,owner,day);int count=used.isEmpty()?0:used.getFirst();int saved=jdbc.queryForObject("SELECT count(*) FROM vw_private_media WHERE owner_id=? AND purpose='OUTPUT' AND state IN('SAVING','SAVED')",Integer.class,owner);return Map.of("used",count,"remaining",Math.max(0,settings.customerDaily-count),"limit",settings.customerDaily,"resetsAt",day.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toString(),"saved",saved,"savedLimit",settings.savedLimit);}
    @Transactional public void expireOwner(){UUID owner=customer().id();for(UUID id:jdbc.queryForList("SELECT id FROM vw_tryon_job WHERE owner_id=? AND state IN('QUEUED','RUNNING') AND deadline_at<=CURRENT_TIMESTAMP ORDER BY quota_day,id",UUID.class,owner)){var job=lockedJob(id);if(active(job)&&time(job,"deadline_at").isBefore(Instant.now()))terminal(job,"EXPIRED","JOB_EXPIRED","Generation exceeded its time limit",false,BigDecimal.ZERO);}}
    public Map<String,Object> get(UUID id){var job=row(id,false);if(!id(job,"owner_id").equals(customer().id())||deleted(job))throw ApiProblem.missing();return dto(job);}
    public Map<String,Object> jobs(int page,int size){UUID owner=customer().id();int p=Math.min(1000000,Math.max(0,page)),s=Math.min(50,Math.max(1,size));var rows=jdbc.queryForList("SELECT * FROM vw_tryon_job WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id LIMIT ? OFFSET ?",owner,s,p*s);return Map.of("items",rows.stream().map(this::dto).toList(),"page",p,"size",s,"total",jdbc.queryForObject("SELECT count(*) FROM vw_tryon_job WHERE owner_id=? AND deleted_at IS NULL",Integer.class,owner));}
    private Map<String,Object> dto(Map<String,Object> job){
        var out=new LinkedHashMap<String,Object>();for(String[] pair:new String[][]{{"id","id"},{"productId","product_id"},{"state","state"},{"provider","provider"},{"model","model"}})out.put(pair[0],job.get(pair[1]));
        out.put("product",json.fromJson(job.get("product_snapshot").toString(),new TypeToken<Map<String,Object>>(){}.getType()));out.put("createdAt",time(job,"created_at").toString());out.put("updatedAt",time(job,"updated_at").toString());out.put("deadlineAt",time(job,"deadline_at").toString());out.put("attempts",number(job,"attempts"));out.put("demo",job.get("demo"));out.put("evaluationDemo",job.get("evaluation_demo"));out.put("label",Boolean.TRUE.equals(job.get("demo"))?"Demo preview":"AI-generated preview");out.put("notice",Boolean.TRUE.equals(job.get("demo"))?"Demo preview: deterministic fixture, not a live AI result.":Boolean.TRUE.equals(job.get("evaluation_demo"))?"AI EVALUATION DEMO. Human saree quality review is pending. "+TryOnSettings.LIMITATION:TryOnSettings.LIMITATION);out.put("discarded",job.get("discarded_at")!=null);
        PrivateMedia output=job.get("output_id")==null?null:media(id(job,"output_id"));boolean visible=output!=null&&Set.of("ACTIVE","SAVING","SAVED").contains(output.state())&&(output.expires()==null||output.expires().isAfter(Instant.now()))&&job.get("discarded_at")==null&&!deleted(job);
        out.put("result",visible?result(output):null);out.put("error",job.get("error_code")==null?null:Map.of("code",job.get("error_code"),"message",job.get("error_message"),"canRetry",Set.of("FAILED","EXPIRED").contains(text(job,"state"))));out.put("canCancel",active(job));out.put("canSave",visible&&!output.state().equals("SAVED"));out.put("canDiscard",active(job)||visible);return out;
    }
    private Map<String,Object> result(PrivateMedia m){var result=new LinkedHashMap<String,Object>();result.put("id",m.id());result.put("imageUrl","/api/v1/private-media/"+m.id()+"/content");result.put("downloadUrl","/api/v1/private-media/"+m.id()+"/download");result.put("expiresAt",m.expires()==null?null:m.expires().toString());result.put("saved",m.state().equals("SAVED"));result.put("saving",m.state().equals("SAVING"));return result;}
    @Transactional public void dispatched(UUID id,int sequence){jdbc.update("UPDATE vw_tryon_job SET dispatched_at=CURRENT_TIMESTAMP WHERE id=? AND dispatch_sequence=? AND state='QUEUED'",id,sequence);}
    public List<Map<String,Object>> undispatched(){return jdbc.queryForList("SELECT id,dispatch_sequence FROM vw_tryon_job WHERE state='QUEUED' AND dispatched_at IS NULL AND deadline_at>CURRENT_TIMESTAMP ORDER BY created_at LIMIT 50");}
    @Transactional public Claim claim(UUID jobId,int sequence){
        var job=lockedJob(jobId);if(deleted(job)||!text(job,"state").equals("QUEUED")||number(job,"dispatch_sequence")!=sequence)return null;
        if(time(job,"deadline_at").isBefore(Instant.now())){terminal(job,"EXPIRED","JOB_EXPIRED","Generation exceeded its time limit",false,BigDecimal.ZERO);return null;}
        if(!identity.find(id(job,"owner_id")).enabled()||settings.disabledReason()!=null||!settings.provider().equals(job.get("provider"))||!settings.model().equals(job.get("model"))){terminal(job,"FAILED","GENERATION_UNAVAILABLE","Generation settings or account access changed",false,BigDecimal.ZERO);return null;}
        Map<String,Object> p;try{p=eligibleProduct(id(job,"product_id"));}catch(ApiProblem e){terminal(job,"FAILED","PRODUCT_UNAVAILABLE","This product is no longer available",false,BigDecimal.ZERO);return null;}
        var source=media(id(job,"source_id"));if(!source.state().equals("ACTIVE")||source.expires().isBefore(Instant.now())){terminal(job,"FAILED","SOURCE_UNAVAILABLE","The source photo expired",false,BigDecimal.ZERO);return null;}
        var receipt=jdbc.queryForMap("SELECT c.* FROM vw_tryon_consent c JOIN vw_private_media m ON m.consent_id=c.id WHERE m.id=?",source.id());if(!validRequestSnapshot(receipt)){terminal(job,"FAILED","CONSENT_UPDATED","Preview request settings changed; choose your photo again",false,BigDecimal.ZERO);return null;}
        UUID reference=id(job,"garment_media_id");if(reference==null||jdbc.queryForObject("SELECT count(*) FROM vw_media_upload WHERE id=? AND product_id=? AND purpose='PRODUCT_IMAGE' AND state='VALIDATED'",Integer.class,reference,job.get("product_id"))!=1){terminal(job,"FAILED","PRODUCT_REFERENCE_UNAVAILABLE","The selected garment reference is no longer available",false,BigDecimal.ZERO);return null;}
        UUID token=UUID.randomUUID(),output=UUID.randomUUID();String key="unsaved/"+job.get("owner_id")+"/"+jobId+"/"+output+".jpg";
        jdbc.update("INSERT INTO vw_private_media(id,owner_id,product_id,job_id,purpose,state,declared_mime,declared_bytes,object_key,cap_expires_at,expires_at) VALUES(?,?,?,?,'OUTPUT','PROCESSING','image/jpeg',1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+INTERVAL '24 hours')",output,job.get("owner_id"),job.get("product_id"),jobId,key);
        jdbc.update("UPDATE vw_tryon_job SET state='RUNNING',claim_token=?,output_id=?,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",token,output,jobId);jdbc.update("UPDATE vw_tryon_attempt SET claim_token=? WHERE job_id=? AND sequence=?",token,jobId,sequence);
        return new Claim(jobId,id(job,"owner_id"),source.id(),reference,output,key,sequence,token);
    }
    private boolean current(Map<String,Object> job,Claim claim){return !deleted(job)&&text(job,"state").equals("RUNNING")&&claim.token().equals(job.get("claim_token"))&&number(job,"dispatch_sequence")==claim.sequence();}
    @Transactional public boolean providerStarted(Claim claim){var job=lockedJob(claim.job());if(!current(job,claim))return false;if(time(job,"deadline_at").isBefore(Instant.now())||!identity.find(claim.owner()).enabled()||settings.disabledReason()!=null){terminal(job,"EXPIRED","JOB_EXPIRED","Generation is no longer available",false,BigDecimal.ZERO);return false;}jdbc.update("UPDATE vw_tryon_attempt SET provider_started_at=CURRENT_TIMESTAMP,outcome='STARTED' WHERE job_id=? AND sequence=?",claim.job(),claim.sequence());return true;}
    private void settle(Map<String,Object> job,String outcome,boolean unbilled,BigDecimal observed,GenerationResult usage){
        var attempt=jdbc.queryForMap("SELECT * FROM vw_tryon_attempt WHERE job_id=? AND sequence=? FOR UPDATE",job.get("id"),job.get("dispatch_sequence"));if(Boolean.TRUE.equals(attempt.get("accounting_settled")))return;BigDecimal reserved=(BigDecimal)attempt.get("reserved_usd");boolean started=attempt.get("provider_started_at")!=null;
        BigDecimal committed=started&&!unbilled?reserved.max(observed):BigDecimal.ZERO;
        jdbc.update("UPDATE vw_generation_day SET reserved_usd=GREATEST(0,reserved_usd-?),committed_usd=committed_usd+?,observed_usd=observed_usd+? WHERE day=?",reserved,committed,observed,day(job));
        jdbc.update("UPDATE vw_tryon_attempt SET accounting_settled=TRUE,outcome=?,finished_at=CURRENT_TIMESTAMP,observed_usd=?,input_tokens=?,output_tokens=?,thought_tokens=? WHERE job_id=? AND sequence=?",outcome,observed,usage==null?0:usage.inputTokens(),usage==null?0:usage.outputTokens(),usage==null?0:usage.thoughtTokens(),job.get("id"),job.get("dispatch_sequence"));
    }
    private void terminal(Map<String,Object> job,String state,String code,String message,boolean unbilled,BigDecimal observed){
        if(code.equals("JOB_EXPIRED")&&text(job,"state").equals("RUNNING")&&jdbc.queryForObject("SELECT count(*) FROM vw_tryon_attempt WHERE job_id=? AND sequence=? AND provider_started_at IS NOT NULL",Integer.class,job.get("id"),job.get("dispatch_sequence"))>0){code="UNKNOWN_OUTCOME";message="The provider outcome is unknown after the job deadline. It was not automatically retried.";}
        if(!active(job))return;settle(job,text(job,"state").equals("RUNNING")&&!unbilled?"UNKNOWN_OUTCOME":"NOT_STARTED",unbilled,observed,null);
        if(!Boolean.TRUE.equals(job.get("allowance_refunded")))jdbc.update("UPDATE vw_customer_generation_day SET used=GREATEST(0,used-1) WHERE owner_id=? AND day=?",job.get("owner_id"),day(job));
        jdbc.update("UPDATE vw_tryon_job SET state=?,error_code=?,error_message=?,allowance_refunded=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=?",state,code,message,job.get("id"));deleteMedia(media(id(job,"source_id")));if(job.get("output_id")!=null)deleteMedia(media(id(job,"output_id")));
    }
    @Transactional public boolean succeeded(Claim claim,int bytes,int width,int height,GenerationResult usage){
        var job=lockedJob(claim.job());if(!current(job,claim)){observeLate(job,claim,usage);return false;}
        if(time(job,"deadline_at").isBefore(Instant.now())||!identity.find(claim.owner()).enabled()){settle(job,"CONFIRMED",false,usage.estimatedCostUsd(),usage);terminal(job,"EXPIRED","RESULT_TOO_LATE","Provider completed after this job became unavailable",false,BigDecimal.ZERO);return false;}
        settle(job,"CONFIRMED",false,usage.estimatedCostUsd(),usage);jdbc.update("UPDATE vw_private_media SET state='ACTIVE',declared_bytes=?,width=?,height=?,expires_at=CURRENT_TIMESTAMP+INTERVAL '24 hours' WHERE id=? AND state='PROCESSING'",bytes,width,height,claim.output());jdbc.update("UPDATE vw_tryon_job SET state='SUCCEEDED',error_code=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",claim.job());deleteMedia(media(claim.source()));return true;
    }
    private void observeLate(Map<String,Object> job,Claim claim,GenerationResult usage){
        var rows=jdbc.queryForList("SELECT * FROM vw_tryon_attempt WHERE job_id=? AND sequence=? AND claim_token=? FOR UPDATE",claim.job(),claim.sequence(),claim.token());if(rows.isEmpty())return;var attempt=rows.getFirst();if(!Boolean.TRUE.equals(attempt.get("accounting_settled")))return;
        BigDecimal prior=(BigDecimal)attempt.get("observed_usd"),observed=usage.estimatedCostUsd().max(prior),reserved=(BigDecimal)attempt.get("reserved_usd");BigDecimal before=attempt.get("provider_started_at")==null?BigDecimal.ZERO:reserved.max(prior);BigDecimal after=reserved.max(observed);
        jdbc.update("UPDATE vw_generation_day SET observed_usd=observed_usd+?,committed_usd=committed_usd+? WHERE day=?",observed.subtract(prior),after.subtract(before).max(BigDecimal.ZERO),day(job));
        jdbc.update("UPDATE vw_tryon_attempt SET outcome='CONFIRMED_LATE',observed_usd=?,input_tokens=?,output_tokens=?,thought_tokens=? WHERE job_id=? AND sequence=?",observed,usage.inputTokens(),usage.outputTokens(),usage.thoughtTokens(),claim.job(),claim.sequence());
    }
    @Transactional public void failedAfterResult(Claim claim,GenerationResult usage){var job=lockedJob(claim.job());if(!current(job,claim)){observeLate(job,claim,usage);return;}settle(job,"CONFIRMED",false,usage.estimatedCostUsd(),usage);terminal(job,"FAILED","RESULT_STORAGE_FAILED","The provider completed but its preview could not be stored. Your customer allowance was refunded.",false,BigDecimal.ZERO);}
    @Transactional public boolean failed(Claim claim,ProviderFailure.Kind kind,boolean providerInvoked){
        var job=lockedJob(claim.job());if(!current(job,claim))return false;boolean unbilled=!providerInvoked||Set.of(ProviderFailure.Kind.RETRYABLE,ProviderFailure.Kind.REJECTED,ProviderFailure.Kind.CONFIGURATION).contains(kind);
        String outcome=kind==ProviderFailure.Kind.UNKNOWN_OUTCOME?"UNKNOWN_OUTCOME":kind.name();settle(job,outcome,unbilled,BigDecimal.ZERO,null);
        if(kind==ProviderFailure.Kind.RETRYABLE&&claim.sequence()==1&&time(job,"deadline_at").isAfter(Instant.now().plusSeconds(5))&&identity.find(claim.owner()).enabled()&&settings.disabledReason()==null){
            try{reserve(day(job),settings.attemptCost(),false);}catch(ApiProblem full){terminal(job,"FAILED","PROVIDER_BUDGET_LIMIT","No provider budget remains for a retry",true,BigDecimal.ZERO);return false;}
            deleteMedia(media(claim.output()));jdbc.update("INSERT INTO vw_tryon_attempt(job_id,sequence,reserved_usd) VALUES(?,2,?)",claim.job(),settings.attemptCost());jdbc.update("UPDATE vw_tryon_job SET state='QUEUED',dispatch_sequence=2,dispatched_at=NULL,claim_token=NULL,output_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",claim.job());return true;
        }
        String code=kind==ProviderFailure.Kind.UNKNOWN_OUTCOME?"UNKNOWN_OUTCOME":providerInvoked?"PROVIDER_FAILED":"PREPARATION_FAILED";String message=kind==ProviderFailure.Kind.UNKNOWN_OUTCOME?"The provider outcome is unknown. It was not automatically retried; a new request must be deliberate.":"A preview could not be completed. Your customer allowance was refunded.";
        terminal(job,"FAILED",code,message,unbilled,BigDecimal.ZERO);return false;
    }
    @Transactional public Map<String,Object> cancel(UUID id){var job=ownedJob(id,false);if(active(job))terminal(job,"CANCELLED","CANCELLED","Generation was cancelled; provider work already started may remain billable",false,BigDecimal.ZERO);return dto(row(id,false));}
    @Transactional public void discard(UUID id){var job=ownedJob(id,true);if(deleted(job))return;if(active(job))terminal(job,"CANCELLED","CANCELLED","Generation discarded",false,BigDecimal.ZERO);deleteMedia(media(id(job,"source_id")));if(job.get("output_id")!=null)deleteMedia(media(id(job,"output_id")));jdbc.update("UPDATE vw_tryon_job SET deleted_at=CURRENT_TIMESTAMP,discarded_at=CURRENT_TIMESTAMP WHERE id=?",id);}
    @Transactional public Save beginSave(UUID id){var job=ownedJob(id,false);if(!text(job,"state").equals("SUCCEEDED")||job.get("output_id")==null||job.get("discarded_at")!=null)throw new ApiProblem(409,"RESULT_UNAVAILABLE","This result cannot be saved");var m=media(id(job,"output_id"));if(m.state().equals("SAVED")||m.state().equals("SAVING"))return new Save(m,false);if(!m.state().equals("ACTIVE")||m.expires().isBefore(Instant.now()))throw new ApiProblem(409,"RESULT_EXPIRED","This result expired");
        int count=jdbc.queryForObject("SELECT count(*) FROM vw_private_media WHERE owner_id=? AND purpose='OUTPUT' AND state IN('SAVING','SAVED')",Integer.class,m.owner());if(count>=settings.savedLimit)throw new ApiProblem(409,"GALLERY_FULL","Delete a saved preview before saving another");String pending="saved/"+m.owner()+"/"+m.id()+"/"+UUID.randomUUID()+".jpg";jdbc.update("UPDATE vw_private_media SET state='SAVING',pending_key=?,saving_started_at=CURRENT_TIMESTAMP WHERE id=?",pending,m.id());return new Save(media(m.id()),true);
    }
    @Transactional public boolean saved(UUID id,String expectedKey){var initial=media(id);var job=lockedJob(initial.job());var m=media(id);if(!Objects.equals(expectedKey,m.pendingKey())){scheduleDelete(expectedKey);return false;}if(!identity.find(m.owner()).enabled()||deleted(job)||job.get("discarded_at")!=null||!m.state().equals("SAVING")||m.expires().isBefore(Instant.now())){deleteMedia(m);return false;}scheduleDelete(m.objectKey());jdbc.update("UPDATE vw_private_media SET state='SAVED',object_key=pending_key,pending_key=NULL,saving_started_at=NULL,expires_at=NULL,saved_at=CURRENT_TIMESTAMP WHERE id=?",id);return true;}
    @Transactional public void saveFailed(UUID id,String expectedKey){var initial=media(id);lockOwner(initial.owner());scheduleDelete(expectedKey);jdbc.update("UPDATE vw_private_media SET state='ACTIVE',pending_key=NULL,saving_started_at=NULL WHERE id=? AND state='SAVING' AND pending_key=?",id,expectedKey);}
    public List<UUID> staleSaves(){return jdbc.queryForList("SELECT id FROM vw_private_media WHERE state='SAVING' AND saving_started_at<CURRENT_TIMESTAMP-INTERVAL '5 minutes' ORDER BY owner_id,id LIMIT 100",UUID.class);}
    @Transactional public void recoverSave(UUID id){var initial=media(id);lockOwner(initial.owner());var m=media(id);if(!m.state().equals("SAVING"))return;if(jdbc.update("UPDATE vw_private_media SET state='ACTIVE',pending_key=NULL,saving_started_at=NULL WHERE id=? AND state='SAVING' AND saving_started_at<CURRENT_TIMESTAMP-INTERVAL '5 minutes'",id)>0)scheduleDelete(m.pendingKey());}
    public PrivateMedia readable(UUID id){PrivateMedia m;try{m=ownedMedia(id);}catch(ApiProblem denied){throw ApiProblem.missing();}if(!m.purpose().equals("OUTPUT")||!Set.of("ACTIVE","SAVING","SAVED").contains(m.state())||(m.expires()!=null&&!m.expires().isAfter(Instant.now())))throw ApiProblem.missing();var job=row(m.job(),false);if(deleted(job)||job.get("discarded_at")!=null||!text(job,"state").equals("SUCCEEDED"))throw ApiProblem.missing();return m;}
    public Map<String,Object> gallery(int page,int size){UUID owner=customer().id();int p=Math.min(1000000,Math.max(0,page)),s=Math.min(50,Math.max(1,size));var values=jdbc.query("SELECT * FROM vw_private_media WHERE owner_id=? AND purpose='OUTPUT' AND state='SAVED' ORDER BY saved_at DESC,id LIMIT ? OFFSET ?",PrivateMedia.MAPPER,owner,s,p*s);List<Map<String,Object>> items=new ArrayList<>();for(var m:values){var job=row(m.job(),false);var value=new LinkedHashMap<String,Object>();value.put("id",m.id());value.put("jobId",m.job());value.put("createdAt",m.savedAt().toString());var dto=dto(job);for(String key:List.of("product","provider","model","demo","evaluationDemo","label","notice"))value.put(key,dto.get(key));value.put("imageUrl","/api/v1/private-media/"+m.id()+"/content");value.put("downloadUrl","/api/v1/private-media/"+m.id()+"/download");var current=jdbc.queryForList("SELECT p.status,p.availability,s.status AS store_status FROM vw_product p JOIN vw_store s ON s.id=p.store_id WHERE p.id=?",job.get("product_id"));String available=current.isEmpty()||!text(current.getFirst(),"status").equals("PUBLISHED")||!text(current.getFirst(),"store_status").equals("ACTIVE")?"ARCHIVED":text(current.getFirst(),"availability");value.put("currentAvailability",available);items.add(value);}return Map.of("items",items,"page",p,"size",s,"total",jdbc.queryForObject("SELECT count(*) FROM vw_private_media WHERE owner_id=? AND purpose='OUTPUT' AND state='SAVED'",Integer.class,owner));}
    @Transactional public void deleteGallery(UUID id){var m=ownedMedia(id);if(!m.purpose().equals("OUTPUT"))throw ApiProblem.missing();var job=ownedJob(m.job(),false);deleteMedia(media(id));jdbc.update("UPDATE vw_tryon_job SET discarded_at=CURRENT_TIMESTAMP WHERE id=?",job.get("id"));}
    @EventListener public void deletedAccount(IdentityService.AccountDeleted event){
        lockOwner(event.accountId());for(UUID id:jdbc.queryForList("SELECT id FROM vw_tryon_job WHERE owner_id=? ORDER BY quota_day,id",UUID.class,event.accountId())){var job=lockedJob(id);if(active(job))terminal(job,"CANCELLED","ACCOUNT_DELETED","Account deleted",false,BigDecimal.ZERO);jdbc.update("UPDATE vw_tryon_job SET deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP),discarded_at=COALESCE(discarded_at,CURRENT_TIMESTAMP) WHERE id=?",id);}
        for(var m:jdbc.query("SELECT * FROM vw_private_media WHERE owner_id=?",PrivateMedia.MAPPER,event.accountId()))deleteMedia(m);
    }
    public List<UUID> expiredJobs(){return jdbc.queryForList("SELECT id FROM vw_tryon_job WHERE state IN('QUEUED','RUNNING') AND deadline_at<=CURRENT_TIMESTAMP ORDER BY owner_id,quota_day,id LIMIT 100",UUID.class);}
    public List<UUID> expiredMedia(){return jdbc.queryForList("SELECT id FROM vw_private_media WHERE state IN('AUTHORIZED','UPLOADING','UPLOADED','PROCESSING','ACTIVE','SAVING') AND ((purpose='SOURCE' AND (expires_at<=CURRENT_TIMESTAMP+INTERVAL '5 minutes' OR (state<>'ACTIVE' AND cap_expires_at<=CURRENT_TIMESTAMP))) OR (purpose='OUTPUT' AND expires_at<=CURRENT_TIMESTAMP)) ORDER BY owner_id,id LIMIT 100",UUID.class);}
    @Transactional public void expireJob(UUID id){var job=lockedJob(id);if(active(job)&&!time(job,"deadline_at").isAfter(Instant.now()))terminal(job,"EXPIRED","JOB_EXPIRED","Generation exceeded its time limit",false,BigDecimal.ZERO);}
    @Transactional public void expireMedia(UUID id){var initial=media(id);lockOwner(initial.owner());var m=media(id);if(m.state().equals("SAVED")||m.state().equals("DELETED")||m.state().equals("REJECTED")||m.expires()==null)return;Instant cutoff=m.purpose().equals("SOURCE")?Instant.now().plusSeconds(300):Instant.now();if(m.expires().isAfter(cutoff)&&!(m.purpose().equals("SOURCE")&&!m.state().equals("ACTIVE")&&m.capExpires().isBefore(Instant.now())))return;if(m.job()!=null){var job=lockedJob(m.job());if(active(job))terminal(job,"EXPIRED","PHOTO_EXPIRED","Photo expired",false,BigDecimal.ZERO);}deleteMedia(media(id));}
    public List<Map<String,Object>> deletionBatch(){return jdbc.queryForList("SELECT * FROM vw_object_deletion WHERE next_attempt_at<=CURRENT_TIMESTAMP ORDER BY next_attempt_at LIMIT 100");}
    @Transactional public void deletionFinished(String key,boolean success){if(success)jdbc.update("DELETE FROM vw_object_deletion WHERE object_key=? AND final_check_at<=CURRENT_TIMESTAMP",key);jdbc.update("UPDATE vw_object_deletion SET attempts=attempts+1,next_attempt_at=CASE WHEN ? THEN final_check_at ELSE CURRENT_TIMESTAMP+INTERVAL '1 minute' END WHERE object_key=?",success,key);}
}
