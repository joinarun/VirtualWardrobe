package com.virtualwardrobe.foundation;

import java.io.IOException;
import java.util.UUID;

public interface TaskDispatcher { void dispatch(UUID jobId) throws IOException; }
