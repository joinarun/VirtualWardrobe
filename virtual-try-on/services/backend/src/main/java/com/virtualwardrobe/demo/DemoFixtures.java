package com.virtualwardrobe.demo;

import com.google.gson.Gson;
import com.virtualwardrobe.identity.Inputs;
import com.virtualwardrobe.media.ImageProcessor;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** Pure owned fixture construction. No provider, web server, external URLs or database I/O. */
public final class DemoFixtures {
    public record Row(String table,LinkedHashMap<String,Object> values){@Override public String toString(){return "DemoRow[redacted]";}}
    public record Plan(List<Row> rows,List<DemoAssets.ObjectPlan> objects) { }
    private static final Gson JSON=new Gson();
    public static UUID id(String dataset,String key){return UUID.nameUUIDFromBytes(("virtualwardrobe-demo|"+dataset+"|"+key).getBytes(StandardCharsets.UTF_8));}
    private static int stores(String profile){return profile.equals("standard")?3:1;}
    private static String storeName(String dataset,int index){return new String[]{"Aaranya Demo Silks","Malar Demo Weaves","Neela Demo Studio"}[index];}
    public static List<DemoCredentials.UserDefinition> definitions(String dataset,String profile){
        List<DemoCredentials.UserDefinition> out=new ArrayList<>();int count=stores(profile);List<UUID> ids=new ArrayList<>();List<String> names=new ArrayList<>();for(int i=0;i<count;i++){ids.add(id(dataset,"store:"+i));names.add(storeName(dataset,i));}
        if(profile.equals("load")){out.add(new DemoCredentials.UserDefinition(id(dataset,"user:load"),"WORKFORCE","STORE_ADMIN","Demo load administrator","load-admin."+dataset+"@demo.virtualwardrobe.invalid",List.copyOf(ids),List.copyOf(names)));return out;}
        for(String role:List.of("SUPER_ADMIN","STORE_ADMIN","STAFF","CUSTOMER"))for(int i=0;i<3;i++){
            String key=role.toLowerCase(Locale.ROOT)+":"+i;UUID user=id(dataset,"user:"+key);boolean customer=role.equals("CUSTOMER");String identifier=customer?"+919"+String.format(Locale.ROOT,"%09d",Math.floorMod((long)id(dataset,"phone:"+i).hashCode(),1_000_000_000L)):role.toLowerCase(Locale.ROOT)+""+(i+1)+"."+dataset+"@demo.virtualwardrobe.invalid";
            List<Integer> scoped=customer?List.of():role.equals("SUPER_ADMIN")?(i==0?List.of(0,1,2):List.of()):(i==0?List.of(0,1):List.of(i));
            out.add(new DemoCredentials.UserDefinition(user,customer?"CUSTOMER":"WORKFORCE",role,"Demo "+role.replace('_',' ').toLowerCase(Locale.ROOT)+" "+(i+1),identifier,scoped.stream().map(ids::get).toList(),scoped.stream().map(names::get).toList()));
        }return out;
    }
    public static Plan build(String dataset,String profile,int productCount,DemoCredentials.Bundle credentials,DemoAssets assets)throws IOException{
        var b=new Builder(dataset,profile,assets);var users=credentials.users();var hash=new BCryptPasswordEncoder(12);Timestamp now=Timestamp.from(Instant.now());
        for(var u:users){b.add("vw_account","id",u.id(),"kind",u.kind(),"name",u.name(),"normalized_identifier",u.identifier(),"password_hash",hash.encode(u.password()),"enabled",true,"super_admin",u.role().equals("SUPER_ADMIN"),"password_change_required",false);for(int i=0;i<u.recoveryCodes().size();i++)b.add("vw_recovery_code","id",id(dataset,"recovery:"+u.id()+":"+i),"account_id",u.id(),"code_hash",Inputs.hash(u.recoveryCodes().get(i)));}
        UUID root=id(dataset,"category:root"),women=id(dataset,"category:women"),sarees=id(dataset,"category:sarees");b.add("vw_category","id",root,"parent_id",null,"name","Demo collection");b.add("vw_category","id",women,"parent_id",root,"name","Women");b.add("vw_category","id",sarees,"parent_id",women,"name","Sarees");
        UUID owner=users.getFirst().id(),globalBrand=id(dataset,"brand:global");b.add("vw_brand","id",globalBrand,"store_id",null,"name",profile.equals("load")?"Demo Performance Collection":"Demo Heritage","logo_media_id",id(dataset,"brandlogo:global"));b.logo(id(dataset,"brandlogo:global"),owner,null,null,globalBrand,"BRAND_LOGO",0);
        int storeCount=stores(profile);List<UUID> productIds=new ArrayList<>();Map<UUID,UUID> primaryImages=new HashMap<>();Map<UUID,Map<String,Object>> snapshots=new HashMap<>();
        for(int s=0;s<storeCount;s++){
            UUID store=id(dataset,"store:"+s),brand=id(dataset,"brand:"+s),logo=id(dataset,"storelogo:"+s);b.add("vw_store","id",store,"name",storeName(dataset,s),"description","Fictional demonstration store. Demo contacts are synthetic; do not call them.","status","ACTIVE","logo_media_id",logo,"logo_url","/api/v1/media/"+logo+"/thumbnail");b.logo(logo,owner,store,null,null,"STORE_LOGO",s);
            UUID brandLogo=id(dataset,"brandlogo:"+s);b.add("vw_brand","id",brand,"store_id",store,"name","Demo Artisan Silks","logo_media_id",brandLogo);b.logo(brandLogo,owner,store,null,brand,"BRAND_LOGO",s+1);
        }
        for(var user:users)for(UUID store:user.storeIds())b.add("vw_membership","id",id(dataset,"membership:"+user.id()+":"+store),"store_id",store,"account_id",user.id(),"role",user.role().equals("STAFF")?"STAFF":"STORE_ADMIN","state","ACTIVE","accepted_at",now,"invited_by",owner);
        String[] titles={"Ruby temple-border Kanchipuram saree","Indigo floral Banarasi saree","Rose embroidered organza saree","Ivory gold-border kasavu saree","Emerald Mysore silk saree","Saffron handloom linen saree","Violet peacock Paithani saree","Charcoal silver-floral chiffon saree"};String[] fabrics={"Kanchipuram silk","Banarasi silk","Organza","Cotton","Mysore silk","Linen","Paithani silk","Chiffon"};String[] colours={"Ruby red","Indigo","Dusty rose","Ivory","Emerald green","Saffron","Violet","Charcoal"};int[] prices={15999,7999,3499,1999,6999,2499,12999,2999};
        for(int i=0;i<productCount;i++){
            int s=profile.equals("standard")?i/10:0,within=profile.equals("standard")?i%10:i,style=within%8;UUID store=id(dataset,"store:"+s),product=id(dataset,"product:"+i),media=id(dataset,"image:"+i+":0");var prepared=assets.images.get("saree-"+DemoAssets.STYLES[style]+".png");String title=titles[style]+(within>=8?" · occasion selection "+(within+1):"");String sku=String.format(Locale.ROOT,"DEMO-%04d",within+1);String price=BigDecimal.valueOf(prices[style]+s*250L+(within/8)*100L).setScale(2).toPlainString();
            b.add("vw_product","id",product,"store_id",store,"sku",sku,"title",title,"description","Fictional saree assortment using original synthetic adult/garment imagery. No real purchase or fit guarantee.","category_id",sarees,"brand_id",id(dataset,"brand:"+s),"labels",b.json(List.of(style%2==0?"soft silk":"woven design",style==1||style==2||style==7?"floral":"festive")),"price",new BigDecimal(price),"fabric",fabrics[style],"colour",colours[style],"size","Free size","status","PUBLISHED","availability",profile.equals("standard")&&i==29?"UNAVAILABLE":"AVAILABLE","try_on_enabled",true,"cover_media_id",media,"reference_media_id",media);
            b.image(media,owner,store,product,null,"PRODUCT_IMAGE",prepared,0);productIds.add(product);primaryImages.put(product,media);snapshots.put(product,Map.of("id",product,"title",title,"sku",sku,"storeId",store,"storeName",storeName(dataset,s),"price",price,"currency","INR"));
            if(profile.equals("standard")&&style==0){b.image(id(dataset,"image:"+i+":1"),owner,store,product,null,"PRODUCT_IMAGE",assets.images.get("saree-ruby-detail.png"),1);b.image(id(dataset,"image:"+i+":2"),owner,store,product,null,"PRODUCT_IMAGE",assets.images.get("saree-ruby-back.png"),2);}
            if(profile.equals("standard")&&i==0)b.video(id(dataset,"video:0"),owner,store,product,assets.video);
        }
        if(profile.equals("standard")){
            var customers=users.stream().filter(u->u.kind().equals("CUSTOMER")).toList();var staff=users.stream().filter(u->u.role().equals("STAFF")).toList();var admins=users.stream().filter(u->u.role().equals("STORE_ADMIN")).toList();
            for(int i=0;i<3;i++){
                var u=customers.get(i);UUID product=productIds.get(i*10+i*2),consent=id(dataset,"consent:"+i),source=id(dataset,"source:"+i),output=id(dataset,"output:"+i),job=id(dataset,"job:"+i);byte[] bytes=assets.images.get("saree-"+DemoAssets.STYLES[(i*2)%8]+".png").image();String key=b.prefix+"saved/"+output+".jpg";b.objects.add(new DemoAssets.ObjectPlan(key,"image/jpeg",bytes));
                b.add("vw_tryon_consent","id",consent,"owner_id",u.id(),"version","synthetic-demo-v1","provider","mock","model","fixture-v1","location","local","notice","Owned synthetic demo fixture; no real person or paid provider request. Not evidence of saree fidelity.","adult",true,"own_photo",true,"provider_processing",true);
                b.add("vw_private_media","id",source,"owner_id",u.id(),"product_id",product,"consent_id",consent,"job_id",job,"purpose","SOURCE","state","DELETED","declared_mime","image/jpeg","declared_bytes",bytes.length,"cap_expires_at",now,"expires_at",now,"deleted_at",now);
                b.add("vw_private_media","id",output,"owner_id",u.id(),"product_id",product,"job_id",job,"purpose","OUTPUT","state","SAVED","declared_mime","image/jpeg","declared_bytes",bytes.length,"object_key",key,"cap_expires_at",now,"expires_at",null,"saved_at",now);
                b.add("vw_tryon_job","id",job,"owner_id",u.id(),"product_id",product,"source_id",source,"output_id",output,"garment_media_id",primaryImages.get(product),"idempotency_key","demo-fixture-"+dataset+"-"+i,"fingerprint",Inputs.hash(product+"|"+source),"product_snapshot",b.json(snapshots.get(product)),"state","SUCCEEDED","provider","mock","model","fixture-v1","demo",true,"evaluation_demo",false,"quota_day",java.sql.Date.valueOf(LocalDate.now(ZoneOffset.UTC).minusDays(1)),"attempts",1,"deadline_at",now);
                b.add("vw_tryon_attempt","job_id",job,"sequence",1,"reserved_usd",BigDecimal.ZERO,"outcome","CONFIRMED","accounting_settled",true,"observed_usd",BigDecimal.ZERO,"finished_at",now);
            }
            String[] states={"NEW","OPEN","IN_PROGRESS","AWAITING_CUSTOMER_RESPONSE","CUSTOMER_REPLIED","CLOSED"};
            for(int i=0;i<6;i++){
                int s=i%3;var customer=customers.get(s);UUID product=productIds.get(s*10+i/3),enquiry=id(dataset,"enquiry:"+i),assignee=i==0?null:staff.get(s).id();String state=states[i];b.add("vw_enquiry","id",enquiry,"customer_id",customer.id(),"store_id",id(dataset,"store:"+s),"product_id",product,"product_snapshot",b.json(snapshots.get(product)),"contact_name",customer.name(),"contact_phone",customer.identifier(),"phone_verified",false,"consent_version","callback-share-v1-2026-10-27-r180","contact_retention_days",180,"status",state,"assignee_id",assignee,"outcome",i==5?"CONTACTED":null,"closed_at",i==5?now:null);
                b.event(enquiry,customer.id(),"CREATED","PUBLIC","Fictional demo enquiry; do not contact this number.",null,"NEW",null,null,null);
                if(i>0){b.event(enquiry,admins.get(s).id(),"CLAIMED","INTERNAL",null,"NEW","OPEN",null,admins.get(s).id(),null);b.event(enquiry,admins.get(s).id(),"ASSIGNED","INTERNAL","Demo handover to an accepted store teammate.","OPEN","OPEN",admins.get(s).id(),assignee,null);b.event(enquiry,assignee,"MESSAGE","PUBLIC","This is a demonstration reply about fabric and availability.",null,null,null,null,null);b.event(enquiry,assignee,"NOTE","INTERNAL","Demo internal note, never visible to a customer.",null,null,null,null,null);}
                if(i==2||i==5)b.event(enquiry,assignee,"STATUS_CHANGED","PUBLIC",null,"OPEN","IN_PROGRESS",null,null,null);
                if(i==3||i==4)b.event(enquiry,assignee,"STATUS_CHANGED","PUBLIC","Please confirm your preferred callback time.","OPEN","AWAITING_CUSTOMER_RESPONSE",null,null,null);
                if(i==4){b.event(enquiry,customer.id(),"MESSAGE","PUBLIC","Synthetic customer response for the demonstration.",null,null,null,null,null);b.event(enquiry,customer.id(),"STATUS_CHANGED","PUBLIC",null,"AWAITING_CUSTOMER_RESPONSE","CUSTOMER_REPLIED",null,null,null);}
                if(i==5)b.event(enquiry,assignee,"STATUS_CHANGED","PUBLIC","Demo follow-up completed.","IN_PROGRESS","CLOSED",null,null,"CONTACTED");
            }
        }
        b.add("vw_audit_event","id",id(dataset,"audit:seed"),"actor_id",owner,"store_id",null,"event_type","DEMO_DATASET_SEEDED","subject_id",id(dataset,"dataset"));return new Plan(List.copyOf(b.rows),List.copyOf(b.objects));
    }
    private static final class Builder {
        final String dataset,prefix;final List<Row> rows=new ArrayList<>();final List<DemoAssets.ObjectPlan> objects=new ArrayList<>();final DemoAssets assets;
        Builder(String dataset,String profile,DemoAssets assets){this.dataset=dataset;this.prefix="demo/"+dataset+"/";this.assets=assets;}
        Object json(Object value){return new SqlParameterValue(Types.OTHER,JSON.toJson(value));}
        void add(String table,Object... values){var row=new LinkedHashMap<String,Object>();row.put("dataset_id",dataset);for(int i=0;i<values.length;i+=2)row.put((String)values[i],values[i+1]);rows.add(new Row(table,row));}
        void logo(UUID id,UUID owner,UUID store,UUID product,UUID brand,String purpose,int index)throws IOException{image(id,owner,store,product,brand,purpose,assets.logo(index),0);}
        void image(UUID id,UUID owner,UUID store,UUID product,UUID brand,String purpose,ImageProcessor.Processed p,int position){String full=prefix+"catalog/"+id+"/content.jpg",thumb=prefix+"catalog/"+id+"/thumb.jpg";objects.add(new DemoAssets.ObjectPlan(full,"image/jpeg",p.image()));objects.add(new DemoAssets.ObjectPlan(thumb,"image/jpeg",p.thumbnail()));add("vw_media_upload","id",id,"owner_id",owner,"store_id",store,"product_id",product,"brand_id",brand,"purpose",purpose,"declared_mime","image/jpeg","declared_bytes",p.image().length,"token_hash",Inputs.hash("validated-demo-no-capability"),"state","VALIDATED","object_key",full,"thumbnail_key",thumb,"normalized_mime","image/jpeg","width",p.width(),"height",p.height(),"position",position,"expires_at",Timestamp.from(Instant.now()));}
        void video(UUID id,UUID owner,UUID store,UUID product,byte[] bytes){String key=prefix+"catalog/"+id+"/content.mp4";objects.add(new DemoAssets.ObjectPlan(key,"video/mp4",bytes));add("vw_media_upload","id",id,"owner_id",owner,"store_id",store,"product_id",product,"purpose","PRODUCT_VIDEO","declared_mime","video/mp4","declared_bytes",bytes.length,"token_hash",Inputs.hash("validated-demo-no-capability"),"state","VALIDATED","object_key",key,"normalized_mime","video/mp4","duration_seconds",BigDecimal.valueOf(assets.videoSeconds).setScale(3,java.math.RoundingMode.HALF_UP),"position",3,"expires_at",Timestamp.from(Instant.now()));}
        void event(UUID enquiry,UUID actor,String type,String visibility,String body,String from,String to,UUID old,UUID next,String outcome){add("vw_enquiry_event","enquiry_id",enquiry,"actor_id",actor,"event_type",type,"visibility",visibility,"body",body,"from_status",from,"to_status",to,"from_assignee_id",old,"to_assignee_id",next,"outcome",outcome);}
    }
}
