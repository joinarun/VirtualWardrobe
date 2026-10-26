package com.virtualwardrobe.demo;

/** Public CLI errors are codes only; underlying SQL/storage details are deliberately not retained. */
public final class DemoFailure extends RuntimeException {
    public final String code;
    public DemoFailure(String code){super(code);this.code=code;}
}
