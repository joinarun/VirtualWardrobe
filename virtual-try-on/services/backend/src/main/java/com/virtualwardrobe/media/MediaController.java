package com.virtualwardrobe.media;

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
public class MediaController {
    private final MediaService media;public MediaController(MediaService media){this.media=media;}
    @PostMapping("/stores/{store}/products/{product}/uploads")public Object product(@PathVariable String store,@PathVariable String product,@RequestBody Map<String,Object> body){return media.authorize(Inputs.id(store),Inputs.id(product),null,"PRODUCT_IMAGE",body);}
    @PostMapping("/stores/{store}/logo/uploads")public Object storeLogo(@PathVariable String store,@RequestBody Map<String,Object> body){return media.authorize(Inputs.id(store),null,null,"STORE_LOGO",body);}
    @PostMapping("/stores/{store}/brands/{brand}/logo/uploads")public Object brandLogo(@PathVariable String store,@PathVariable String brand,@RequestBody Map<String,Object> body){return media.authorize(Inputs.id(store),null,Inputs.id(brand),"BRAND_LOGO",body);}
    @PostMapping("/admin/brands/{brand}/logo/uploads")public Object globalLogo(@PathVariable String brand,@RequestBody Map<String,Object> body){return media.authorize(null,null,Inputs.id(brand),"BRAND_LOGO",body);}
    @PutMapping("/uploads/{id}/content")public ResponseEntity<?> put(@PathVariable String id,@RequestHeader(name="X-Upload-Token",required=false)String token,HttpServletRequest request)throws IOException{media.upload(Inputs.id(id),token,request.getContentType(),request.getInputStream(),request.getContentLengthLong());return ResponseEntity.noContent().build();}
    @PostMapping("/uploads/{id}/finalize")public Object finalizeUpload(@PathVariable String id){return media.finalizeUpload(Inputs.id(id));}
    @GetMapping("/media/{id}/thumbnail")public Object thumbnail(@PathVariable String id){return media.read(Inputs.id(id),true);}
    @GetMapping("/media/{id}/content")public Object content(@PathVariable String id){return media.read(Inputs.id(id),false);}
    @DeleteMapping("/stores/{store}/products/{product}/media/{id}")public ResponseEntity<?> remove(@PathVariable String store,@PathVariable String product,@PathVariable String id){media.remove(Inputs.id(store),Inputs.id(product),Inputs.id(id));return ResponseEntity.noContent().build();}
}
