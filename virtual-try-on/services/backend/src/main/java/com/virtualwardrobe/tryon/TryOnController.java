package com.virtualwardrobe.tryon;

import com.virtualwardrobe.identity.Inputs;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="app.mode",havingValue="api",matchIfMissing=true)
@RequestMapping("/api/v1")
public class TryOnController {
    private final TryOnService service;private final TryOnTransactions tx;private final TryOnSettings settings;
    public TryOnController(TryOnService service,TryOnTransactions tx,TryOnSettings settings){this.service=service;this.tx=tx;this.settings=settings;}
    @GetMapping("/try-on/config")public Object config(){return settings.config();}
    @GetMapping("/me/try-on/quota")public Object quota(){return tx.quota();}
    @PostMapping("/me/try-on/uploads")public Object authorize(@RequestBody Map<String,Object> body){return service.authorize(body);}
    @PutMapping("/private-uploads/{id}/content")public ResponseEntity<?> upload(@PathVariable String id,@RequestHeader(name="X-Upload-Token",required=false)String token,HttpServletRequest request)throws IOException{service.upload(Inputs.id(id),token,request.getContentType(),request.getInputStream(),request.getContentLengthLong());return ResponseEntity.noContent().build();}
    @PostMapping("/me/try-on/uploads/{id}/finalize")public Object finalizeUpload(@PathVariable String id){return service.finalizeUpload(Inputs.id(id));}
    @DeleteMapping("/me/try-on/uploads/{id}")public ResponseEntity<?> discardSource(@PathVariable String id){service.discardSource(Inputs.id(id));return ResponseEntity.noContent().build();}
    @PostMapping("/me/try-on/jobs")public Object create(@RequestBody Map<String,Object> body){return service.create(body);}
    @GetMapping("/me/try-on/jobs")public Object jobs(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return service.jobs(page,size);}
    @GetMapping("/me/try-on/jobs/{id}")public Object get(@PathVariable String id){return service.get(Inputs.id(id));}
    @PostMapping("/me/try-on/jobs/{id}/cancel")public Object cancel(@PathVariable String id){return tx.cancel(Inputs.id(id));}
    @PostMapping("/me/try-on/jobs/{id}/save")public Object save(@PathVariable String id){return service.save(Inputs.id(id));}
    @DeleteMapping("/me/try-on/jobs/{id}")public ResponseEntity<?> discard(@PathVariable String id){service.discard(Inputs.id(id));return ResponseEntity.noContent().build();}
    @GetMapping("/me/try-on/gallery")public Object gallery(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return tx.gallery(page,size);}
    @DeleteMapping("/me/try-on/gallery/{id}")public ResponseEntity<?> deleteGallery(@PathVariable String id){service.deleteGallery(Inputs.id(id));return ResponseEntity.noContent().build();}
    @GetMapping("/private-media/{id}/content")public Object content(@PathVariable String id){return service.read(Inputs.id(id),false);}
    @GetMapping("/private-media/{id}/download")public Object download(@PathVariable String id){return service.read(Inputs.id(id),true);}
}
