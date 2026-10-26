package com.virtualwardrobe.catalog;

import com.google.gson.Gson;
import com.virtualwardrobe.identity.*;
import com.virtualwardrobe.media.MediaRecord;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {
    private final JdbcTemplate jdbc;private final IdentityService identity;private final Gson json=new Gson();
    private static final String SELECT="SELECT p.*,s.name AS store_name,b.name AS brand_name FROM vw_product p JOIN vw_store s ON s.id=p.store_id LEFT JOIN vw_brand b ON b.id=p.brand_id";
    public CatalogService(JdbcTemplate jdbc,IdentityService identity){this.jdbc=jdbc;this.identity=identity;}
    private UUID nullableId(Map<String,Object> body,String key){return body.get(key)==null||body.get(key).equals("")?null:Inputs.id(body.get(key).toString());}
    public Map<String,Object> categories(){
        var flat=jdbc.query("SELECT id,parent_id,name FROM vw_category ORDER BY name",(r,n)->{var m=new LinkedHashMap<String,Object>();m.put("id",r.getObject(1));m.put("parentId",r.getObject(2));m.put("name",r.getString(3));m.put("children",new ArrayList<Map<String,Object>>());return m;});
        Map<Object,Map<String,Object>> indexed=new LinkedHashMap<>();flat.forEach(v->indexed.put(v.get("id"),v));List<Map<String,Object>> roots=new ArrayList<>();
        for(var row:flat){Object parent=row.get("parentId");if(parent==null||!indexed.containsKey(parent))roots.add(row);else { @SuppressWarnings("unchecked")var children=(List<Map<String,Object>>)indexed.get(parent).get("children");children.add(row);}}
        return Map.of("items",roots);
    }
    @Transactional public Map<String,Object> category(UUID id,Map<String,Object> body){
        identity.lockAdministration();var actor=identity.superAdmin();String name=Inputs.text(body,"name",120);UUID parent=nullableId(body,"parentId");
        if(jdbc.queryForObject("SELECT count(*) FROM vw_category WHERE parent_id IS NOT DISTINCT FROM ? AND LOWER(name)=LOWER(?) AND id<>?",Integer.class,parent,name,id==null?new UUID(0,0):id)>0)throw new ApiProblem(409,"CATEGORY_EXISTS","That category already exists under this parent");
        if(parent!=null){if(jdbc.queryForObject("SELECT count(*) FROM vw_category WHERE id=?",Integer.class,parent)==0)throw ApiProblem.bad("Select an existing parent category");
            if(id!=null){int cycle=jdbc.queryForObject("WITH RECURSIVE descendants AS(SELECT id FROM vw_category WHERE id=? UNION ALL SELECT c.id FROM vw_category c JOIN descendants d ON c.parent_id=d.id) SELECT count(*) FROM descendants WHERE id=?",Integer.class,id,parent);if(cycle>0)throw ApiProblem.bad("Category hierarchy cannot contain a cycle");}}
        UUID target=id==null?UUID.randomUUID():id;
        if(id==null)jdbc.update("INSERT INTO vw_category(id,parent_id,name) VALUES(?,?,?)",target,parent,name);
        else if(jdbc.update("UPDATE vw_category SET name=?,parent_id=? WHERE id=?",name,parent,id)!=1)throw ApiProblem.missing();
        identity.audit(actor.id(),null,"CATEGORY_UPDATED",target);return new LinkedHashMap<>(Map.of("id",target,"name",name,"children",List.of())){{put("parentId",parent);}};
    }
    public Map<String,Object> brands(UUID store){
        List<Map<String,Object>> values;
        if(store==null)values=jdbc.query("SELECT b.* FROM vw_brand b LEFT JOIN vw_store s ON s.id=b.store_id WHERE b.store_id IS NULL OR s.status='ACTIVE' ORDER BY b.name",(r,n)->brand(r));
        else {
            String state=jdbc.query("SELECT status FROM vw_store WHERE id=?",(r,n)->r.getString(1),store).stream().findFirst().orElseThrow(ApiProblem::missing);
            if(!state.equals("ACTIVE"))identity.requireStore(identity.workforce(),store,false);
            values=jdbc.query("SELECT * FROM vw_brand WHERE store_id IS NULL OR store_id=? ORDER BY name",(r,n)->brand(r),store);
        }return Map.of("items",values);
    }
    private Map<String,Object> brand(ResultSet r)throws java.sql.SQLException{var m=new LinkedHashMap<String,Object>();m.put("id",r.getObject("id"));m.put("storeId",r.getObject("store_id"));m.put("name",r.getString("name"));Object logo=r.getObject("logo_media_id");if(logo!=null)m.put("logoUrl","/api/v1/media/"+logo+"/thumbnail");return m;}
    @Transactional public Map<String,Object> brand(UUID store,UUID id,Map<String,Object> body){
        identity.lockAdministration();var actor=identity.workforce();if(store==null){if(!actor.superAdmin())throw ApiProblem.forbidden();}else{identity.lockStore(store);identity.requireStore(actor,store,false);}
        String name=Inputs.text(body,"name",120);UUID target=id==null?UUID.randomUUID():id;
        if(id==null)jdbc.update("INSERT INTO vw_brand(id,store_id,name) VALUES(?,?,?)",target,store,name);
        else {var existing=jdbc.query("SELECT * FROM vw_brand WHERE id=?",(r,n)->brand(r),id).stream().findFirst().orElseThrow(ApiProblem::missing);if(!Objects.equals(existing.get("storeId"),store))throw ApiProblem.missing();jdbc.update("UPDATE vw_brand SET name=? WHERE id=?",name,id);}
        identity.audit(actor.id(),store,"BRAND_UPDATED",target);return jdbc.query("SELECT * FROM vw_brand WHERE id=?",(r,n)->brand(r),target).getFirst();
    }
    public Map<String,Object> products(Map<String,String> filters,UUID managedStore){
        int page=integer(filters.get("page"),0,0,1_000_000),size=integer(filters.get("size"),24,1,100);StringBuilder where=new StringBuilder(" WHERE 1=1");List<Object> args=new ArrayList<>();
        if(managedStore==null){where.append(" AND p.status='PUBLISHED' AND s.status='ACTIVE'");}
        else {identity.requireStore(identity.workforce(),managedStore,false);where.append(" AND p.store_id=?");args.add(managedStore);if(filters.containsKey("status")&&!filters.get("status").isBlank()){where.append(" AND p.status=?");args.add(filters.get("status"));}}
        if(filters.get("q")!=null&&!filters.get("q").isBlank()){String q="%"+filters.get("q").trim().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";where.append(" AND (p.title ILIKE ? OR p.description ILIKE ? OR COALESCE(b.name,'') ILIKE ? OR p.labels::text ILIKE ?)");for(int i=0;i<4;i++)args.add(q);}
        for(String field:List.of("storeId","brandId"))if(filters.containsKey(field)&&!filters.get(field).isBlank()){where.append(field.equals("storeId")?" AND p.store_id=?":" AND p.brand_id=?");args.add(Inputs.id(filters.get(field)));}
        if(filters.containsKey("categoryId")&&!filters.get("categoryId").isBlank()){where.append(" AND p.category_id IN(WITH RECURSIVE c AS(SELECT id FROM vw_category WHERE id=? UNION ALL SELECT child.id FROM vw_category child JOIN c ON child.parent_id=c.id) SELECT id FROM c)");args.add(Inputs.id(filters.get("categoryId")));}
        if(filters.containsKey("label")&&!filters.get("label").isBlank()){where.append(" AND p.labels @> ?::jsonb");args.add(json.toJson(List.of(filters.get("label").trim().toLowerCase(Locale.ROOT))));}
        for(String field:List.of("minPrice","maxPrice"))if(filters.containsKey(field)&&!filters.get(field).isBlank()){where.append(field.equals("minPrice")?" AND p.price>=?":" AND p.price<=?");args.add(price(filters.get(field)));}
        String order=switch(filters.getOrDefault("sort","newest")){case "price_asc"->"p.price ASC,p.id";case "price_desc"->"p.price DESC,p.id";case "newest"->"p.created_at DESC,p.id";default->throw ApiProblem.bad("Invalid product sort");};
        int total=jdbc.queryForObject("SELECT count(*) FROM vw_product p JOIN vw_store s ON s.id=p.store_id LEFT JOIN vw_brand b ON b.id=p.brand_id"+where,Integer.class,args.toArray());
        List<Object> pageArgs=new ArrayList<>(args);pageArgs.add(size);pageArgs.add(page*size);
        var values=jdbc.query(SELECT+where+" ORDER BY "+order+" LIMIT ? OFFSET ?",(r,n)->productBase(r),pageArgs.toArray());
        return Map.of("items",hydrate(values),"page",page,"size",size,"total",total);
    }
    public Map<String,Object> product(UUID id){
        var values=jdbc.query(SELECT+" WHERE p.id=?",(r,n)->productBase(r),id);if(values.isEmpty())throw ApiProblem.missing();var row=values.getFirst();
        String storeStatus=jdbc.queryForObject("SELECT status FROM vw_store WHERE id=?",String.class,row.get("storeId"));
        if(!row.get("status").equals("PUBLISHED")||!"ACTIVE".equals(storeStatus)){
            try{identity.requireStore(identity.workforce(),(UUID)row.get("storeId"),false);}catch(ApiProblem denied){throw ApiProblem.missing();}
        }
        return hydrate(values).getFirst();
    }
    private Map<String,Object> productBase(ResultSet r)throws java.sql.SQLException{
        var m=new LinkedHashMap<String,Object>();for(String[] field:new String[][]{{"id","id"},{"storeId","store_id"},{"categoryId","category_id"},{"brandId","brand_id"},{"coverMediaId","cover_media_id"},{"referenceMediaId","reference_media_id"}})m.put(field[0],r.getObject(field[1]));
        for(String[] field:new String[][]{{"storeName","store_name"},{"sku","sku"},{"title","title"},{"description","description"},{"brandName","brand_name"},{"fabric","fabric"},{"colour","colour"},{"size","size"},{"status","status"},{"availability","availability"}})m.put(field[0],Objects.toString(r.getString(field[1]),""));
        m.put("price",r.getBigDecimal("price").toPlainString());m.put("currency","INR");m.put("labels",Arrays.asList(json.fromJson(r.getString("labels"),String[].class)));m.put("tryOnEnabled",r.getBoolean("try_on_enabled"));m.put("createdAt",r.getTimestamp("created_at").toInstant().toString());m.put("updatedAt",r.getTimestamp("updated_at").toInstant().toString());return m;
    }
    private List<Map<String,Object>> hydrate(List<Map<String,Object>> products){
        if(products.isEmpty())return products;Map<UUID,List<MediaRecord>> grouped=new HashMap<>();String placeholders=String.join(",",Collections.nCopies(products.size(),"?"));
        jdbc.query("SELECT * FROM vw_media_upload WHERE product_id IN("+placeholders+") AND state='VALIDATED' AND purpose IN('PRODUCT_IMAGE','PRODUCT_VIDEO') ORDER BY position,created_at",MediaRecord.MAPPER,products.stream().map(m->m.get("id")).toArray()).forEach(m->grouped.computeIfAbsent(m.productId(),k->new ArrayList<>()).add(m));
        var categories=jdbc.queryForList("SELECT id,parent_id,name FROM vw_category");Map<Object,Map<String,Object>> categoryMap=new HashMap<>();categories.forEach(c->categoryMap.put(c.get("id"),c));
        for(var product:products){var media=grouped.getOrDefault(product.get("id"),List.of());product.put("media",media.stream().map(MediaRecord::dto).toList());var images=media.stream().filter(m->!m.video()).toList();
            UUID cover=(UUID)product.get("coverMediaId");MediaRecord chosen=images.stream().filter(m->m.id().equals(cover)).findFirst().orElse(images.isEmpty()?null:images.getFirst());if(chosen!=null)product.put("coverUrl","/api/v1/media/"+chosen.id()+"/thumbnail");
            List<String> path=new ArrayList<>();Object category=product.get("categoryId");Set<Object> seen=new HashSet<>();while(category!=null&&categoryMap.containsKey(category)&&seen.add(category)){var c=categoryMap.get(category);path.addFirst((String)c.get("name"));category=c.get("parent_id");}product.put("categoryPath",path);
        }return products;
    }
    private int integer(String s,int fallback,int min,int max){try{return s==null?fallback:Math.min(max,Math.max(min,Integer.parseInt(s)));}catch(Exception e){throw ApiProblem.bad("Invalid pagination");}}
    private BigDecimal price(Object value){try{var p=new BigDecimal(value.toString()).setScale(2,java.math.RoundingMode.UNNECESSARY);if(p.signum()<0||p.precision()>12)throw new IllegalArgumentException();return p;}catch(Exception e){throw ApiProblem.bad("Enter a valid non-negative INR price with at most 2 decimal places");}}
    @Transactional public Map<String,Object> create(UUID store,Map<String,Object> body){
        identity.lockAdministration();var actor=identity.workforce();identity.lockStore(store);identity.requireStore(actor,store,false);UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO vw_product(id,store_id,sku,title) VALUES(?,?,?,?)",id,store,Inputs.text(body,"sku",80).toUpperCase(Locale.ROOT),Inputs.text(body,"title",180));
        return updateLocked(actor,store,id,body);
    }
    @Transactional public Map<String,Object> patch(UUID store,UUID id,Map<String,Object> body){identity.lockAdministration();var actor=identity.workforce();identity.lockStore(store);identity.requireStore(actor,store,false);lockProduct(store,id);return updateLocked(actor,store,id,body);}
    public void lockProduct(UUID store,UUID id){if(jdbc.query("SELECT id FROM vw_product WHERE id=? AND store_id=? FOR UPDATE",(r,n)->r.getObject(1),id,store).isEmpty())throw ApiProblem.missing();}
    private Map<String,Object> updateLocked(IdentityService.Account actor,UUID store,UUID id,Map<String,Object> body){
        var old=jdbc.query(SELECT+" WHERE p.id=?",(r,n)->productBase(r),id).getFirst();
        String sku=body.containsKey("sku")?Inputs.text(body,"sku",80).toUpperCase(Locale.ROOT):(String)old.get("sku"),title=body.containsKey("title")?Inputs.text(body,"title",180):(String)old.get("title");
        String description=body.containsKey("description")?Inputs.optional(body,"description",8000):(String)old.get("description");
        UUID category=body.containsKey("categoryId")?nullableId(body,"categoryId"):(UUID)old.get("categoryId"),brand=body.containsKey("brandId")?nullableId(body,"brandId"):(UUID)old.get("brandId");
        if(category!=null&&jdbc.queryForObject("SELECT count(*) FROM vw_category WHERE id=?",Integer.class,category)==0)throw ApiProblem.bad("Select an existing category");
        if(brand!=null&&jdbc.queryForObject("SELECT count(*) FROM vw_brand WHERE id=? AND (store_id IS NULL OR store_id=?)",Integer.class,brand,store)==0)throw ApiProblem.bad("Brand is unavailable for this store");
        Object labels=old.get("labels");if(body.containsKey("labels")){if(!(body.get("labels") instanceof List<?> list)||list.size()>20)throw ApiProblem.bad("Use at most 20 labels");List<String> normalized=new ArrayList<>();for(Object label:list){if(!(label instanceof String text)||text.isBlank()||text.length()>50)throw ApiProblem.bad("Labels must contain 1–50 characters");normalized.add(text.trim().toLowerCase(Locale.ROOT));}labels=normalized.stream().distinct().toList();}
        BigDecimal amount=price(body.getOrDefault("price",old.get("price")));String fabric=body.containsKey("fabric")?Inputs.optional(body,"fabric",120):(String)old.get("fabric"),colour=body.containsKey("colour")?Inputs.optional(body,"colour",120):(String)old.get("colour"),size=body.containsKey("size")?Inputs.optional(body,"size",120):(String)old.get("size");
        String status=body.containsKey("status")?Inputs.text(body,"status",20):(String)old.get("status"),availability=body.containsKey("availability")?Inputs.text(body,"availability",20):(String)old.get("availability");
        if(!Set.of("DRAFT","PUBLISHED","ARCHIVED").contains(status)||!Set.of("AVAILABLE","UNAVAILABLE").contains(availability))throw ApiProblem.bad("Invalid product state");
        if(body.containsKey("tryOnEnabled")&&!(body.get("tryOnEnabled") instanceof Boolean))throw ApiProblem.bad("tryOnEnabled must be true or false");
        boolean tryOn=body.containsKey("tryOnEnabled")?Boolean.TRUE.equals(body.get("tryOnEnabled")):(boolean)old.get("tryOnEnabled");
        var media=jdbc.query("SELECT * FROM vw_media_upload WHERE product_id=? AND state='VALIDATED' AND purpose IN('PRODUCT_IMAGE','PRODUCT_VIDEO') ORDER BY position,created_at",MediaRecord.MAPPER,id);var images=media.stream().filter(m->!m.video()).toList();
        UUID cover=body.containsKey("coverMediaId")?nullableId(body,"coverMediaId"):(UUID)old.get("coverMediaId"),reference=body.containsKey("referenceMediaId")?nullableId(body,"referenceMediaId"):(UUID)old.get("referenceMediaId");
        if(cover==null&&!images.isEmpty())cover=images.getFirst().id();if(reference==null&&!images.isEmpty())reference=images.getFirst().id();
        for(UUID selected:Arrays.asList(cover,reference))if(selected!=null&&images.stream().noneMatch(m->m.id().equals(selected)))throw ApiProblem.bad("Cover/reference must be this product's validated image");
        if(body.containsKey("mediaOrder")){if(!(body.get("mediaOrder") instanceof List<?> order)||order.size()!=media.size())throw new ApiProblem(409,"MEDIA_CHANGED","Refresh the product before reordering media");List<UUID> ids=order.stream().map(v->{if(!(v instanceof String s))throw ApiProblem.bad("Media IDs must be strings");return Inputs.id(s);}).toList();if(new HashSet<>(ids).size()!=media.size()||!new HashSet<>(ids).equals(new HashSet<>(media.stream().map(MediaRecord::id).toList())))throw ApiProblem.bad("Media order must contain exactly this product's validated media");for(int i=0;i<ids.size();i++)jdbc.update("UPDATE vw_media_upload SET position=? WHERE id=?",i,ids.get(i));}
        if(status.equals("PUBLISHED")&&(category==null||images.isEmpty()))throw ApiProblem.bad("Publishing requires a category and at least one validated image");
        jdbc.update("UPDATE vw_product SET sku=?,title=?,description=?,category_id=?,brand_id=?,labels=?::jsonb,price=?,fabric=?,colour=?,size=?,status=?,availability=?,try_on_enabled=?,cover_media_id=?,reference_media_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",sku,title,description,category,brand,json.toJson(labels),amount,fabric,colour,size,status,availability,tryOn,cover,reference,id);
        identity.audit(actor.id(),store,"PRODUCT_UPDATED",id);return product(id);
    }
    @Transactional public void archive(UUID store,UUID id){patch(store,id,Map.of("status","ARCHIVED"));}
}
