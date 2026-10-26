package com.virtualwardrobe.enquiries;

import java.util.UUID;
import org.springframework.stereotype.Component;

/** Each candidate rechecks eligibility in its own transaction; no cross-owner/store lock batch. */
@Component
public class EnquiryMaintenance {
    private final EnquiryService enquiries;
    public EnquiryMaintenance(EnquiryService enquiries){this.enquiries=enquiries;}
    public int run(){int redacted=0;for(UUID id:enquiries.retentionCandidates())if(enquiries.expireContact(id))redacted++;return redacted;}
}
