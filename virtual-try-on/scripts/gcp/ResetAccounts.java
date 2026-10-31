// Explicitly authorized demo reset; no server, provider or arbitrary target.
import java.sql.*;
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class ResetAccounts {
 static void exec(Connection c,String sql)throws Exception{try(var s=c.createStatement()){s.executeUpdate(sql);}}
 static int count(Connection c,String sql)throws Exception{try(var s=c.createStatement();var r=s.executeQuery(sql)){r.next();return r.getInt(1);}}
 public static void main(String[] args)throws Exception{
  if(!"virtualtryon-511016".equals(System.getenv("APP_GCP_PROJECT"))||!"demo".equals(System.getenv("APP_ENVIRONMENT")))throw new IllegalStateException("Target refused");
  var path=Path.of(System.getenv("VW_RESET_CREDENTIALS"));var data=JsonParser.parseString(Files.readString(path)).getAsJsonObject();
  var users=data.getAsJsonArray("users");if(users.size()!=4)throw new IllegalStateException("Four accounts required");
  var encoder=new BCryptPasswordEncoder(12);
  try(var c=DriverManager.getConnection(System.getenv("SPRING_DATASOURCE_URL"),System.getenv("SPRING_DATASOURCE_USERNAME"),System.getenv("SPRING_DATASOURCE_PASSWORD"))){
   c.setAutoCommit(false);
   try{
    exec(c,"SET LOCAL lock_timeout='10s'");exec(c,"SET LOCAL statement_timeout='30s'");
    exec(c,"UPDATE vw_administration_guard SET id=id WHERE id=1");
    exec(c,"LOCK TABLE vw_account,vw_membership,vw_tryon_job,vw_private_media,vw_enquiry,vw_enquiry_event,spring_session IN SHARE ROW EXCLUSIVE MODE");
    if(count(c,"SELECT count(*) FROM vw_tryon_job WHERE state IN('QUEUED','RUNNING')")!=0||count(c,"SELECT count(*) FROM vw_generation_day WHERE reserved_usd<>0")!=0)throw new IllegalStateException("Active work refused");
    int old=count(c,"SELECT count(*) FROM vw_account WHERE enabled");if(old>500)throw new IllegalStateException("Unexpected account count");
    if(count(c,"SELECT count(*) FROM vw_account WHERE normalized_identifier IN('super@wardrobe.test','admin@wardrobe.test','staff@wardrobe.test','+919000000001')")!=0)throw new IllegalStateException("Replacement accounts already exist");
    int products=count(c,"SELECT count(*) FROM vw_product");
    exec(c,"DELETE FROM spring_session");exec(c,"DELETE FROM vw_recovery_code");
    exec(c,"UPDATE vw_membership SET state='REMOVED' WHERE state<>'REMOVED'");
    exec(c,"UPDATE vw_enquiry_event SET redacted=redacted OR body IS NOT NULL,body=NULL");
    exec(c,"INSERT INTO vw_enquiry_event(enquiry_id,event_type,visibility) SELECT id,'CONTACT_REDACTED','PUBLIC' FROM vw_enquiry WHERE contact_state='AVAILABLE'");
    exec(c,"UPDATE vw_enquiry SET contact_name='Deleted customer',contact_phone=NULL,contact_state='REMOVED_ACCOUNT',contact_redacted_at=CURRENT_TIMESTAMP,assignee_id=NULL,status='CLOSED',outcome=COALESCE(outcome,'NOT_INTERESTED'),closed_at=COALESCE(closed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP");
    exec(c,"INSERT INTO vw_object_deletion(object_key,final_check_at) SELECT DISTINCT k,CURRENT_TIMESTAMP+INTERVAL '10 minutes' FROM vw_private_media CROSS JOIN LATERAL (VALUES(raw_key),(object_key),(pending_key)) keys(k) WHERE k IS NOT NULL ON CONFLICT(object_key) DO UPDATE SET next_attempt_at=CURRENT_TIMESTAMP,final_check_at=GREATEST(vw_object_deletion.final_check_at,EXCLUDED.final_check_at)");
    exec(c,"UPDATE vw_private_media SET state='DELETED',deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP),token_hash=NULL");
    exec(c,"UPDATE vw_tryon_job SET deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP),discarded_at=COALESCE(discarded_at,CURRENT_TIMESTAMP)");
    try(var p=c.prepareStatement("UPDATE vw_account SET enabled=FALSE,super_admin=FALSE,name='Deleted account',normalized_identifier='deleted:'||id::text,password_hash=?,credential_version=credential_version+1,deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP),password_change_required=FALSE,temp_password_expires_at=NULL")){p.setString(1,encoder.encode(UUID.randomUUID().toString()));p.executeUpdate();}
    exec(c,"UPDATE vw_demo_dataset SET credentials_json='{}',credentials_text='Retired by owner-authorized account reset',updated_at=CURRENT_TIMESTAMP");
    UUID superId=UUID.fromString(users.get(0).getAsJsonObject().get("id").getAsString());
    for(var item:users){var u=item.getAsJsonObject();var id=UUID.fromString(u.get("id").getAsString());String role=u.get("role").getAsString();
     try(var p=c.prepareStatement("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash,super_admin) VALUES(?,?,?,?,?,?)")){p.setObject(1,id);p.setString(2,u.get("kind").getAsString());p.setString(3,u.get("name").getAsString());p.setString(4,u.get("identifier").getAsString());p.setString(5,encoder.encode(u.get("password").getAsString()));p.setBoolean(6,role.equals("SUPER_ADMIN"));p.executeUpdate();}
     if(role.equals("STORE_ADMIN")||role.equals("STAFF"))try(var p=c.prepareStatement("INSERT INTO vw_membership(id,store_id,account_id,role,state,invited_by,accepted_at) SELECT gen_random_uuid(),id,?,?,'ACTIVE',?,CURRENT_TIMESTAMP FROM vw_store WHERE status<>'ARCHIVED'")){p.setObject(1,id);p.setString(2,role);p.setObject(3,superId);p.executeUpdate();}
    }
    try(var p=c.prepareStatement("INSERT INTO vw_audit_event(id,actor_id,event_type,subject_id) VALUES(?,?,'OWNER_AUTHORIZED_ACCOUNT_RESET',?)")){p.setObject(1,UUID.randomUUID());p.setObject(2,superId);p.setObject(3,superId);p.executeUpdate();}
    if(count(c,"SELECT count(*) FROM vw_account WHERE enabled")!=4||count(c,"SELECT count(*) FROM vw_account WHERE enabled AND super_admin")!=1||count(c,"SELECT count(*) FROM vw_store s WHERE s.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM vw_membership m WHERE m.store_id=s.id AND m.role='STORE_ADMIN' AND m.state='ACTIVE')")!=0||count(c,"SELECT count(*) FROM vw_product")!=products)throw new IllegalStateException("Postconditions failed");
    if ("true".equals(System.getenv("VW_RESET_ROLLBACK"))) c.rollback(); else c.commit();System.out.println("RESET_OK old_accounts="+old+" active_accounts=4 products="+products);
   }catch(Exception e){c.rollback();throw new IllegalStateException("Reset rolled back; raw diagnostics withheld");}
  }
 }
}
