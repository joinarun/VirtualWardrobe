package com.virtualwardrobe.ai;

import java.math.BigDecimal;
import java.nio.file.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class BenchmarkTest {
    @TempDir Path directory;
    private Path manifest(boolean consent, String person) throws Exception {
        Files.write(directory.resolve("person.png"),GoogleImageProviderTest.image(1));
        Files.write(directory.resolve("garment.png"),GoogleImageProviderTest.image(2));
        Path path=directory.resolve("manifest.json");
        Files.writeString(path,"""
            {"assetRoot":".","source":"synthetic fixture","license":"owned","permittedUsage":"evaluation","consentRecorded":%s,"synthetic":true,
            "pairs":[{"id":"pair1","person":"%s","garment":"garment.png"}]}
            """.formatted(consent,person));return path;
    }
    @Test void rejectsMissingConsentBeforeProviderCall() throws Exception {
        assertThatThrownBy(()->BenchmarkMain.validateManifest(manifest(false,"person.png"),1)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("consent");
    }
    @Test void overBudgetMakesNoCalls() throws Exception {
        var calls=new AtomicInteger();var input=manifest(true,"person.png");
        ImageProvider fake=request->{calls.incrementAndGet();return new MockTryOnProvider().generate(request);};
        assertThatThrownBy(()->BenchmarkMain.evaluate(input,directory.resolve("out"),1,"live",new BigDecimal("0.01"),new BigDecimal("0.10"),fake,"m"))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("spend");
        assertThat(calls.get()).isZero();
    }
    @Test void mockedSuccessNeverPassesHumanGate() throws Exception {
        var report=BenchmarkMain.evaluate(manifest(true,"person.png"),directory.resolve("out"),1,"mock",BigDecimal.ZERO,new BigDecimal("0.10"),new MockTryOnProvider(),"fixture-v1");
        assertThat(report.get("qualityGate").getAsString()).isEqualTo("HUMAN_REVIEW_PENDING");
        assertThat(report.get("launchGatePassed").getAsBoolean()).isFalse();assertThat(Files.readString(directory.resolve("out/review.csv"))).contains("pair1,,,,,,");
    }
    @Test void traversalIsRejected() throws Exception {
        Path outside=directory.getParent().resolve("outside-photo.png");Files.write(outside,GoogleImageProviderTest.image(1));
        try {assertThatThrownBy(()->BenchmarkMain.validateManifest(manifest(true,"../outside-photo.png"),1)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("escapes");}
        finally {Files.deleteIfExists(outside);}
    }
}
