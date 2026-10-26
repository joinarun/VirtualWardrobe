package com.virtualwardrobe.foundation;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class FoundationSecurity {
    @Bean UserDetailsService noDefaultUser() { return new InMemoryUserDetailsManager(); }
    @Bean SecurityFilterChain foundationFilterChain(HttpSecurity http, FoundationProperties properties) throws Exception {
        http.authorizeHttpRequests(auth -> {
            auth.requestMatchers("/actuator/health", "/actuator/health/**").permitAll();
            if ("api".equals(properties.mode())) auth.requestMatchers("/api/v1/health", "/api/v1/foundation/providers").permitAll();
            auth.anyRequest().denyAll();
        });
        http.exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, failure) -> response.sendError(403)));
        http.headers(headers -> headers.cacheControl(cache -> {}));
        return http.build();
    }
}
