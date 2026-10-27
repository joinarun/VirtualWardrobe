package com.virtualwardrobe.foundation;

import com.virtualwardrobe.identity.SessionPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.session.web.http.CookieSerializer;
import static org.assertj.core.api.Assertions.*;

class SessionPolicyTest {
    @Test void securePersistentCookieRetainsPrivacyAttributesAndLogoutDeletion(){
        var serializer=new FoundationSecurity().cookieSerializer(true,new SessionPolicy(2592000,28800,1800));var request=new MockHttpServletRequest();request.setSecure(true);var response=new MockHttpServletResponse();
        serializer.writeCookieValue(new CookieSerializer.CookieValue(request,response,"test-cookie-value"));assertThat(response.getHeader("Set-Cookie")).contains("__session=","Max-Age=2592000","Path=/","Secure","HttpOnly","SameSite=Lax");
        var logout=new MockHttpServletResponse();serializer.writeCookieValue(new CookieSerializer.CookieValue(request,logout,""));assertThat(logout.getHeader("Set-Cookie")).contains("Max-Age=0","Secure","HttpOnly","SameSite=Lax");
    }
    @Test void policyRejectsUnboundedDurationsAndCookieUsesAuthenticatedUpperBound(){
        assertThat(new SessionPolicy(3600,7200,1800).cookieSeconds()).isEqualTo(7200);assertThat(new SessionPolicy(2592000,28800,1800).anonymousSeconds()).isEqualTo(1800);
        for(int invalid:new int[]{-1,0,59,2592001,Integer.MAX_VALUE}){assertThatThrownBy(()->new SessionPolicy(invalid,28800,1800)).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->new SessionPolicy(2592000,invalid,1800)).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->new SessionPolicy(2592000,28800,invalid)).isInstanceOf(IllegalArgumentException.class);}
    }
}
