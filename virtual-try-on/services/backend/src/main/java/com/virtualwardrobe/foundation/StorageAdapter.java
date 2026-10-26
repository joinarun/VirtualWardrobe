package com.virtualwardrobe.foundation;

import java.io.IOException;

public interface StorageAdapter {
    void put(String key, byte[] bytes) throws IOException;
    byte[] read(String key) throws IOException;
    void delete(String key) throws IOException;
}
