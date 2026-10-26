package com.virtualwardrobe.media;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.virtualwardrobe.identity.ApiProblem;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import javax.imageio.*;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.stereotype.Component;

@Component
public class ImageProcessor {
    private final MediaLimits limits;
    public ImageProcessor(MediaLimits limits){this.limits=limits;}
    private final java.util.concurrent.Semaphore decoding=new java.util.concurrent.Semaphore(2,true);
    public record Processed(byte[] image,byte[] thumbnail,int width,int height) { }
    public Processed process(byte[] bytes,String mime) {
        boolean acquired=false;
        try {
            acquired=decoding.tryAcquire(1,java.util.concurrent.TimeUnit.SECONDS);
            if(!acquired)throw new ApiProblem(429,"MEDIA_BUSY","Image processing is busy; retry shortly");
            return processAcquired(bytes,mime);
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiProblem(429,"MEDIA_BUSY","Image processing was interrupted; retry shortly");}
        finally{if(acquired)decoding.release();}
    }
    private Processed processAcquired(byte[] bytes,String mime) {
        if(bytes.length==0||bytes.length>limits.imageBytes())throw ApiProblem.bad("Image exceeds the configured byte limit");
        try(var input=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))){
            var readers=ImageIO.getImageReaders(input);if(!readers.hasNext())throw ApiProblem.bad("Image content is invalid");var reader=readers.next();
            BufferedImage image;
            try{
                reader.setInput(input,true,true);String format=reader.getFormatName().toLowerCase();
                boolean matches=(mime.equals("image/png")&&format.equals("png"))||(mime.equals("image/jpeg")&&(format.equals("jpeg")||format.equals("jpg")))||(mime.equals("image/webp")&&format.equals("webp"));
                if(!matches)throw ApiProblem.bad("Image content does not match its declared type");
                long width=reader.getWidth(0),height=reader.getHeight(0);if(width<1||height<1||width*height>limits.imagePixels())throw ApiProblem.bad("Image exceeds the configured pixel limit (maximum 20 megapixels)");
                image=reader.read(0);if(image==null)throw ApiProblem.bad("Image cannot be decoded");
            }finally{reader.dispose();}
            int orientation=1;
            try{
                if(mime.equals("image/png"))orientation=pngOrientation(bytes);
                else{var metadata=ImageMetadataReader.readMetadata(new ByteArrayInputStream(bytes));var exif=metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);if(exif!=null&&exif.containsTag(ExifIFD0Directory.TAG_ORIENTATION))orientation=exif.getInt(ExifIFD0Directory.TAG_ORIENTATION);}
            }catch(Exception ignored){/* Missing EXIF is valid; raw metadata is never retained. */}
            image=orient(image,orientation);
            return new Processed(jpeg(image,.92f),jpeg(scale(image,640),.84f),image.getWidth(),image.getHeight());
        }catch(ApiProblem e){throw e;}catch(Exception e){throw ApiProblem.bad("Image content is invalid or unsupported");}
    }
    /** Read only PNG's uncompressed eXIf orientation. Never inflate text or colour-profile metadata. */
    private int pngOrientation(byte[] bytes){
        var data=java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.BIG_ENDIAN);int cursor=8;
        while(cursor<=bytes.length-12){
            long length=Integer.toUnsignedLong(data.getInt(cursor));if(length>bytes.length-cursor-12)return 1;
            if(data.getInt(cursor+4)==0x65584966){
                int base=cursor+8,end=base+(int)length;if(length<8)return 1;
                if(data.getShort(base)==0x4949)data.order(java.nio.ByteOrder.LITTLE_ENDIAN);else if(data.getShort(base)!=0x4d4d)return 1;
                if(Short.toUnsignedInt(data.getShort(base+2))!=42)return 1;
                long relative=Integer.toUnsignedLong(data.getInt(base+4));if(relative>length-2)return 1;int directory=base+(int)relative;
                int entries=Short.toUnsignedInt(data.getShort(directory));if(entries>4096||entries>(end-directory-2)/12)return 1;
                for(int i=0;i<entries;i++){int entry=directory+2+i*12;if(Short.toUnsignedInt(data.getShort(entry))==274&&Short.toUnsignedInt(data.getShort(entry+2))==3&&data.getInt(entry+4)==1){int value=Short.toUnsignedInt(data.getShort(entry+8));return value>=1&&value<=8?value:1;}}
                return 1;
            }
            cursor+=(int)length+12;
        }
        return 1;
    }
    private BufferedImage orient(BufferedImage source,int orientation){
        if(orientation==1&&!source.getColorModel().hasAlpha()&&(source.getType()==BufferedImage.TYPE_INT_RGB||source.getType()==BufferedImage.TYPE_3BYTE_BGR))return source;
        int w=source.getWidth(),h=source.getHeight();boolean swap=orientation>=5&&orientation<=8;
        var target=new BufferedImage(swap?h:w,swap?w:h,BufferedImage.TYPE_INT_RGB);
        var g=target.createGraphics();g.setColor(Color.WHITE);g.fillRect(0,0,target.getWidth(),target.getHeight());
        var transform=new java.awt.geom.AffineTransform();
        switch(orientation){
            case 2-> {transform.translate(w,0);transform.scale(-1,1);}
            case 3-> {transform.translate(w,h);transform.rotate(Math.PI);}
            case 4-> {transform.translate(0,h);transform.scale(1,-1);}
            case 5-> {transform.rotate(Math.PI/2);transform.scale(1,-1);}
            case 6-> {transform.translate(h,0);transform.rotate(Math.PI/2);}
            case 7-> {transform.translate(h,w);transform.rotate(Math.PI/2);transform.scale(-1,1);}
            case 8-> {transform.translate(0,w);transform.rotate(-Math.PI/2);}
            default-> { }
        }
        g.drawImage(source,transform,null);g.dispose();return target;
    }
    private BufferedImage scale(BufferedImage source,int limit){
        double ratio=Math.min(1d,(double)limit/Math.max(source.getWidth(),source.getHeight()));int w=Math.max(1,(int)Math.round(source.getWidth()*ratio)),h=Math.max(1,(int)Math.round(source.getHeight()*ratio));
        var target=new BufferedImage(w,h,BufferedImage.TYPE_INT_RGB);var g=target.createGraphics();g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);g.drawImage(source,0,0,w,h,null);g.dispose();return target;
    }
    private byte[] jpeg(BufferedImage image,float quality)throws IOException {
        var out=new ByteArrayOutputStream();var writer=ImageIO.getImageWritersByFormatName("jpeg").next();
        try(var stream=new MemoryCacheImageOutputStream(out)){writer.setOutput(stream);var parameters=writer.getDefaultWriteParam();parameters.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);parameters.setCompressionQuality(quality);writer.write(null,new IIOImage(image,null,null),parameters);stream.flush();}finally{writer.dispose();}return out.toByteArray();
    }
}
