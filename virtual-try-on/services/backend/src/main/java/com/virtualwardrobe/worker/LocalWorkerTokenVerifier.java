package com.virtualwardrobe.worker;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.adapter-mode",havingValue="local",matchIfMissing=true)
public class LocalWorkerTokenVerifier implements WorkerTokenVerifier {
    private final String token;private final String environment;
    public LocalWorkerTokenVerifier(@Value("${APP_WORKER_LOCAL_TOKEN:}")String token,@Value("${app.environment:local}")String environment){this.token=token;this.environment=environment;}
    public boolean verify(String value){return environment.equals("local")&&!token.isBlank()&&value!=null&&MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),value.getBytes(StandardCharsets.UTF_8));}
}
