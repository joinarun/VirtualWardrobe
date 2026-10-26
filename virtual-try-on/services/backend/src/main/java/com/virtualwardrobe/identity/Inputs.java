package com.virtualwardrobe.identity;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public final class Inputs {
    private Inputs() { }
    public static String text(Map<String,?> body,String name,int max) {
        Object value=body.get(name);
        if (!(value instanceof String s) || s.isBlank() || s.length()>max) throw ApiProblem.bad("A valid "+name+" is required");
        return s.trim();
    }
    public static String optional(Map<String,?> body,String name,int max) {
        if (body.get(name)==null) return "";
        Object value=body.get(name);if (!(value instanceof String s) || s.length()>max) throw ApiProblem.bad("Invalid "+name);return s.trim();
    }
    public static String credential(Map<String,?> body,String name) {
        Object value=body.get(name);if(!(value instanceof String s)||s.isEmpty()||s.length()>200)throw ApiProblem.bad("A valid "+name+" is required");return s;
    }
    public static UUID id(String value) { try { return UUID.fromString(value); }catch(Exception e) {throw ApiProblem.missing();} }
    public static String email(String value) {
        String s=value.trim().toLowerCase(Locale.ROOT);
        if (s.length()>254 || !s.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw ApiProblem.bad("A valid email is required");return s;
    }
    public static String phone(String country,String number) {
        String raw=number.replaceAll("[\\s()-]","");
        if (!raw.startsWith("+")) raw=country.replaceAll("[\\s()-]","")+raw.replaceFirst("^0+","");
        if (!raw.matches("\\+[1-9][0-9]{7,14}")) throw ApiProblem.bad("A valid international phone number is required");return raw;
    }
    public static String password(Map<String,?> body,String key) {
        Object v=body.get(key);if (!(v instanceof String s) || s.length()<12 || s.getBytes(StandardCharsets.UTF_8).length>72) throw ApiProblem.bad("Password must have at least12characters and at most72UTF-8bytes");return s;
    }
    public static String hash(String value) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception e) {throw new IllegalStateException("Hash unavailable");}
    }
    public static String secret() { byte[] b=new byte[24];new java.security.SecureRandom().nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
}
