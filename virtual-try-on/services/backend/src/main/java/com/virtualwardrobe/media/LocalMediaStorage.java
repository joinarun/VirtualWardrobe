package com.virtualwardrobe.media;

import java.io.IOException;
import java.nio.file.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.adapter-mode",havingValue="local",matchIfMissing=true)
public class LocalMediaStorage implements MediaStorage {
    private final Path root;
    public LocalMediaStorage(@Value("${app.local-data-directory:work/local-data}")String directory){root=Path.of(directory).toAbsolutePath().normalize();}
    private Path resolve(String key)throws IOException {
        if(key==null||key.isBlank()||key.startsWith("/")||key.contains("\\")||java.util.Arrays.asList(key.split("/")).contains(".."))throw new IOException("Unsafe storage key");
        Path p=root.resolve(key).normalize();if(!p.startsWith(root)||p.equals(root))throw new IOException("Unsafe storage key");
        Path parent=p.getParent();while(parent!=null&&parent.startsWith(root)){if(Files.isSymbolicLink(parent))throw new IOException("Symbolic links are not storage paths");parent=parent.getParent();}
        if(Files.isSymbolicLink(p))throw new IOException("Symbolic links are not storage objects");return p;
    }
    @Override public void put(String key,byte[] bytes,String contentType)throws IOException {Path p=resolve(key);Files.createDirectories(p.getParent());Files.write(p,bytes);}
    @Override public byte[] read(String key)throws IOException {Path p=resolve(key);if(Files.size(p)>50L*1024*1024)throw new IOException("Object exceeds storage read limit");return Files.readAllBytes(p);}
    @Override public void delete(String key)throws IOException {Files.deleteIfExists(resolve(key));}
}
