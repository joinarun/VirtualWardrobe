package com.virtualwardrobe.tryon;

import com.google.gson.*;
import com.virtualwardrobe.ai.AiProperties;
import com.virtualwardrobe.foundation.FoundationProperties;
import com.virtualwardrobe.identity.*;
import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class TryOnSettings {
    public static final String LIMITATION="AI-generated preview. Appearance, garment details and drape may differ. This is not a size or fit guarantee.";
    private final FoundationProperties foundation;private final AiProperties ai;
    public final String environment;public final boolean generationEnabled;public final int customerDaily,globalDaily,savedLimit;
    public final BigDecimal dailyBudget,reservation;private final String report;
    public TryOnSettings(FoundationProperties foundation,AiProperties ai,@Value("${app.environment:local}")String environment,
        @Value("${APP_GENERATION_ENABLED:true}")boolean enabled,@Value("${APP_GENERATION_CUSTOMER_DAILY_LIMIT:5}")int customerDaily,
        @Value("${APP_GENERATION_GLOBAL_DAILY_LIMIT:100}")int globalDaily,@Value("${APP_GENERATION_DAILY_BUDGET_USD:5.00}")BigDecimal budget,
        @Value("${APP_GENERATION_ATTEMPT_RESERVATION_USD:0.25}")BigDecimal reservation,@Value("${APP_GENERATION_SAVED_LIMIT:100}")int savedLimit,
        @Value("${APP_GENERATION_QUALITY_REPORT:}")String report){
        this.foundation=foundation;this.ai=ai;this.environment=environment;this.generationEnabled=enabled;this.customerDaily=customerDaily;this.globalDaily=globalDaily;this.dailyBudget=budget;this.reservation=reservation;this.savedLimit=savedLimit;this.report=report;
        if(customerDaily<1||globalDaily<1||budget.signum()<0||reservation.compareTo(new BigDecimal("0.25"))<0||savedLimit<1||savedLimit>100)throw new IllegalArgumentException("Invalid generation limits or conservative reservation");
    }
    public boolean mock(){return foundation.imageProvider().equals("mock");}
    public String provider(){return mock()?"mock":"google";}
    public String model(){return mock()?"fixture-v1":ai.model();}
    public String location(){return mock()?"local":ai.location();}
    public boolean evaluation(){return !mock()&&!environment.equals("production");}
    public BigDecimal attemptCost(){return mock()?BigDecimal.ZERO:reservation;}
    public String label(){return mock()?"Demo preview":"AI-generated preview";}
    public String version(){return "tryon-v1-"+Inputs.hash(provider()+"|"+model()+"|"+location()+"|24|24|"+savedLimit).substring(0,20);}
    public String processingVersion(){return "tryon-action-v2-"+Inputs.hash(provider()+"|"+model()+"|"+location()+"|24|24|"+savedLimit).substring(0,20);}
    public Map<String,String> processingRequest(){return Map.of("version",processingVersion(),"action","TRY_ON");}
    public String processingNotice(){return "Virtual preview requested by the customer. Source photos are removed after processing and within 24 hours; unsaved previews expire within 24 hours; saved previews remain until deletion. Storage backups and soft deletion have separate retention.";}
    public String consentNotice(){return mock()?"Local deterministic demo preview; no live image-provider request. Adults may upload only their own photo. Source photos are removed after processing and within 24 hours; unsaved previews expire within 24 hours. Saved previews remain until deletion. Cloud backups/soft deletion may retain removed bytes separately.":"Your photo and the garment reference will be processed by Google Cloud model "+model()+" using "+location()+" inference. Global processing may occur outside India. Google provider policies can include abuse-monitoring retention; this app does not promise zero provider retention. Adults may upload only their own photo. App source photos are removed after processing and within 24 hours; unsaved previews expire within 24 hours; saved previews remain until deletion. Cloud backups/soft deletion have separate retention.";}
    public String disabledReason(){
        if(!generationEnabled)return "GENERATION_PAUSED";
        if(!mock()&&!ai.model().equals("gemini-nano-banana-2.1"))return "MODEL_PRICING_REVIEW_REQUIRED";
        if(!mock()&&environment.equals("production")&&!approved())return "QUALITY_APPROVAL_REQUIRED";return null;
    }
    private boolean approved(){
        if(report.isBlank())return false;
        try{var path=Path.of(report);if(Files.size(path)>65536)return false;var value=JsonParser.parseString(Files.readString(path)).getAsJsonObject();
            return value.get("approved").getAsBoolean()&&value.get("provider").getAsString().equals(provider())&&value.get("model").getAsString().equals(model())&&value.get("pairs").getAsInt()>=40&&value.get("acceptedFraction").getAsDouble()>=.8&&value.get("severeArtifacts").getAsInt()==0&&!value.get("reviewedBy").getAsString().isBlank()&&!value.get("reviewedAt").getAsString().isBlank();
        }catch(Exception e){return false;}
    }
    public void requireEnabled(){String reason=disabledReason();if(reason!=null)throw new ApiProblem(503,reason,reason.equals("QUALITY_APPROVAL_REQUIRED")?"Live generation awaits operator-approved human quality review":"Generation is temporarily unavailable");}
    public Map<String,Object> config(){
        var consent=new LinkedHashMap<String,Object>();consent.put("version",version());consent.put("notice",consentNotice());consent.put("providerPolicyUrl",mock()?null:"https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention");consent.put("sourceRetentionHours",24);consent.put("unsavedRetentionHours",24);consent.put("savedLimit",savedLimit);consent.put("privateUrlSeconds",300);consent.put("adultSelfOnly",true);
        var out=new LinkedHashMap<String,Object>();out.put("enabled",disabledReason()==null);out.put("disabledReason",disabledReason());out.put("mode",mock()?"FIXTURE":evaluation()?"EVALUATION_DEMO":"LIVE");out.put("provider",provider());out.put("model",model());out.put("location",location());out.put("label",label());out.put("notice",mock()?"Demo preview: deterministic fixture, not a live AI result.":evaluation()?"AI EVALUATION DEMO. The 40-pair human saree quality review is pending. "+LIMITATION:LIMITATION);out.put("consent",consent);out.put("processingRequest",processingRequest());out.put("limits",Map.of("customerDaily",customerDaily,"globalDaily",globalDaily,"dailyBudgetUsd",dailyBudget.toPlainString()));return out;
    }
}
