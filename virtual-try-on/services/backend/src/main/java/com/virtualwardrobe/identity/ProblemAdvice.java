package com.virtualwardrobe.identity;

import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ProblemAdvice {
    @ExceptionHandler(ApiProblem.class)
    ResponseEntity<?> problem(ApiProblem p) {
        return ResponseEntity.status(p.status).header("Cache-Control","no-store").header("Content-Type","application/problem+json")
                .body(Map.of("type","about:blank","title",p.code,"status",p.status,"code",p.code,"detail",p.getMessage()));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict() { return problem(new ApiProblem(409,"CONFLICT","This change conflicts with an existing record")); }
    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<?> invalid() { return problem(ApiProblem.bad("One or more values are invalid")); }
}
