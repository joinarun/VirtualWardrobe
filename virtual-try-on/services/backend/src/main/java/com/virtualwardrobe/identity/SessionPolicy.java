package com.virtualwardrobe.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Browser persistence is bounded independently from the authoritative role-specific JDBC idle limit. */
@Component
public class SessionPolicy {
    private final int customerSeconds,workforceSeconds,anonymousSeconds;
    public SessionPolicy(@Value("${app.session.customer-seconds:2592000}")int customerSeconds,
            @Value("${app.session.workforce-seconds:28800}")int workforceSeconds,
            @Value("${app.session.anonymous-seconds:1800}")int anonymousSeconds){
        for(int seconds:new int[]{customerSeconds,workforceSeconds,anonymousSeconds})if(seconds<60||seconds>2592000)throw new IllegalArgumentException("Session durations must be between 60 seconds and 30 days");
        this.customerSeconds=customerSeconds;this.workforceSeconds=workforceSeconds;this.anonymousSeconds=anonymousSeconds;
    }
    public int authenticatedSeconds(IdentityService.Account account){return account.kind().equals("CUSTOMER")?customerSeconds:workforceSeconds;}
    public int cookieSeconds(){return Math.max(customerSeconds,workforceSeconds);}
    public int anonymousSeconds(){return anonymousSeconds;}
}
