package com.virtualwardrobe.identity;

import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="app.mode",havingValue="api",matchIfMissing=true)
@RequestMapping("/api/v1")
public class AuthController {
    private final IdentityService identity;private final SessionSupport sessions;private final CaptchaService captcha;private final RateLimits limits;
    public AuthController(IdentityService identity,SessionSupport sessions,CaptchaService captcha,RateLimits limits){this.identity=identity;this.sessions=sessions;this.captcha=captcha;this.limits=limits;}
    @GetMapping("/auth/csrf")public Map<String,Object> csrf(CsrfToken token){return Map.of("token",token.getToken(),"headerName",token.getHeaderName());}
    @GetMapping("/auth/config")public Map<String,Object> config(){return captcha.config();}
    @GetMapping("/auth/session")public Map<String,Object> session(){var response=new LinkedHashMap<String,Object>();try{response.put("user",identity.user(identity.current()));}catch(ApiProblem p){if(p.status!=401)throw p;response.put("user",null);}return response;}
    @PostMapping("/auth/login")public Map<String,Object> login(@RequestBody Map<String,Object> body,HttpServletRequest request,HttpServletResponse response){
        String kind=Inputs.text(body,"kind",20),identifier=Inputs.text(body,"identifier",254),password=Inputs.credential(body,"password");
        String normalized=identifier.toLowerCase(Locale.ROOT);
        try{normalized=kind.equals("WORKFORCE")?Inputs.email(identifier):Inputs.phone("+91",identifier);}catch(ApiProblem ignored){/* Generic login response remains unchanged. */}
        limits.check("login-ip:"+request.getRemoteAddr(),100);limits.check("login:"+kind+":"+normalized,12);
        var a=identity.login(kind,identifier,password);sessions.signIn(a,request,response);return Map.of("user",identity.user(a));
    }
    @PostMapping("/auth/signup")public Map<String,Object> signup(@RequestBody Map<String,Object> body,HttpServletRequest request,HttpServletResponse response){
        limits.check("signup:"+request.getRemoteAddr(),30);captcha.verify(Inputs.text(body,"captchaToken",10000));var result=identity.signup(body);
        @SuppressWarnings("unchecked") var user=(Map<String,Object>)result.get("user");sessions.signIn(identity.find((UUID)user.get("id")),request,response);return result;
    }
    @PostMapping("/auth/logout")public ResponseEntity<?> logout(HttpServletRequest request){sessions.logout(request);return ResponseEntity.noContent().build();}
    @PostMapping("/auth/password")public ResponseEntity<?> password(@RequestBody Map<String,Object> body,HttpServletRequest request,HttpServletResponse response){
        var a=identity.current();limits.check("password:"+a.id(),12);var changed=identity.changePassword(a,body);sessions.signIn(changed,request,response);return ResponseEntity.noContent().build();
    }
    @PostMapping("/auth/recover")public ResponseEntity<?> recover(@RequestBody Map<String,Object> body,HttpServletRequest request){
        limits.check("recover-ip:"+request.getRemoteAddr(),30);limits.check("recover:"+Inputs.phone("+91",Inputs.text(body,"phone",30)),8);identity.recover(body);sessions.logout(request);return ResponseEntity.noContent().build();
    }
    @DeleteMapping("/me")public ResponseEntity<?> delete(@RequestBody Map<String,Object> body,HttpServletRequest request){identity.deleteCustomer(identity.customer(),body);sessions.logout(request);return ResponseEntity.accepted().build();}
}
