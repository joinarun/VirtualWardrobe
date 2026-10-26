package com.virtualwardrobe.identity;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdentityService {
    public record Account(UUID id,String kind,String name,String identifier,String hash,boolean enabled,boolean superAdmin,boolean passwordChangeRequired,Instant temporaryExpires,long credentialVersion) { }
    public record MembershipRevoked(UUID storeId,UUID accountId,UUID actorId) { }
    public record WorkforceAccessChanged(UUID accountId,UUID actorId) { }
    public record AccountDeleted(UUID accountId) { }
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final ApplicationEventPublisher events;
    private final String dummyHash;
    private static final RowMapper<Account> ACCOUNT=(rs,n)->new Account(rs.getObject("id",UUID.class),rs.getString("kind"),rs.getString("name"),rs.getString("normalized_identifier"),rs.getString("password_hash"),rs.getBoolean("enabled"),rs.getBoolean("super_admin"),rs.getBoolean("password_change_required"),rs.getTimestamp("temp_password_expires_at")==null?null:rs.getTimestamp("temp_password_expires_at").toInstant(),rs.getLong("credential_version"));
    public IdentityService(JdbcTemplate jdbc,PasswordEncoder passwords,ApplicationEventPublisher events){this.jdbc=jdbc;this.passwords=passwords;this.events=events;this.dummyHash=passwords.encode(Inputs.secret());}
    public Account find(UUID id) { return jdbc.query("SELECT * FROM vw_account WHERE id=?",ACCOUNT,id).stream().findFirst().orElseThrow(ApiProblem::missing); }
    public Account current() {
        var auth=SecurityContextHolder.getContext().getAuthentication();
        if(auth==null||!auth.isAuthenticated()||auth.getName().equals("anonymousUser"))throw new ApiProblem(401,"LOGIN_REQUIRED","Please sign in");
        Account account=find(Inputs.id(auth.getName()));
        if(!account.enabled())throw new ApiProblem(401,"LOGIN_REQUIRED","Please sign in");return account;
    }
    public Account workforce() {Account a=current();if(!a.kind().equals("WORKFORCE"))throw ApiProblem.forbidden();businessReady(a);return a;}
    public Account customer() {Account a=current();if(!a.kind().equals("CUSTOMER"))throw ApiProblem.forbidden();return a;}
    public void businessReady(Account a) {if(a.passwordChangeRequired())throw new ApiProblem(403,"PASSWORD_CHANGE_REQUIRED","Change your temporary password before continuing");}
    public Account superAdmin(){Account a=workforce();if(!a.superAdmin())throw ApiProblem.forbidden();return a;}
    public Account login(String kind,String identifier,String password) {
        if(!Set.of("CUSTOMER","WORKFORCE").contains(kind))throw invalidLogin();
        String normalized;
        try {normalized=kind.equals("WORKFORCE")?Inputs.email(identifier):Inputs.phone("+91",identifier);}catch(ApiProblem p){matches(password,dummyHash);throw invalidLogin();}
        var found=jdbc.query("SELECT * FROM vw_account WHERE kind=? AND normalized_identifier=?",ACCOUNT,kind,normalized);
        Account a=found.isEmpty()?null:found.getFirst();
        boolean match=matches(password,a==null?dummyHash:a.hash());
        if(a==null||!match||!a.enabled()||(a.temporaryExpires()!=null&&a.temporaryExpires().isBefore(Instant.now())))throw invalidLogin();return a;
    }
    private ApiProblem invalidLogin(){return new ApiProblem(401,"INVALID_CREDENTIALS","Sign-in details are incorrect or unavailable");}
    private boolean matches(String raw,String encoded) {
        if(raw==null||raw.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72)return false;
        try{return passwords.matches(raw,encoded);}catch(IllegalArgumentException e){return false;}
    }

    @Transactional public Map<String,Object> signup(Map<String,Object> body) {
        if(!Boolean.TRUE.equals(body.get("privacyAccepted")))throw ApiProblem.bad("Accept the privacy notice to continue");
        String name=Inputs.text(body,"name",120),phone=Inputs.phone(Inputs.text(body,"countryCode",5),Inputs.text(body,"mobile",30)),password=Inputs.password(body,"password");
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash) VALUES(?,'CUSTOMER',?,?,?)",id,name,phone,passwords.encode(password));
        List<String> codes=new ArrayList<>();
        for(int i=0;i<8;i++){String code=Inputs.secret();codes.add(code);jdbc.update("INSERT INTO vw_recovery_code(id,account_id,code_hash) VALUES(?,?,?)",UUID.randomUUID(),id,Inputs.hash(code));}
        audit(id,null,"CUSTOMER_SIGNUP",id);
        return Map.of("user",user(find(id)),"recoveryCodes",codes);
    }
    @Transactional public void recover(Map<String,Object> body) {
        String phone=Inputs.phone("+91",Inputs.text(body,"phone",30));String code=Inputs.text(body,"recoveryCode",200);String password=Inputs.password(body,"newPassword");
        var found=jdbc.query("SELECT * FROM vw_account WHERE kind='CUSTOMER' AND normalized_identifier=? FOR UPDATE",ACCOUNT,phone);
        if(found.isEmpty()||!found.getFirst().enabled())throw invalidRecovery();Account a=found.getFirst();
        int used=jdbc.update("UPDATE vw_recovery_code SET used_at=CURRENT_TIMESTAMP WHERE account_id=? AND code_hash=? AND used_at IS NULL",a.id(),Inputs.hash(code));
        if(used!=1)throw invalidRecovery();
        jdbc.update("UPDATE vw_account SET password_hash=?,credential_version=credential_version+1 WHERE id=?",passwords.encode(password),a.id());revokeSessions(a.id());audit(a.id(),null,"CUSTOMER_RECOVERED",a.id());
    }
    private ApiProblem invalidRecovery(){return new ApiProblem(401,"INVALID_RECOVERY","Recovery details are incorrect or unavailable");}
    @Transactional public Account changePassword(Account a,Map<String,Object> body) {
        String current=Inputs.credential(body,"currentPassword"),replacement=Inputs.password(body,"newPassword");
        var locked=jdbc.query("SELECT * FROM vw_account WHERE id=? FOR UPDATE",ACCOUNT,a.id()).getFirst();
        if(!matches(current,locked.hash()))throw invalidLogin();
        jdbc.update("UPDATE vw_account SET password_hash=?,password_change_required=FALSE,temp_password_expires_at=NULL,credential_version=credential_version+1 WHERE id=?",passwords.encode(replacement),a.id());
        revokeSessions(a.id());audit(a.id(),null,"PASSWORD_CHANGED",a.id());return find(a.id());
    }
    @Transactional public void deleteCustomer(Account a,Map<String,Object> body) {
        if(!a.kind().equals("CUSTOMER"))throw ApiProblem.forbidden();
        if(!Boolean.TRUE.equals(body.get("confirm"))||!matches(Inputs.credential(body,"password"),a.hash()))throw invalidLogin();
        jdbc.update("UPDATE vw_account SET enabled=FALSE,deleted_at=CURRENT_TIMESTAMP,name='Deleted account',normalized_identifier=?,password_hash=?,credential_version=credential_version+1 WHERE id=?","deleted:"+a.id(),passwords.encode(Inputs.secret()),a.id());
        jdbc.update("DELETE FROM vw_recovery_code WHERE account_id=?",a.id());revokeSessions(a.id());
        events.publishEvent(new AccountDeleted(a.id()));audit(a.id(),null,"CUSTOMER_DELETION_REQUESTED",a.id());
    }
    public void revokeSessions(UUID id){jdbc.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?",id.toString());}

    public Map<String,Object> user(Account a){return user(a,null);}
    public Map<String,Object> user(Account a,UUID storeScope) {
        var result=new LinkedHashMap<String,Object>();result.put("id",a.id());result.put("kind",a.kind());result.put("name",a.name());
        result.put(a.kind().equals("CUSTOMER")?"phone":"email",a.identifier());if(a.kind().equals("CUSTOMER"))result.put("phoneVerified",false);
        result.put("enabled",a.enabled());result.put("superAdmin",a.superAdmin());result.put("passwordChangeRequired",a.passwordChangeRequired());
        String sql="SELECT m.id,m.store_id,s.name,m.role,m.state FROM vw_membership m JOIN vw_store s ON s.id=m.store_id WHERE m.account_id=? AND m.state<>'REMOVED'";
        List<Map<String,Object>> memberships=storeScope==null?jdbc.query(sql,(r,n)->membershipSummary(r),a.id()):jdbc.query(sql+" AND m.store_id=?",(r,n)->membershipSummary(r),a.id(),storeScope);
        result.put("memberships",memberships);return result;
    }
    private Map<String,Object> membershipSummary(ResultSet r)throws java.sql.SQLException {
        return Map.of("membershipId",r.getObject(1),"storeId",r.getObject(2),"storeName",r.getString(3),"role",r.getString(4),"state",r.getString(5));
    }
    public void requireStore(Account a,UUID storeId,boolean admin) {
        if(!a.kind().equals("WORKFORCE"))throw ApiProblem.forbidden();businessReady(a);
        if(a.superAdmin()){if(jdbc.queryForObject("SELECT count(*) FROM vw_store WHERE id=?",Integer.class,storeId)==0)throw ApiProblem.missing();return;}
        int found=jdbc.queryForObject("SELECT count(*) FROM vw_membership WHERE store_id=? AND account_id=? AND state='ACTIVE'"+(admin?" AND role='STORE_ADMIN'":""),Integer.class,storeId,a.id());
        if(found==0)throw ApiProblem.forbidden();
    }
    public void lockAdministration(){jdbc.queryForObject("SELECT id FROM vw_administration_guard WHERE id=1 FOR UPDATE",Integer.class);}
    public void lockStore(UUID id){if(jdbc.query("SELECT id FROM vw_store WHERE id=? FOR UPDATE",(r,n)->r.getObject(1),id).isEmpty())throw ApiProblem.missing();}
    public void audit(UUID actor,UUID store,String type,UUID subject){jdbc.update("INSERT INTO vw_audit_event(id,actor_id,store_id,event_type,subject_id) VALUES(?,?,?,?,?)",UUID.randomUUID(),actor,store,type,subject);}
    public PasswordEncoder encoder(){return passwords;}
    public ApplicationEventPublisher events(){return events;}
}
