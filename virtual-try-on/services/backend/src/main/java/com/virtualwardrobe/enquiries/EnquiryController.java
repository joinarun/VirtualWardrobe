package com.virtualwardrobe.enquiries;

import com.virtualwardrobe.identity.*;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="app.mode",havingValue="api",matchIfMissing=true)
@RequestMapping("/api/v1")
public class EnquiryController {
    private final EnquiryService service;private final RateLimits rates;
    public EnquiryController(EnquiryService service,RateLimits rates){this.service=service;this.rates=rates;}
    @GetMapping("/enquiries/config")public Object config(){return service.config();}
    @PostMapping("/me/enquiries")public Object submit(@RequestBody Map<String,Object> body){rates.check("enquiry-submit:"+service.customer().id(),20);return service.submit(body);}
    @GetMapping("/me/enquiries")public Object customerList(@RequestParam(defaultValue="")String status,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return service.customerList(status,page,size);}
    @GetMapping("/me/enquiries/{id}")public Object customerDetail(@PathVariable String id){return service.customerDetail(Inputs.id(id));}
    @PostMapping("/me/enquiries/{id}/messages")public Object customerMessage(@PathVariable String id,@RequestBody Map<String,Object> body){return service.customerMessage(Inputs.id(id),body);}
    @GetMapping("/stores/{store}/enquiries/counts")public Object counts(@PathVariable String store){return service.counts(Inputs.id(store));}
    @GetMapping("/stores/{store}/enquiries")public Object list(@PathVariable String store,@RequestParam(defaultValue="")String status,@RequestParam(defaultValue="")String assigneeId,@RequestParam(defaultValue="")String q,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return service.staffList(Inputs.id(store),status,assigneeId,q,page,size,false);}
    @PostMapping("/stores/{store}/enquiries/search")public Object search(@PathVariable String store,@RequestBody Map<String,Object> body){return service.staffList(Inputs.id(store),Inputs.optional(body,"status",40),Inputs.optional(body,"assigneeId",40),Inputs.optional(body,"q",200),integer(body,"page",0),integer(body,"size",20),true);}
    private int integer(Map<String,Object> body,String key,int fallback){try{return body.get(key)==null?fallback:new java.math.BigDecimal(body.get(key).toString()).intValueExact();}catch(Exception e){throw ApiProblem.bad("Invalid pagination");}}
    @GetMapping("/stores/{store}/enquiries/{id}")public Object detail(@PathVariable String store,@PathVariable String id){return service.staffDetail(Inputs.id(store),Inputs.id(id));}
    @PostMapping("/stores/{store}/enquiries/{id}/claim")public Object claim(@PathVariable String store,@PathVariable String id){return service.claim(Inputs.id(store),Inputs.id(id));}
    @PatchMapping("/stores/{store}/enquiries/{id}/assignment")public Object assign(@PathVariable String store,@PathVariable String id,@RequestBody Map<String,Object> body){return service.assign(Inputs.id(store),Inputs.id(id),body);}
    @PostMapping("/stores/{store}/enquiries/{id}/status")public Object status(@PathVariable String store,@PathVariable String id,@RequestBody Map<String,Object> body){return service.status(Inputs.id(store),Inputs.id(id),body);}
    @PostMapping("/stores/{store}/enquiries/{id}/reopen")public Object reopen(@PathVariable String store,@PathVariable String id,@RequestBody Map<String,Object> body){return service.reopen(Inputs.id(store),Inputs.id(id),body);}
    @PostMapping("/stores/{store}/enquiries/{id}/messages")public Object message(@PathVariable String store,@PathVariable String id,@RequestBody Map<String,Object> body){return service.staffMessage(Inputs.id(store),Inputs.id(id),body,false);}
    @PostMapping("/stores/{store}/enquiries/{id}/notes")public Object note(@PathVariable String store,@PathVariable String id,@RequestBody Map<String,Object> body){return service.staffMessage(Inputs.id(store),Inputs.id(id),body,true);}
}
