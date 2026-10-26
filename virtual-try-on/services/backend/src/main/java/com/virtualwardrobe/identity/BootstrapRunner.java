package com.virtualwardrobe.identity;

import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Map;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class BootstrapRunner implements ApplicationRunner {
    private final StoreService stores;private final String email,password,command,environment;private final ConfigurableApplicationContext context;
    public BootstrapRunner(StoreService stores,@Value("${app.bootstrap.email:}")String email,@Value("${app.bootstrap.password:}")String password,
            @Value("${app.command:}")String command,@Value("${app.environment:local}")String environment,ConfigurableApplicationContext context){
        this.stores=stores;this.email=email;this.password=password;this.command=command;this.environment=environment;this.context=context;
    }
    @Override public void run(ApplicationArguments args)throws Exception {
        boolean cli=command.equals("bootstrap");
        if(!cli&&(email.isBlank()||password.isBlank()))return;
        if(environment.equals("production")&&email.isBlank())throw new IllegalStateException("Production bootstrap requires an explicit controlled email");
        Map<String,Object> result=stores.bootstrap(email.isBlank()?"superadmin_1@gmail.com":email,password);
        if(cli){
            if(Boolean.TRUE.equals(result.get("created"))){
                Path path=Path.of("work/bootstrap-credentials.txt");Files.createDirectories(path.getParent());
                if(!Files.exists(path))Files.createFile(path,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
                Files.setPosixFilePermissions(path,PosixFilePermissions.fromString("rw-------"));
                Files.writeString(path,"VirtualWardrobe local bootstrap\nEmail: "+result.get("email")+"\nTemporary password: "+result.get("temporaryPassword")+"\nChange this password on first login.\n");
                System.out.println("Bootstrap created. Read the owner-only ignored work/bootstrap-credentials.txt file.");
            }else System.out.println("Bootstrap unchanged: a super admin already exists.");
            context.close();
        }
    }
}
