package com.virtualwardrobe.worker;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class WorkerAccessFilter extends OncePerRequestFilter {
    private final WorkerTokenVerifier verifier;private final String mode;
    public WorkerAccessFilter(WorkerTokenVerifier verifier,String mode){this.verifier=verifier;this.mode=mode;}
    protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
        if(!mode.equals("worker")||!request.getRequestURI().startsWith("/internal/")){chain.doFilter(request,response);return;}
        String header=request.getHeader("Authorization");String token=header!=null&&header.startsWith("Bearer ")?header.substring(7):null;
        if(!verifier.verify(token)){response.setStatus(401);response.setContentType("application/problem+json");response.setHeader("Cache-Control","no-store");response.getWriter().write("{\"status\":401,\"code\":\"WORKER_AUTH_REQUIRED\",\"detail\":\"Authenticated machine delivery is required\"}");return;}
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated("worker",null,List.of(new SimpleGrantedAuthority("ROLE_WORKER"))));
        try{chain.doFilter(request,response);}finally{SecurityContextHolder.clearContext();}
    }
}
