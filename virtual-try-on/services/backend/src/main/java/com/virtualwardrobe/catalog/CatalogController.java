package com.virtualwardrobe.catalog;

import com.virtualwardrobe.identity.Inputs;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="app.mode",havingValue="api",matchIfMissing=true)
@RequestMapping("/api/v1")
public class CatalogController {
    private final CatalogService catalog;public CatalogController(CatalogService catalog){this.catalog=catalog;}
    @GetMapping("/products")public Object products(@RequestParam Map<String,String> filters){return catalog.products(filters,null);}
    @GetMapping("/products/{id}")public Object product(@PathVariable String id){return catalog.product(Inputs.id(id));}
    @GetMapping("/stores/{store}/products")public Object managed(@PathVariable String store,@RequestParam Map<String,String> filters){return catalog.products(filters,Inputs.id(store));}
    @PostMapping("/stores/{store}/products")public Object create(@PathVariable String store,@RequestBody Map<String,Object> body){return catalog.create(Inputs.id(store),body);}
    @PatchMapping("/stores/{store}/products/{id}")public Object patch(@PathVariable String store,@PathVariable String id,@RequestBody Map<String,Object> body){return catalog.patch(Inputs.id(store),Inputs.id(id),body);}
    @DeleteMapping("/stores/{store}/products/{id}")public ResponseEntity<?> archive(@PathVariable String store,@PathVariable String id){catalog.archive(Inputs.id(store),Inputs.id(id));return ResponseEntity.noContent().build();}
    @GetMapping("/categories")public Object categories(){return catalog.categories();}
    @PostMapping("/admin/categories")public Object category(@RequestBody Map<String,Object> body){return catalog.category(null,body);}
    @PatchMapping("/admin/categories/{id}")public Object category(@PathVariable String id,@RequestBody Map<String,Object> body){return catalog.category(Inputs.id(id),body);}
    @GetMapping("/brands")public Object brands(@RequestParam(required=false)String storeId){return catalog.brands(storeId==null||storeId.isBlank()?null:Inputs.id(storeId));}
    @PostMapping("/admin/brands")public Object globalBrand(@RequestBody Map<String,Object> body){return catalog.brand(null,null,body);}
    @PatchMapping("/admin/brands/{id}")public Object globalBrand(@PathVariable String id,@RequestBody Map<String,Object> body){return catalog.brand(null,Inputs.id(id),body);}
    @PostMapping("/stores/{store}/brands")public Object brand(@PathVariable String store,@RequestBody Map<String,Object> body){return catalog.brand(Inputs.id(store),null,body);}
    @PatchMapping("/stores/{store}/brands/{id}")public Object brand(@PathVariable String store,@PathVariable String id,@RequestBody Map<String,Object> body){return catalog.brand(Inputs.id(store),Inputs.id(id),body);}
}
