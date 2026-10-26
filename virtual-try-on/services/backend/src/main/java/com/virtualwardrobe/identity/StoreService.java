package com.virtualwardrobe.identity;

import java.sql.ResultSet;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StoreService {
    private final IdentityService identity;
    private final JdbcTemplate jdbc;
    public StoreService(IdentityService identity,JdbcTemplate jdbc){this.identity=identity;this.jdbc=jdbc;}
    public Map<String,Object> stores(boolean managed) {
        String sql="SELECT s.* FROM vw_store s";
        List<Map<String,Object>> items;
        if(!managed)items=jdbc.query(sql+" WHERE s.status='ACTIVE' ORDER BY s.name",(r,n)->store(r));
        else {var a=identity.workforce();items=a.superAdmin()?jdbc.query(sql+" ORDER BY s.name",(r,n)->store(r)):
            jdbc.query(sql+" WHERE EXISTS(SELECT 1 FROM vw_membership m WHERE m.store_id=s.id AND m.account_id=? AND m.state<>'REMOVED') ORDER BY s.name",(r,n)->store(r),a.id());}
        return Map.of("items",items,"page",0,"size",items.size(),"total",items.size());
    }
    public Map<String,Object> detail(UUID id) {
        var rows=jdbc.query("SELECT * FROM vw_store WHERE id=?",(r,n)->store(r),id);if(rows.isEmpty())throw ApiProblem.missing();
        var value=rows.getFirst();if(!value.get("status").equals("ACTIVE"))identity.requireStore(identity.workforce(),id,false);return value;
    }
    private Map<String,Object> store(ResultSet r)throws java.sql.SQLException {
        var map=new LinkedHashMap<String,Object>();map.put("id",r.getObject("id"));map.put("name",r.getString("name"));map.put("description",r.getString("description"));
        map.put("logoUrl",Objects.toString(r.getString("logo_url"),""));map.put("contactPhone",Objects.toString(r.getString("contact_phone"),""));map.put("status",r.getString("status"));return map;
    }
    @Transactional public Map<String,Object> create(Map<String,Object> body) {
        identity.lockAdministration();var actor=identity.superAdmin();UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO vw_store(id,name,description,contact_phone) VALUES(?,?,?,?)",id,Inputs.text(body,"name",120),Inputs.optional(body,"description",4000),Inputs.optional(body,"contactPhone",30));
        identity.audit(actor.id(),id,"STORE_CREATED",id);return detailForAdmin(id);
    }
    private Map<String,Object> detailForAdmin(UUID id){return jdbc.query("SELECT * FROM vw_store WHERE id=?",(r,n)->store(r),id).stream().findFirst().orElseThrow(ApiProblem::missing);}
    @Transactional public Map<String,Object> patch(UUID id,Map<String,Object> body) {
        identity.lockAdministration();var actor=identity.workforce();identity.lockStore(id);identity.requireStore(actor,id,true);
        var old=detailForAdmin(id);String name=body.containsKey("name")?Inputs.text(body,"name",120):(String)old.get("name");
        String description=body.containsKey("description")?Inputs.optional(body,"description",4000):(String)old.get("description");
        String phone=body.containsKey("contactPhone")?Inputs.optional(body,"contactPhone",30):(String)old.get("contactPhone");
        String logo=body.containsKey("logoUrl")?Inputs.optional(body,"logoUrl",2000):(String)old.get("logoUrl");
        if(!logo.isBlank()&&!logo.startsWith("https://")&&!(logo.startsWith("/")&&!logo.startsWith("//")))throw ApiProblem.bad("Logo must be a relative or HTTPS image URL");
        String status=body.containsKey("status")?Inputs.text(body,"status",20):(String)old.get("status");
        if(!Set.of("PENDING","ACTIVE","ARCHIVED").contains(status))throw ApiProblem.bad("Invalid store status");
        if(status.equals("ACTIVE")&&adminCount(id)==0)throw new ApiProblem(409,"LAST_STORE_ADMIN","An active store requires an accepted active admin");
        jdbc.update("UPDATE vw_store SET name=?,description=?,contact_phone=?,logo_url=?,status=? WHERE id=?",name,description,phone,logo,status,id);
        identity.audit(actor.id(),id,"STORE_UPDATED",id);return detailForAdmin(id);
    }
    public Map<String,Object> members(UUID storeId) {
        identity.requireStore(identity.workforce(),storeId,true);
        return Map.of("items",jdbc.query("SELECT m.id,m.account_id,a.name,a.normalized_identifier,m.role,m.state FROM vw_membership m JOIN vw_account a ON a.id=m.account_id WHERE m.store_id=? AND m.state<>'REMOVED' ORDER BY a.name",(r,n)->Map.of("id",r.getObject(1),"userId",r.getObject(2),"name",r.getString(3),"email",r.getString(4),"role",r.getString(5),"state",r.getString(6)),storeId));
    }
    public Map<String,Object> assignees(UUID storeId) {
        identity.requireStore(identity.workforce(),storeId,false);
        return Map.of("items",jdbc.query("SELECT a.id,a.name,m.role FROM vw_membership m JOIN vw_account a ON a.id=m.account_id WHERE m.store_id=? AND m.state='ACTIVE' AND a.enabled=TRUE ORDER BY a.name",(r,n)->Map.of("userId",r.getObject(1),"name",r.getString(2),"role",r.getString(3)),storeId));
    }
    @Transactional public Map<String,Object> provision(UUID storeId,Map<String,Object> body) {
        identity.lockAdministration();var actor=identity.workforce();identity.lockStore(storeId);identity.requireStore(actor,storeId,true);
        String email=Inputs.email(Inputs.text(body,"email",254)),name=Inputs.text(body,"name",120),role=Inputs.text(body,"role",20);
        checkRole(role);var users=jdbc.queryForList("SELECT id FROM vw_account WHERE kind='WORKFORCE' AND normalized_identifier=?",UUID.class,email);
        UUID userId;String temporary=null;
        if(users.isEmpty()){userId=UUID.randomUUID();temporary=Inputs.secret();insertWorkforce(userId,name,email,false,temporary);}
        else {userId=users.getFirst();if(!identity.find(userId).enabled())throw new ApiProblem(409,"ACCOUNT_UNAVAILABLE","This account is unavailable for invitation");}
        UUID membership=UUID.randomUUID();
        var old=jdbc.queryForList("SELECT id FROM vw_membership WHERE store_id=? AND account_id=?",UUID.class,storeId,userId);
        if(old.isEmpty())jdbc.update("INSERT INTO vw_membership(id,store_id,account_id,role,state,invited_by) VALUES(?,?,?,?,'INVITED',?)",membership,storeId,userId,role,actor.id());
        else {
            membership=old.getFirst();String state=jdbc.queryForObject("SELECT state FROM vw_membership WHERE id=?",String.class,membership);
            if(!state.equals("REMOVED"))throw new ApiProblem(409,"MEMBERSHIP_EXISTS","This person already has a membership or invitation here");
            jdbc.update("UPDATE vw_membership SET role=?,state='INVITED',accepted_at=NULL,invited_by=? WHERE id=?",role,actor.id(),membership);
        }
        identity.audit(actor.id(),storeId,"MEMBERSHIP_INVITED",membership);
        var result=new LinkedHashMap<String,Object>();result.put("user",identity.user(identity.find(userId),actor.superAdmin()?null:storeId));
        result.put("membership",membership(membership));if(temporary!=null)result.put("temporaryPassword",temporary);return result;
    }
    private void checkRole(String role){if(!Set.of("STORE_ADMIN","STAFF").contains(role))throw ApiProblem.bad("Invalid store role");}
    private Map<String,Object> membership(UUID id) {return jdbc.query("SELECT id,account_id,store_id,role,state FROM vw_membership WHERE id=?",(r,n)->Map.<String,Object>of("id",r.getObject(1),"userId",r.getObject(2),"storeId",r.getObject(3),"role",r.getString(4),"state",r.getString(5)),id).stream().findFirst().orElseThrow(ApiProblem::missing);}
    @Transactional public Map<String,Object> changeMember(UUID storeId,UUID membershipId,Map<String,Object> body,boolean remove) {
        identity.lockAdministration();var actor=identity.workforce();identity.lockStore(storeId);identity.requireStore(actor,storeId,true);
        var member=membership(membershipId);if(!storeId.equals(member.get("storeId")))throw ApiProblem.missing();
        String role=body.containsKey("role")?Inputs.text(body,"role",20):(String)member.get("role");checkRole(role);
        String state=remove?"REMOVED":body.containsKey("state")?Inputs.text(body,"state",20):(String)member.get("state");
        if(!remove&&!Set.of("ACTIVE","INVITED").contains(state))throw ApiProblem.bad("Invalid membership state");
        if(state.equals("ACTIVE")&&!member.get("state").equals("ACTIVE"))throw new ApiProblem(409,"INVITATION_ACCEPTANCE_REQUIRED","This person must accept their invitation while signed in");
        jdbc.update("UPDATE vw_membership SET role=?,state=? WHERE id=?",role,state,membershipId);assertStoreAdmin(storeId);
        if(!state.equals("ACTIVE"))identity.events().publishEvent(new IdentityService.MembershipRevoked(storeId,(UUID)member.get("userId"),actor.id()));
        identity.audit(actor.id(),storeId,remove?"MEMBERSHIP_REMOVED":"MEMBERSHIP_UPDATED",membershipId);return membership(membershipId);
    }
    @Transactional public void accept(UUID membershipId) {
        identity.lockAdministration();var actor=identity.workforce();var member=membership(membershipId);UUID store=(UUID)member.get("storeId");identity.lockStore(store);
        if(!actor.id().equals(member.get("userId")))throw ApiProblem.missing();if(!member.get("state").equals("INVITED"))throw new ApiProblem(409,"INVITATION_UNAVAILABLE","This invitation is no longer pending");
        jdbc.update("UPDATE vw_membership SET state='ACTIVE',accepted_at=CURRENT_TIMESTAMP WHERE id=?",membershipId);identity.audit(actor.id(),store,"INVITATION_ACCEPTED",membershipId);
    }
    private int adminCount(UUID store) {return jdbc.queryForObject("SELECT count(*) FROM vw_membership m JOIN vw_account a ON a.id=m.account_id WHERE m.store_id=? AND m.role='STORE_ADMIN' AND m.state='ACTIVE' AND a.enabled=TRUE",Integer.class,store);}
    private void assertStoreAdmin(UUID store) {
        String status=jdbc.queryForObject("SELECT status FROM vw_store WHERE id=?",String.class,store);
        if("ACTIVE".equals(status)&&adminCount(store)==0)throw new ApiProblem(409,"LAST_STORE_ADMIN","The final active store admin cannot be removed, disabled or demoted");
    }
    private void insertWorkforce(UUID id,String name,String email,boolean superAdmin,String temporary) {
        jdbc.update("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash,super_admin,password_change_required,temp_password_expires_at) VALUES(?,'WORKFORCE',?,?,?,?,TRUE,CURRENT_TIMESTAMP+INTERVAL '24 hours')",id,name,email,identity.encoder().encode(temporary),superAdmin);
    }
    public Map<String,Object> workforceList(int page,int size) {
        identity.superAdmin();int p=Math.max(0,page),s=Math.min(100,Math.max(1,size));
        var users=jdbc.queryForList("SELECT id FROM vw_account WHERE kind='WORKFORCE' ORDER BY created_at LIMIT ? OFFSET ?",UUID.class,s,p*s);
        return Map.of("items",users.stream().map(id->identity.user(identity.find(id))).toList(),"page",p,"size",s,"total",jdbc.queryForObject("SELECT count(*) FROM vw_account WHERE kind='WORKFORCE'",Integer.class));
    }
    @Transactional public Map<String,Object> createWorkforce(Map<String,Object> body) {
        identity.lockAdministration();var actor=identity.superAdmin();UUID id=UUID.randomUUID();String temporary=Inputs.secret();
        insertWorkforce(id,Inputs.text(body,"name",120),Inputs.email(Inputs.text(body,"email",254)),Boolean.TRUE.equals(body.get("superAdmin")),temporary);
        identity.audit(actor.id(),null,"WORKFORCE_CREATED",id);return Map.of("user",identity.user(identity.find(id)),"temporaryPassword",temporary);
    }
    @Transactional public Map<String,Object> patchWorkforce(UUID id,Map<String,Object> body) {
        identity.lockAdministration();var actor=identity.superAdmin();var target=identity.find(id);if(!target.kind().equals("WORKFORCE"))throw ApiProblem.missing();
        List<UUID> stores=jdbc.queryForList("SELECT store_id FROM vw_membership WHERE account_id=? ORDER BY store_id",UUID.class,id);stores.forEach(identity::lockStore);
        boolean enabled=body.containsKey("enabled")?Boolean.TRUE.equals(body.get("enabled")):target.enabled();
        boolean superAdmin=body.containsKey("superAdmin")?Boolean.TRUE.equals(body.get("superAdmin")):target.superAdmin();
        jdbc.update("UPDATE vw_account SET enabled=?,super_admin=?,credential_version=credential_version+CASE WHEN enabled=TRUE AND ?=FALSE THEN 1 ELSE 0 END WHERE id=?",enabled,superAdmin,enabled,id);
        if(jdbc.queryForObject("SELECT count(*) FROM vw_account WHERE kind='WORKFORCE' AND enabled=TRUE AND super_admin=TRUE",Integer.class)==0)throw new ApiProblem(409,"LAST_SUPER_ADMIN","The final active super admin cannot be removed, disabled or demoted");
        stores.forEach(this::assertStoreAdmin);
        if(!enabled){identity.revokeSessions(id);for(UUID store:stores)identity.events().publishEvent(new IdentityService.MembershipRevoked(store,id,actor.id()));}
        if(enabled!=target.enabled()||superAdmin!=target.superAdmin())identity.events().publishEvent(new IdentityService.WorkforceAccessChanged(id,actor.id()));
        identity.audit(actor.id(),null,"WORKFORCE_UPDATED",id);return identity.user(identity.find(id));
    }
    @Transactional public Map<String,Object> resetWorkforce(UUID id) {
        identity.lockAdministration();var actor=identity.superAdmin();var target=identity.find(id);if(!target.kind().equals("WORKFORCE"))throw ApiProblem.missing();
        if(actor.id().equals(id))throw new ApiProblem(409,"SELF_RESET_UNAVAILABLE","Use Change password to update your own password");
        String temporary=Inputs.secret();jdbc.update("UPDATE vw_account SET password_hash=?,password_change_required=TRUE,temp_password_expires_at=CURRENT_TIMESTAMP+INTERVAL '24 hours',credential_version=credential_version+1 WHERE id=?",identity.encoder().encode(temporary),id);
        identity.revokeSessions(id);identity.audit(actor.id(),null,"WORKFORCE_PASSWORD_RESET",id);return Map.of("user",identity.user(identity.find(id)),"temporaryPassword",temporary);
    }
    @Transactional public Map<String,Object> bootstrap(String email,String suppliedPassword) {
        identity.lockAdministration();if(jdbc.queryForObject("SELECT count(*) FROM vw_account WHERE kind='WORKFORCE' AND super_admin=TRUE",Integer.class)>0)return Map.of("created",false);
        String temporary=suppliedPassword==null||suppliedPassword.isBlank()?Inputs.secret():Inputs.password(Map.of("password",suppliedPassword),"password");
        UUID id=UUID.randomUUID();insertWorkforce(id,"Super admin",Inputs.email(email),true,temporary);identity.audit(id,null,"SUPER_ADMIN_BOOTSTRAPPED",id);
        return Map.of("created",true,"email",email,"temporaryPassword",temporary,"userId",id);
    }
}
