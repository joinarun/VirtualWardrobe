package com.virtualwardrobe.media;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

public interface MediaStorage {
    record SignedUpload(String url,String method,Map<String,String> headers,Instant expiresAt) { }
    void put(String key,byte[] bytes,String contentType)throws IOException;
    byte[] read(String key)throws IOException;
    void delete(String key)throws IOException;
    default Optional<SignedUpload> signUpload(String key,String contentType,long expectedBytes,Duration ttl)throws IOException{return Optional.empty();}
    default Optional<URI> signRead(String key,Duration ttl)throws IOException{return Optional.empty();}
}
