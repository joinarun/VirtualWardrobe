package com.virtualwardrobe.identity;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.gson.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

@Service
public class CaptchaService {
    private final String environment,mode,siteKey,project,action,hostnames;
    private final double minimumScore;
    public CaptchaService(@Value("${app.environment:local}")String environment,@Value("${app.captcha.mode:local}")String mode,
            @Value("${app.captcha.site-key:}")String siteKey,@Value("${APP_GCP_PROJECT:${GOOGLE_CLOUD_PROJECT:}}")String project,
            @Value("${app.captcha.expected-action:signup}")String action,@Value("${app.captcha.allowed-hostnames:}")String hostnames,
            @Value("${app.captcha.min-score:0.5}")double minimumScore) {
        this.environment=environment;this.mode=mode;this.siteKey=siteKey;this.project=project;this.action=action;this.hostnames=hostnames;this.minimumScore=minimumScore;
    }
    private boolean local() { return environment.equals("local")&&mode.equals("local"); }
    private boolean googleReady() { return mode.equals("google")&&!siteKey.isBlank()&&!project.isBlank()&&!hostnames.isBlank(); }
    public Map<String,Object> config() {
        var captcha=new LinkedHashMap<String,Object>();captcha.put("mode",local()?"LOCAL_TEST":googleReady()?"RECAPTCHA_ENTERPRISE":"DISABLED");
        captcha.put("action",action);if(googleReady())captcha.put("siteKey",siteKey);
        return Map.of("signupEnabled",local()||googleReady(),"captcha",captcha,"passwordMinLength",12);
    }
    public void verify(String token) {
        if(local()) {if(!"local-development".equals(token))throw ApiProblem.bad("Complete the signup verification");return;}
        if(!googleReady())throw new ApiProblem(503,"SIGNUP_UNAVAILABLE","Signup is temporarily unavailable");
        if(token.isBlank()||token.length()>10000)throw ApiProblem.bad("Complete the signup verification");
        try {
            var credentials=GoogleCredentials.getApplicationDefault().createScoped(List.of("https://www.googleapis.com/auth/cloud-platform"));credentials.refreshIfExpired();
            var event=new JsonObject();event.addProperty("token",token);event.addProperty("siteKey",siteKey);event.addProperty("expectedAction",action);
            var body=new JsonObject();body.add("event",event);
            var request=HttpRequest.newBuilder(URI.create("https://recaptchaenterprise.googleapis.com/v1/projects/"+project+"/assessments"))
                .timeout(Duration.ofSeconds(10)).header("Authorization","Bearer "+credentials.getAccessToken().getTokenValue())
                .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body.toString())).build();
            var result=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build().send(request,HttpResponse.BodyHandlers.ofString());
            if(result.statusCode()!=200)throw new IllegalStateException();
            var root=JsonParser.parseString(result.body()).getAsJsonObject();var props=root.getAsJsonObject("tokenProperties");
            if(props==null||!props.get("valid").getAsBoolean()||!action.equals(props.get("action").getAsString())
                ||Arrays.stream(hostnames.split(",")).map(String::trim).noneMatch(h->h.equals(props.get("hostname").getAsString()))
                ||root.getAsJsonObject("riskAnalysis").get("score").getAsDouble()<minimumScore)throw ApiProblem.bad("Signup verification was not accepted");
        }catch(ApiProblem e){throw e;}catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiProblem(503,"SIGNUP_UNAVAILABLE","Signup verification is temporarily unavailable");}
        catch(Exception e){throw new ApiProblem(503,"SIGNUP_UNAVAILABLE","Signup verification is temporarily unavailable");}
    }
}
