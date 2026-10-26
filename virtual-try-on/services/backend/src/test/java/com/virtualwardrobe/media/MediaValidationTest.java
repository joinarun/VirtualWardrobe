package com.virtualwardrobe.media;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.virtualwardrobe.identity.ApiProblem;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.*;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class MediaValidationTest {
    private final ImageProcessor images=new ImageProcessor(MediaLimits.defaults());
    public static byte[] png(int width,int height)throws Exception{
        var image=new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB);for(int x=0;x<width;x++)for(int y=0;y<height;y++)image.setRGB(x,y,((x*79+y*23)&255)<<16|((x*31+y*41)&255)<<8|((x+y*17)&255));
        var out=new ByteArrayOutputStream();ImageIO.write(image,"png",out);return out.toByteArray();
    }
    @Test void producesOptimizedThumbnailAndNormalizedJpeg()throws Exception{
        byte[] source=png(1200,1600);var result=images.process(source,"image/png");var thumb=ImageIO.read(new ByteArrayInputStream(result.thumbnail()));
        assertThat(result.width()).isEqualTo(1200);assertThat(result.height()).isEqualTo(1600);assertThat(Math.max(thumb.getWidth(),thumb.getHeight())).isEqualTo(640);
        assertThat(result.thumbnail().length).isLessThan(result.image().length).isLessThan(source.length);
    }
    @Test void orientationIsAppliedAndExifIsNotRetained()throws Exception{
        var image=new BufferedImage(4,2,BufferedImage.TYPE_INT_RGB);var encoded=new ByteArrayOutputStream();ImageIO.write(image,"jpeg",encoded);byte[] original=encoded.toByteArray();
        var exif=ByteBuffer.allocate(32).order(ByteOrder.BIG_ENDIAN);exif.put(new byte[]{'E','x','i','f',0,0,'M','M',0,42,0,0,0,8,0,1,1,18,0,3,0,0,0,1,0,6,0,0,0,0,0,0});
        var withExif=new ByteArrayOutputStream();withExif.write(original,0,2);withExif.write(new byte[]{(byte)255,(byte)225,0,34});withExif.write(exif.array());withExif.write(original,2,original.length-2);
        var result=images.process(withExif.toByteArray(),"image/jpeg");assertThat(result.width()).isEqualTo(2);assertThat(result.height()).isEqualTo(4);
        assertThat(ImageMetadataReader.readMetadata(new ByteArrayInputStream(result.image())).getFirstDirectoryOfType(ExifIFD0Directory.class)).isNull();
    }
    @Test void rejectsMimeMismatchAndLargeDimensionsBeforeDecode()throws Exception{
        byte[] png=png(2,2);assertThatThrownBy(()->images.process(png,"image/jpeg")).isInstanceOf(ApiProblem.class);
        var data=ByteBuffer.wrap(png).order(ByteOrder.BIG_ENDIAN);data.putInt(16,50000);data.putInt(20,50000);var crc=new CRC32();crc.update(png,12,17);data.putInt(29,(int)crc.getValue());
        assertThatThrownBy(()->images.process(png,"image/png")).isInstanceOf(ApiProblem.class).hasMessageContaining("20 megapixels");
    }
    @Test void validatesRealVideoDurationAndRejectsCorruptContent()throws Exception{
        byte[] valid=getClass().getResourceAsStream("/catalog/valid-2s.mp4").readAllBytes();byte[] longVideo=getClass().getResourceAsStream("/catalog/invalid-31s.mp4").readAllBytes();var validator=new Mp4Validator(MediaLimits.defaults());
        assertThat(validator.validate(valid).durationSeconds()).isBetween(1.9,2.1);
        assertThatThrownBy(()->validator.validate(longVideo)).isInstanceOf(ApiProblem.class).hasMessageContaining("30 seconds");
        assertThatThrownBy(()->validator.validate(new byte[]{1,2,3})).isInstanceOf(ApiProblem.class);
    }
    @Test void processesTwoAllowedTwentyMegapixelImagesConcurrently()throws Exception{
        // Highly compressible source tests the decoded allocation bound, not merely compressed byte size.
        var source=new BufferedImage(4000,5000,BufferedImage.TYPE_INT_RGB);var out=new ByteArrayOutputStream();ImageIO.write(source,"png",out);source=null;byte[] bytes=out.toByteArray();
        var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try{
            var calls=java.util.List.of(pool.submit(()->images.process(bytes,"image/png")),pool.submit(()->images.process(bytes,"image/png")));
            for(var call:calls){var processed=call.get(30,java.util.concurrent.TimeUnit.SECONDS);assertThat(processed.width()).isEqualTo(4000);assertThat(processed.height()).isEqualTo(5000);}
        }finally{pool.shutdownNow();}
    }
    @Test void configuredLowerLimitsApplyToActualImageAndVideoContent()throws Exception{
        var limits=new MediaLimits(10485760,100,52428800,1);byte[] png=png(11,10),video=getClass().getResourceAsStream("/catalog/valid-2s.mp4").readAllBytes();
        assertThatThrownBy(()->new ImageProcessor(limits).process(png,"image/png")).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->new Mp4Validator(limits).validate(video)).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(()->new MediaLimits(10485760,20000001,52428800,30)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void pngOrientationWorksWithoutInflatingTwoGigabytesOfAncillaryText()throws Exception{
        var compressed=new ByteArrayOutputStream();try(var deflate=new java.util.zip.DeflaterOutputStream(compressed)){byte[] zero=new byte[32768];for(int i=0;i<65536;i++)deflate.write(zero);}
        var text=new ByteArrayOutputStream();text.write(new byte[]{'k',0,0});text.write(compressed.toByteArray());
        byte[] tiff={'M','M',0,42,0,0,0,8,0,1,1,18,0,3,0,0,0,1,0,6,0,0,0,0,0,0};
        byte[] original=png(4,2);var source=new ByteArrayOutputStream();source.write(original,0,33);pngChunk(source,"zTXt",text.toByteArray());pngChunk(source,"eXIf",tiff);source.write(original,33,original.length-33);
        assertThat(source.size()).isLessThan(10*1024*1024);var result=images.process(source.toByteArray(),"image/png");assertThat(result.width()).isEqualTo(2);assertThat(result.height()).isEqualTo(4);
    }
    private void pngChunk(OutputStream output,String type,byte[] body)throws Exception{
        byte[] name=type.getBytes(java.nio.charset.StandardCharsets.US_ASCII);var data=new DataOutputStream(output);data.writeInt(body.length);data.write(name);data.write(body);var crc=new CRC32();crc.update(name);crc.update(body);data.writeInt((int)crc.getValue());
    }
}
