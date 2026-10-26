package com.virtualwardrobe.foundation;

import java.io.IOException;
import java.util.UUID;

public interface TaskDispatcher {
    void dispatch(UUID jobId,int dispatchSequence) throws IOException;
    default void dispatch(UUID jobId)throws IOException{dispatch(jobId,1);}
}
