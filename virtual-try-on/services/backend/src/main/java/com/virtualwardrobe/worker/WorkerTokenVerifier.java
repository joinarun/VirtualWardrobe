package com.virtualwardrobe.worker;

/** Machine request bearer verification; implementations never log tokens or raw verification errors. */
public interface WorkerTokenVerifier { boolean verify(String bearerToken); }
