package com.virtualwardrobe.media;

import com.virtualwardrobe.identity.ApiProblem;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Bounded ISO-BMFF metadata walk: no codec execution, external process or URL fetch. */
@Component
public class Mp4Validator {
    private final MediaLimits limits;
    public Mp4Validator(MediaLimits limits){this.limits=limits;}
    public record Video(double durationSeconds) { }
    private static class State {int boxes;boolean ftyp,video,mdat;double duration;}
    public Video validate(byte[] bytes){
        if(bytes.length==0||bytes.length>limits.videoBytes())throw ApiProblem.bad("Video exceeds the configured byte limit");
        var state=new State();try{walk(ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN),0,bytes.length,0,state);}catch(RuntimeException e){if(e instanceof ApiProblem p)throw p;throw ApiProblem.bad("Invalid MP4 video");}
        if(!state.ftyp||!state.video||!state.mdat||state.duration<=0||state.duration>limits.videoSeconds()+.001)throw ApiProblem.bad("Provide a valid MP4 within the configured duration limit (maximum 30 seconds)");return new Video(state.duration);
    }
    private void walk(ByteBuffer data,int start,int end,int depth,State state){
        if(depth>8)throw ApiProblem.bad("MP4 structure is too deeply nested");int cursor=start;
        while(cursor<end){
            if(++state.boxes>10000||end-cursor<8)throw ApiProblem.bad("Invalid MP4 structure");
            long size=Integer.toUnsignedLong(data.getInt(cursor));String type=type(data,cursor+4);int header=8;
            if(size==1){if(end-cursor<16)throw ApiProblem.bad("Invalid MP4 structure");size=data.getLong(cursor+8);header=16;}
            if(size==0)size=end-cursor;
            if(size<header||size>end-cursor)throw ApiProblem.bad("Invalid MP4 box length");int body=cursor+header,boxEnd=(int)(cursor+size);
            if(type.equals("ftyp")){if(boxEnd-body<8)throw ApiProblem.bad("Invalid MP4 file type");state.ftyp=true;}
            if(type.equals("mdat")){if(boxEnd>body)state.mdat=true;}
            if(type.equals("mvhd")){
                int version=Byte.toUnsignedInt(data.get(body));int scaleOffset=version==1?20:12,durationOffset=version==1?24:16;
                if(version>1||boxEnd-body<durationOffset+(version==1?8:4))throw ApiProblem.bad("Invalid MP4 duration");
                long scale=Integer.toUnsignedLong(data.getInt(body+scaleOffset));long duration=version==1?data.getLong(body+durationOffset):Integer.toUnsignedLong(data.getInt(body+durationOffset));
                if(scale==0||duration<0)throw ApiProblem.bad("Invalid MP4 duration");state.duration=Math.max(state.duration,(double)duration/scale);
            }
            if(type.equals("hdlr")&&boxEnd-body>=12&&type(data,body+8).equals("vide"))state.video=true;
            if(Set.of("moov","trak","mdia","minf","stbl").contains(type))walk(data,body,boxEnd,depth+1,state);
            cursor=boxEnd;
        }
    }
    private String type(ByteBuffer data,int offset){byte[] bytes=new byte[4];for(int i=0;i<4;i++)bytes[i]=data.get(offset+i);return new String(bytes,StandardCharsets.US_ASCII);}
}
