package com.virtualwardrobe.identity;

public final class ApiProblem extends RuntimeException {
    public final int status;
    public final String code;
    public ApiProblem(int status, String code, String detail) { super(detail);this.status=status;this.code=code; }
    public static ApiProblem bad(String detail) { return new ApiProblem(422,"VALIDATION_FAILED",detail); }
    public static ApiProblem forbidden() { return new ApiProblem(403,"ACCESS_DENIED","You do not have access to this action"); }
    public static ApiProblem missing() { return new ApiProblem(404,"NOT_FOUND","This item is unavailable"); }
}
