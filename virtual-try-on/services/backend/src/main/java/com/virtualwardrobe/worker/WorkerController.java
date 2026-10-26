package com.virtualwardrobe.worker;

import com.virtualwardrobe.identity.*;
import com.virtualwardrobe.tryon.TryOnService;
import com.virtualwardrobe.enquiries.EnquiryMaintenance;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="app.mode",havingValue="worker")
public class WorkerController {
    private final TryOnWorker worker;private final TryOnService service;private final EnquiryMaintenance enquiries;
    public WorkerController(TryOnWorker worker,TryOnService service,EnquiryMaintenance enquiries){this.worker=worker;this.service=service;this.enquiries=enquiries;}
    @PostMapping("/internal/jobs/{id}/run")public ResponseEntity<?> run(@PathVariable String id,@RequestHeader(name="X-VirtualWardrobe-Dispatch-Sequence")int sequence,@RequestBody Map<String,Object> body){if(sequence<1||sequence>2||!id.equals(body.get("jobId")))throw ApiProblem.bad("Invalid delivery identity");return worker.run(Inputs.id(id),sequence)?ResponseEntity.noContent().build():ResponseEntity.status(503).build();}
    @PostMapping("/internal/maintenance")public Object maintenance(){var result=new java.util.LinkedHashMap<String,Object>(service.maintenance());result.put("enquiryContactsRedacted",enquiries.run());return result;}
}
