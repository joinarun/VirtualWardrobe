package com.virtualwardrobe.tryon;

import com.virtualwardrobe.foundation.FoundationProperties;
import com.virtualwardrobe.media.MediaStorage;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeletionDrainBoundsTest {
    private final TryOnTransactions tx=mock(TryOnTransactions.class);
    private final MediaStorage storage=mock(MediaStorage.class);
    private final TryOnService service=new TryOnService(tx,null,storage,null,null,null,
            new FoundationProperties("api","local","mock"));

    @Test void overlappingApiAndMaintenanceDrainsDoNotAccumulateStorageCalls() throws Exception {
        when(tx.deletionBatch()).thenReturn(List.of(Map.of("object_key","pending/one")));
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        doAnswer(call->{entered.countDown();release.await(5,TimeUnit.SECONDS);return null;}).when(storage).delete("pending/one");
        try(var executor=Executors.newSingleThreadExecutor()){
            Future<Integer> first=executor.submit(service::drainDeletes);
            try{
                assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();
                long start=System.nanoTime();
                assertThat(service.drainDeletes()).isZero();
                assertThat(Duration.ofNanos(System.nanoTime()-start)).isLessThan(Duration.ofSeconds(1));
                verify(tx,times(1)).deletionBatch();
            }finally{release.countDown();}
            assertThat(first.get(5,TimeUnit.SECONDS)).isEqualTo(1);
        }
        assertThat(service.drainDeletes()).isEqualTo(1);
        verify(tx,times(2)).deletionBatch();
    }

    @Test void oneSlowSdkAttemptDoesNotStartNinetyNineMoreAttempts() throws Exception {
        when(tx.deletionBatch()).thenReturn(List.of(Map.of("object_key","pending/one"),
                Map.of("object_key","pending/two"),Map.of("object_key","pending/three")));
        doAnswer(call->{Thread.sleep(2100);return null;}).when(storage).delete("pending/one");
        assertThat(service.drainDeletes()).isEqualTo(1);
        verify(storage,times(1)).delete("pending/one");
        verify(storage,never()).delete("pending/two");verify(storage,never()).delete("pending/three");
        verify(tx).deletionFinished("pending/one",true);
        verify(tx,never()).deletionFinished("pending/two",true);
    }

    @Test void databaseFailureReleasesThePermitForDurableRetry() {
        when(tx.deletionBatch()).thenReturn(List.of(Map.of("object_key","pending/one")));
        doThrow(new DataAccessResourceFailureException("controlled unavailable database"))
                .doNothing().when(tx).deletionFinished("pending/one",true);
        assertThatThrownBy(service::drainDeletes).isInstanceOf(DataAccessResourceFailureException.class);
        assertThat(service.drainDeletes()).isEqualTo(1);
        verify(tx,times(2)).deletionBatch();
    }
}
