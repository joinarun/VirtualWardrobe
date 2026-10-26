package com.virtualwardrobe;

import com.virtualwardrobe.foundation.FoundationProperties;
import com.virtualwardrobe.foundation.MockImageProvider;
import com.virtualwardrobe.foundation.LocalStorageAdapter;
import java.nio.file.Path;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
class BackendApplicationTests {
    @Autowired JdbcTemplate jdbc;
    @Test void migrationRunsAgainstPostgres() {
        assertThat(jdbc.queryForObject("select count(*) from app_installation", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL");
    }
    @Test void mockProviderNeverClaimsLiveOutput() {
        var metadata = new MockImageProvider().metadata();
        assertThat(metadata.demo()).isTrue();
        assertThat(metadata.label()).isEqualTo("Demo preview");
    }
    @Test void localStorageRejectsTraversal(@TempDir Path directory) throws Exception {
        var storage = new LocalStorageAdapter(directory.toString());
        storage.put("owner/example.bin", new byte[]{1, 2, 3});
        assertThat(storage.read("owner/example.bin")).containsExactly(1, 2, 3);
        assertThatThrownBy(() -> storage.read("../escape")).isInstanceOf(IllegalArgumentException.class);
        storage.delete("owner/example.bin");
    }
    @Test void invalidModeIsRejected() {
        assertThatThrownBy(() -> new FoundationProperties("unknown", "local", "mock")).isInstanceOf(IllegalArgumentException.class);
    }
}
