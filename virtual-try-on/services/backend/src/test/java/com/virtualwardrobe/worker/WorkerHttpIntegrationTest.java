package com.virtualwardrobe.worker;

import java.sql.DriverManager;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class WorkerHttpIntegrationTest {
    static final String SCHEMA="worker_test_"+UUID.randomUUID().toString().replace("-","");static final String BASE=System.getenv().getOrDefault("SPRING_DATASOURCE_URL","jdbc:postgresql://localhost:5433/virtualwardrobe");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",()->BASE+(BASE.contains("?")?"&":"?")+"currentSchema="+SCHEMA);r.add("spring.flyway.schemas",()->SCHEMA);r.add("spring.flyway.default-schema",()->SCHEMA);r.add("app.bootstrap.email",()->"");r.add("app.bootstrap.password",()->"");r.add("app.mode",()->"worker");r.add("app.worker.local-loop-enabled",()->"false");r.add("APP_WORKER_LOCAL_TOKEN",()->"test-only-machine-delivery-token");}
    @Autowired MockMvc mvc;
    @AfterAll static void remove()throws Exception{try(var c=DriverManager.getConnection(BASE,System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME","virtualwardrobe"),System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD",""));var s=c.createStatement()){s.execute("DROP SCHEMA "+SCHEMA+" CASCADE");}}
    @Test void workerRequiresActualMachineBearerAndDoesNotAcceptServerlessHeaderOrCookie()throws Exception{
        mvc.perform(post("/internal/maintenance").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/maintenance").header("X-Serverless-Authorization","Bearer test-only-machine-delivery-token").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/maintenance").header("Authorization","Bearer invalid-token").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/maintenance").header("Authorization","Bearer test-only-machine-delivery-token").contentType("application/json").content("{}")).andExpect(status().isOk());
    }
    @Test void workerDoesNotExposeCustomerApiAndRejectsMalformedDelivery()throws Exception{
        mvc.perform(get("/api/v1/me/try-on/jobs")).andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/jobs/"+UUID.randomUUID()+"/run").header("Authorization","Bearer test-only-machine-delivery-token").header("X-VirtualWardrobe-Dispatch-Sequence","3").contentType("application/json").content("{\"jobId\":\"different\"}")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }
}
