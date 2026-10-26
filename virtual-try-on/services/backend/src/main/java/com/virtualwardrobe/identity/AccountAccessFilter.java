package com.virtualwardrobe.identity;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Set;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public final class AccountAccessFilter extends OncePerRequestFilter {
    private final IdentityService identity;
    private final String mode;
    private static final Set<String> ROTATION_ALLOWED=Set.of("/api/v1/auth/config","/api/v1/auth/session","/api/v1/auth/csrf","/api/v1/auth/password","/api/v1/auth/logout");
    public AccountAccessFilter(IdentityService identity,String mode){this.identity=identity;this.mode=mode;}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException {
        if(mode.equals("api")&&(request.getRequestURI().equals("/internal")||request.getRequestURI().startsWith("/internal/"))){response.setStatus(404);return;}
        if(mode.equals("worker")){chain.doFilter(request,response);return;}
        if(request.getRequestURI().startsWith("/api/"))response.setHeader("Cache-Control","no-store");
        var auth=SecurityContextHolder.getContext().getAuthentication();
        if(auth!=null&&auth.isAuthenticated()&&!auth.getName().equals("anonymousUser")){
            try {
                var account=identity.current();
                var session=request.getSession(false);Object captured=session==null?null:session.getAttribute(SessionSupport.CREDENTIAL_VERSION);
                if(!(captured instanceof Number version)||version.longValue()!=account.credentialVersion())throw new ApiProblem(401,"LOGIN_REQUIRED","Please sign in again");
                if(account.passwordChangeRequired()&&!ROTATION_ALLOWED.contains(request.getRequestURI())){write(response,403,"PASSWORD_CHANGE_REQUIRED");return;}
            }catch(ApiProblem p){SecurityContextHolder.clearContext();var session=request.getSession(false);if(session!=null)session.invalidate();
                if(!request.getRequestURI().equals("/api/v1/auth/session")){write(response,401,"LOGIN_REQUIRED");return;}}
        }
        chain.doFilter(request,response);
    }
    private void write(HttpServletResponse response,int status,String code)throws IOException {
        response.setStatus(status);response.setContentType("application/problem+json");
        response.getWriter().write("{\"status\":"+status+",\"code\":\""+code+"\",\"detail\":\"Please sign in or change your temporary password\"}");
    }
}
