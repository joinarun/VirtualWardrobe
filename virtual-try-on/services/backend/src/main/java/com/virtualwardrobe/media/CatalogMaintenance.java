package com.virtualwardrobe.media;

import com.virtualwardrobe.foundation.SafeFailures;
import com.virtualwardrobe.identity.ApiProblem;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Bounded per-row metadata transactions; generic deletion draining performs storage I/O afterwards. */
@Component
public class CatalogMaintenance {
    private final CatalogCleanupTransactions cleanup;
    public CatalogMaintenance(CatalogCleanupTransactions cleanup){this.cleanup=cleanup;}
    public Map<String,Integer> run(){
        int reconciled=0,failed=0;for(UUID id:cleanup.candidates())try{if(cleanup.reconcile(id))reconciled++;}
        catch(ApiProblem conflict){failed++;if(!conflict.code.equals("CATALOG_CLEANUP_CONFLICT"))SafeFailures.record(SafeFailures.Code.CATALOG_CLEANUP_UNAVAILABLE);}
        catch(RuntimeException unavailable){failed++;SafeFailures.record(SafeFailures.Code.CATALOG_CLEANUP_UNAVAILABLE);}
        return Map.of("reconciled",reconciled,"failed",failed);
    }
}
