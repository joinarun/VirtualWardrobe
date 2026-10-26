package com.virtualwardrobe.media;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Operators may lower limits within the resource envelope verified for this release. */
@Component
public record MediaLimits(long imageBytes,long imagePixels,long videoBytes,double videoSeconds) {
    public MediaLimits(@Value("${app.media.max-image-bytes:10485760}")long imageBytes,
                       @Value("${app.media.max-image-pixels:20000000}")long imagePixels,
                       @Value("${app.media.max-video-bytes:52428800}")long videoBytes,
                       @Value("${app.media.max-video-seconds:30}")double videoSeconds){
        if(imageBytes<1||imageBytes>10485760||imagePixels<1||imagePixels>20000000||videoBytes<1||videoBytes>52428800||!Double.isFinite(videoSeconds)||videoSeconds<=0||videoSeconds>30)throw new IllegalArgumentException("Media limits must stay within the tested 10 MiB / 20 MP / 50 MiB / 30 second resource envelope");
        this.imageBytes=imageBytes;this.imagePixels=imagePixels;this.videoBytes=videoBytes;this.videoSeconds=videoSeconds;
    }
    public static MediaLimits defaults(){return new MediaLimits(10485760,20000000,52428800,30);}
}
