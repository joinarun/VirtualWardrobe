package com.virtualwardrobe.identity;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="app.mode",havingValue="api",matchIfMissing=true)
@RequestMapping("/api/v1")
public class StoresController {
    private final StoreService stores;private final IdentityService identity;private final SessionSupport sessions;
    public StoresController(StoreService stores,IdentityService identity,SessionSupport sessions){this.stores=stores;this.identity=identity;this.sessions=sessions;}
    @GetMapping("/stores")public Object list(@RequestParam(defaultValue="false")boolean managed){return stores.stores(managed);}
    @GetMapping("/stores/{id}")public Object detail(@PathVariable String id){return stores.detail(Inputs.id(id));}
    @PostMapping("/admin/stores")public Object create(@RequestBody Map<String,Object> body){return stores.create(body);}
    @PatchMapping("/stores/{id}")public Object patch(@PathVariable String id,@RequestBody Map<String,Object> body){return stores.patch(Inputs.id(id),body);}
    @GetMapping("/stores/{id}/members")public Object members(@PathVariable String id){return stores.members(Inputs.id(id));}
    @GetMapping("/stores/{id}/assignees")public Object assignees(@PathVariable String id){return stores.assignees(Inputs.id(id));}
    @PostMapping("/stores/{id}/members")public Object provision(@PathVariable String id,@RequestBody Map<String,Object> body){return stores.provision(Inputs.id(id),body);}
    @PatchMapping("/stores/{id}/members/{memberId}")public Object membership(@PathVariable String id,@PathVariable String memberId,@RequestBody Map<String,Object> body){return stores.changeMember(Inputs.id(id),Inputs.id(memberId),body,false);}
    @DeleteMapping("/stores/{id}/members/{memberId}")public ResponseEntity<?> remove(@PathVariable String id,@PathVariable String memberId){stores.changeMember(Inputs.id(id),Inputs.id(memberId),Map.of(),true);return ResponseEntity.noContent().build();}
    @PostMapping("/me/invitations/{memberId}/accept")public ResponseEntity<?> accept(@PathVariable String memberId){stores.accept(Inputs.id(memberId));return ResponseEntity.noContent().build();}
    @GetMapping("/admin/workforce")public Object workforce(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="24")int size){return stores.workforceList(page,size);}
    @PostMapping("/admin/workforce")public Object createWorkforce(@RequestBody Map<String,Object> body){return stores.createWorkforce(body);}
    @PatchMapping("/admin/workforce/{id}")public Object updateWorkforce(@PathVariable String id,@RequestBody Map<String,Object> body,HttpServletRequest request){
        var self=identity.current().id();var result=stores.patchWorkforce(Inputs.id(id),body);if(Boolean.FALSE.equals(result.get("enabled"))&&self.equals(Inputs.id(id)))sessions.logout(request);return result;
    }
    @PostMapping("/admin/workforce/{id}/reset-password")public Object reset(@PathVariable String id,HttpServletRequest request){var self=identity.current().id();var result=stores.resetWorkforce(Inputs.id(id));if(self.equals(Inputs.id(id)))sessions.logout(request);return result;}
}
