package com.virtualwardrobe.identity;

import jakarta.servlet.http.*;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Component;

@Component
public class SessionSupport {
    public static final String CREDENTIAL_VERSION="VW_CREDENTIAL_VERSION";
    private final HttpSessionSecurityContextRepository repository=new HttpSessionSecurityContextRepository();
    public void signIn(IdentityService.Account account,HttpServletRequest request,HttpServletResponse response) {
        HttpSession old=request.getSession(false);if(old!=null)old.invalidate();request.getSession(true).setAttribute(CREDENTIAL_VERSION,account.credentialVersion());
        var context=SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(account.id().toString(),null,List.of(new SimpleGrantedAuthority("ROLE_"+account.kind()))));
        SecurityContextHolder.setContext(context);repository.saveContext(context,request,response);
    }
    public void logout(HttpServletRequest request){HttpSession session=request.getSession(false);if(session!=null)session.invalidate();SecurityContextHolder.clearContext();}
}
