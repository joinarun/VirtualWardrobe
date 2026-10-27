package com.virtualwardrobe.tryon;

import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ProcessingRequestMigrationTest {
    @Test void migrationFromTenPreservesLegacyRowsAndLegacyWriterWhileEnforcingHonestNewBasis()throws Exception{
        String schema="action_migration_"+UUID.randomUUID().toString().replace("-","");String base=System.getenv().getOrDefault("SPRING_DATASOURCE_URL","jdbc:postgresql://localhost:5433/virtualwardrobe");String user=System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"),password=System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD","");
        String url=base+(base.contains("?")?"&":"?")+"currentSchema="+schema;UUID owner=UUID.randomUUID(),legacy=UUID.randomUUID();
        try{
            Flyway.configure().dataSource(url,user,password).schemas(schema).defaultSchema(schema).target("10").load().migrate();
            try(var c=DriverManager.getConnection(url,user,password);var s=c.createStatement()){
                s.execute("INSERT INTO vw_account(id,kind,name,normalized_identifier,password_hash) VALUES('"+owner+"','CUSTOMER','Migration fixture','+919876540099','not-a-login-hash')");
                legacyInsert(s,legacy,owner);
            }
            Flyway.configure().dataSource(url,user,password).schemas(schema).defaultSchema(schema).load().migrate();
            try(var c=DriverManager.getConnection(url,user,password);var s=c.createStatement()){
                try(var row=s.executeQuery("SELECT request_basis,adult,own_photo,provider_processing,version FROM vw_tryon_consent WHERE id='"+legacy+"'")){assertThat(row.next()).isTrue();assertThat(row.getString(1)).isEqualTo("LEGACY_ATTESTATION");for(int i=2;i<=4;i++)assertThat(row.getBoolean(i)).isTrue();assertThat(row.getString(5)).isEqualTo("legacy-unchanged");}
                // The f87 INSERT shape remains valid; default basis preserves its actual attestation.
                legacyInsert(s,UUID.randomUUID(),owner);
                String action="INSERT INTO vw_tryon_consent(id,owner_id,version,provider,model,location,notice,request_basis,adult,own_photo,provider_processing) VALUES('%s','"+owner+"','action-v2','mock','fixture-v1','local','Requested virtual preview','USER_ACTION',%s,%s,%s)";
                s.execute(action.formatted(UUID.randomUUID(),"NULL","NULL","NULL"));
                assertThatThrownBy(()->s.execute(action.formatted(UUID.randomUUID(),"TRUE","NULL","NULL"))).isInstanceOf(SQLException.class);
                assertThatThrownBy(()->s.execute("UPDATE vw_tryon_consent SET adult=NULL WHERE id='"+legacy+"'")).isInstanceOf(SQLException.class);
                assertThatThrownBy(()->s.execute("UPDATE vw_tryon_consent SET request_basis='UNKNOWN' WHERE id='"+legacy+"'")).isInstanceOf(SQLException.class);
            }
        }finally{try(var c=DriverManager.getConnection(base,user,password);var s=c.createStatement()){s.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");}}
    }
    private void legacyInsert(Statement s,UUID id,UUID owner)throws SQLException{s.execute("INSERT INTO vw_tryon_consent(id,owner_id,version,provider,model,location,notice,adult,own_photo,provider_processing) VALUES('"+id+"','"+owner+"','legacy-unchanged','mock','fixture-v1','local','Original notice',TRUE,TRUE,TRUE)");}
}
