package com.virtualwardrobe.demo;

import com.google.gson.*;
import com.virtualwardrobe.media.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import javax.imageio.ImageIO;

public final class DemoAssets {
    public static final String[] STYLES={"ruby","indigo","rose","ivory","emerald","saffron","violet","charcoal"};
    public record ObjectPlan(String key,String mime,byte[] bytes){public String digest(){return hash(bytes);} @Override public String toString(){return "ObjectPlan[redacted]";}}
    public final Map<String,ImageProcessor.Processed> images;public final byte[] video;public final double videoSeconds;public final String fingerprint;
    private DemoAssets(Map<String,ImageProcessor.Processed> images,byte[] video,double seconds,String fingerprint){this.videoSeconds=seconds;this.images=Map.copyOf(images);this.video=video;this.fingerprint=fingerprint;}
    public static DemoAssets load(Path directory,String profile,int count)throws IOException{
        Path root=directory.toRealPath();if(!Files.isDirectory(root))throw new DemoFailure("ASSET_DIRECTORY_INVALID");
        var provenance=JsonParser.parseString(Files.readString(root.resolve("provenance.json"))).getAsJsonArray();Set<String> permitted=new HashSet<>();
        for(var entry:provenance){var e=entry.getAsJsonObject();if(e.has("file")&&e.has("source")&&e.has("usage")&&!e.get("source").getAsString().isBlank()&&!e.get("usage").getAsString().isBlank())permitted.add(e.get("file").getAsString());}
        var processor=new ImageProcessor(MediaLimits.defaults());Map<String,ImageProcessor.Processed> images=new LinkedHashMap<>();var digest=new ByteArrayOutputStream();digest.write(("demo-definition-v1|"+profile+"|"+count).getBytes(StandardCharsets.UTF_8));
        for(String name:java.util.stream.Stream.concat(Arrays.stream(STYLES).map(s->"saree-"+s+".png"),java.util.stream.Stream.of("saree-ruby-detail.png","saree-ruby-back.png")).toList()){
            if(!permitted.contains(name))throw new DemoFailure("ASSET_PROVENANCE_MISSING");Path path=root.resolve(name);if(Files.isSymbolicLink(path)||Files.size(path)>10L*1024*1024)throw new DemoFailure("ASSET_INVALID");byte[] bytes=Files.readAllBytes(path);images.put(name,processor.process(bytes,"image/png"));digest.write(name.getBytes(StandardCharsets.UTF_8));digest.write(hash(bytes).getBytes(StandardCharsets.US_ASCII));
        }
        if(!permitted.contains("demo-preview.mp4"))throw new DemoFailure("VIDEO_PROVENANCE_MISSING");Path videoPath=root.resolve("demo-preview.mp4");if(Files.isSymbolicLink(videoPath)||Files.size(videoPath)>50L*1024*1024)throw new DemoFailure("VIDEO_INVALID");byte[] video=Files.readAllBytes(videoPath);double seconds=new Mp4Validator(MediaLimits.defaults()).validate(video).durationSeconds();digest.write(hash(video).getBytes(StandardCharsets.US_ASCII));for(var entry:provenance){var e=entry.getAsJsonObject();String file=e.has("file")?e.get("file").getAsString():"";if(images.containsKey(file)||file.equals("demo-preview.mp4"))digest.write(e.toString().getBytes(StandardCharsets.UTF_8));}
        return new DemoAssets(images,video,seconds,hash(digest.toByteArray()));
    }
    public ImageProcessor.Processed logo(int index)throws IOException{var image=new BufferedImage(128,128,BufferedImage.TYPE_INT_RGB);var g=image.createGraphics();g.setColor(new Color[]{new Color(20,91,73),new Color(138,52,80),new Color(55,68,128),new Color(139,96,35)}[Math.floorMod(index,4)]);g.fillRect(0,0,128,128);g.setColor(new Color(246,225,179));g.setStroke(new BasicStroke(5));g.drawOval(20,20,88,88);g.drawRect(40,40,48,48);g.dispose();var out=new ByteArrayOutputStream();ImageIO.write(image,"png",out);return new ImageProcessor(MediaLimits.defaults()).process(out.toByteArray(),"image/png");}
    public static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception e){throw new IllegalStateException("Digest unavailable");}}
}
