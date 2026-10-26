package com.virtualwardrobe.demo;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import com.google.gson.Gson;
import com.virtualwardrobe.media.*;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Path;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/** Deliberately standalone: no Spring context, listener, bootstrap, scheduler or provider. */
public final class DemoMain {
    public static void main(String[] args){
        ((LoggerContext)LoggerFactory.getILoggerFactory()).getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).setLevel(Level.OFF);
        java.util.logging.LogManager.getLogManager().reset();
        try{System.out.println("DEMO_RESULT_JSON="+new com.google.gson.GsonBuilder().serializeNulls().create().toJson(run(args,System.getenv())));}
        catch(Throwable error){String code=error instanceof DemoFailure failure?failure.code:"DEMO_OPERATION_FAILED";if(error instanceof java.io.IOException&&error.getMessage()!=null&&error.getMessage().matches("DEMO_CREDENTIALS_[A-Z_]+"))code=error.getMessage();System.err.println("DEMO_ERROR="+code);System.exit(2);}
    }
    static DemoDataService.Result run(String[] args,Map<String,String> env)throws Exception{
        String environment=env.getOrDefault("APP_ENVIRONMENT","local");DemoDataService.guardEnvironment(environment);
        if(args.length==0||!Set.of("seed","status","cleanup").contains(args[0]))throw new DemoFailure("DEMO_COMMAND_INVALID");String command=args[0];var options=new HashMap<String,String>();
        for(int i=1;i<args.length;i++){String key=args[i];if(!Set.of("--dataset","--assets","--credentials","--profile","--catalog-size","--project","--dry-run","--execute").contains(key)||options.containsKey(key))throw new DemoFailure("DEMO_OPTIONS_INVALID");if(Set.of("--dry-run","--execute").contains(key))options.put(key,"true");else{if(++i>=args.length||args[i].startsWith("--"))throw new DemoFailure("DEMO_OPTIONS_INVALID");options.put(key,args[i]);}}
        String dataset=options.get("--dataset");if(dataset==null||!dataset.matches("[a-z][a-z0-9-]{2,49}"))throw new DemoFailure("DEMO_DATASET_INVALID");
        if(options.containsKey("--execute")&&options.containsKey("--dry-run"))throw new DemoFailure("DEMO_OPTIONS_INVALID");
        String adapter=env.getOrDefault("APP_ADAPTER_MODE","local"),url=env.get("SPRING_DATASOURCE_URL");if(url==null||!url.startsWith("jdbc:postgresql:"))throw new DemoFailure("DEMO_DATABASE_INVALID");
        if(adapter.equals("gcp")){String project=env.get("APP_GCP_PROJECT");if(project==null||!project.equals(options.get("--project"))||!url.contains("cloudSqlInstance="+project+":"))throw new DemoFailure("DEMO_PROJECT_MISMATCH");}else if(!adapter.equals("local"))throw new DemoFailure("DEMO_ADAPTER_INVALID");
        Path credentials=null,assets=null;String profile=options.getOrDefault("--profile","standard");int count=options.containsKey("--catalog-size")?Integer.parseInt(options.get("--catalog-size")):(profile.equals("load")?1000:30);
        if(command.equals("seed")){if(!options.containsKey("--credentials")||!options.containsKey("--assets"))throw new DemoFailure("DEMO_OPTIONS_INVALID");credentials=Path.of(options.get("--credentials"));assets=Path.of(options.get("--assets"));if(!credentials.isAbsolute()||!assets.isAbsolute()||!credentials.getFileName().toString().matches("demo-credentials[^/]*\\.json"))throw new DemoFailure("DEMO_CREDENTIAL_PATH_INVALID");if(!Set.of("standard","load").contains(profile)||count<1||count>2000||(profile.equals("standard")&&count!=30))throw new DemoFailure("DEMO_PROFILE_INVALID");}
        HikariConfig config=new HikariConfig();config.setJdbcUrl(url+(url.contains("?")?"&":"?")+"reWriteBatchedInserts=true");config.setUsername(env.getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"));config.setPassword(env.get("SPRING_DATASOURCE_PASSWORD"));config.setMaximumPoolSize(3);config.setMinimumIdle(0);config.setConnectionTimeout(30000);
        try(var source=new HikariDataSource(config)){
            if(command.equals("seed"))Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
            // Status is read-only; it does not even construct an object adapter or inspect credential files.
            MediaStorage storage=command.equals("status")||(command.equals("cleanup")&&!options.containsKey("--execute"))?null:adapter.equals("gcp")?new GcpMediaStorage(env.get("APP_STORAGE_BUCKET"),env.get("APP_STORAGE_SIGNER_SERVICE_ACCOUNT"),env.get("APP_GCP_PROJECT")):new LocalMediaStorage(env.getOrDefault("APP_LOCAL_DATA_DIRECTORY","work/local-data"));
            var service=new DemoDataService(new JdbcTemplate(source),new DataSourceTransactionManager(source),storage,environment);
            return switch(command){case "seed"->service.seed(dataset,profile,count,assets,credentials);case "status"->service.status(dataset);default->service.cleanup(dataset,!options.containsKey("--execute"));};
        }
    }
}
