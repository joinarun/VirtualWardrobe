package com.virtualwardrobe.ai;

public record GenerationRequest(byte[] person, String personMimeType, byte[] garment, String garmentMimeType) {
    public GenerationRequest {
        ImageValidation.validate(person, personMimeType);
        ImageValidation.validate(garment, garmentMimeType);
        person = person.clone();
        garment = garment.clone();
    }
}
