package com.virtualwardrobe.identity;

import com.virtualwardrobe.foundation.SafeFailures;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ProblemAdvice {
    @ExceptionHandler(ApiProblem.class)
    ResponseEntity<?> problem(ApiProblem p) {
        if (p.status >= 500 && java.util.Set.of("STORAGE_UNAVAILABLE", "SIGNUP_UNAVAILABLE").contains(p.code))
            SafeFailures.record(SafeFailures.Code.DEPENDENCY_UNAVAILABLE);
        return ResponseEntity.status(p.status).header("Cache-Control","no-store").header("Content-Type","application/problem+json")
                .body(Map.of("type","about:blank","title",p.code,"status",p.status,"code",p.code,"detail",p.getMessage()));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict() { return problem(new ApiProblem(409,"CONFLICT","This change conflicts with an existing record")); }
    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<?> invalid() { return problem(ApiProblem.bad("One or more values are invalid")); }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<?> invalidRequest() {
        return problem(new ApiProblem(400, "INVALID_REQUEST", "The request could not be read"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unexpected(Exception failure) {
        // Preserve framework client errors without echoing parser, binding or request details.
        if (failure instanceof ErrorResponse error && error.getStatusCode().is4xxClientError())
            return ResponseEntity.status(error.getStatusCode()).headers(error.getHeaders())
                    .header("Cache-Control", "no-store").header("Content-Type", "application/problem+json")
                    .body(Map.of("type", "about:blank", "title", "REQUEST_REJECTED",
                            "status", error.getStatusCode().value(), "code", "REQUEST_REJECTED",
                            "detail", "The request could not be processed"));
        SafeFailures.record(SafeFailures.Code.UNEXPECTED_REQUEST);
        return problem(new ApiProblem(500, "INTERNAL_ERROR", "The request could not be completed. Please try again later"));
    }
}
