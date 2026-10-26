package com.virtualwardrobe.foundation;

import com.virtualwardrobe.identity.*;
import com.virtualwardrobe.worker.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.csrf.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.beans.factory.annotation.Value;

@Configuration
public class FoundationSecurity {
    @Bean UserDetailsService noDefaultUser() { return new InMemoryUserDetailsManager(); }
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
    @Bean CookieSerializer cookieSerializer(@Value("${server.servlet.session.cookie.secure:false}")boolean secure) {
        var cookie=new DefaultCookieSerializer();cookie.setCookieName("__session");cookie.setCookiePath("/");
        cookie.setUseHttpOnlyCookie(true);cookie.setSameSite("Lax");cookie.setUseSecureCookie(secure);return cookie;
    }
    @Bean SecurityFilterChain foundationFilterChain(HttpSecurity http, FoundationProperties properties,IdentityService identity,WorkerTokenVerifier workerTokens) throws Exception {
        var csrfRepository=new HttpSessionCsrfTokenRepository();csrfRepository.setHeaderName("X-CSRF-TOKEN");
        if(properties.mode().equals("worker")){http.csrf(csrf->csrf.disable());http.sessionManagement(s->s.sessionCreationPolicy(org.springframework.security.config.http.SessionCreationPolicy.STATELESS));}
        else http.csrf(csrf->csrf.csrfTokenRepository(csrfRepository).csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()).ignoringRequestMatchers("/api/v1/uploads/*/content","/api/v1/private-uploads/*/content"));
        http.authorizeHttpRequests(auth -> {
            auth.requestMatchers("/actuator/health", "/actuator/health/**").permitAll();
            if ("api".equals(properties.mode())) auth.requestMatchers("/api/v1/**").permitAll();
            else auth.requestMatchers("/internal/**").hasRole("WORKER");
            auth.anyRequest().denyAll();
        });
        http.addFilterBefore(new AccountAccessFilter(identity,properties.mode()),CsrfFilter.class);
        http.addFilterBefore(new WorkerAccessFilter(workerTokens,properties.mode()),AccountAccessFilter.class);
        http.exceptionHandling(errors -> errors.authenticationEntryPoint((request,response,failure)->{
            response.setStatus(401);response.setContentType("application/problem+json");response.getWriter().write("{\"status\":401,\"code\":\"LOGIN_REQUIRED\",\"detail\":\"Please sign in\"}");
        }).accessDeniedHandler((request,response,failure)->{
            String code=failure instanceof CsrfException?"CSRF_INVALID":"ACCESS_DENIED";
            response.setStatus(403);response.setContentType("application/problem+json");response.setHeader("Cache-Control","no-store");response.getWriter().write("{\"status\":403,\"code\":\""+code+"\",\"detail\":\"Access or request verification failed\"}");
        }));
        http.headers(headers -> headers.cacheControl(cache -> {}));
        return http.build();
    }
}
