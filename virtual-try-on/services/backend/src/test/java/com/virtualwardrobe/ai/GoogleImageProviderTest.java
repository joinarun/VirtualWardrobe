package com.virtualwardrobe.ai;

import com.google.gson.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class GoogleImageProviderTest {
    static byte[] image(int rgb) throws Exception {
        var image=new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB); image.setRGB(0,0,rgb);
        var out=new ByteArrayOutputStream(); ImageIO.write(image,"png",out); return out.toByteArray();
    }
    private JsonObject part(byte[] bytes, boolean thought) {
        var data=new JsonObject();data.addProperty("mimeType","image/png");data.addProperty("data",Base64.getEncoder().encodeToString(bytes));
        var p=new JsonObject();p.add("inlineData",data);p.addProperty("thought",thought);return p;
    }
    @Test void selectsFinalNonThoughtImage() throws Exception {
        var parts=new JsonArray();parts.add(part(image(0xFF0000),true));parts.add(part(image(0x00FF00),false));parts.add(part(image(0x0000FF),true));
        var content=new JsonObject();content.add("parts",parts);var candidate=new JsonObject();candidate.add("content",content);
        var candidates=new JsonArray();candidates.add(candidate);var root=new JsonObject();root.add("candidates",candidates);
        var result=GoogleImageProvider.parseResponse(root.toString(),"test-model");
        assertThat(result.image()).containsExactly(image(0x00FF00));assertThat(result.demo()).isFalse();
    }
    @Test void rejectsOnlyThoughtImage() throws Exception {
        var parts=new JsonArray();parts.add(part(image(1),true));
        var content=new JsonObject();content.add("parts",parts);var candidate=new JsonObject();candidate.add("content",content);
        var cs=new JsonArray();cs.add(candidate);var root=new JsonObject();root.add("candidates",cs);
        assertThatThrownBy(()->GoogleImageProvider.parseResponse(root.toString(),"m")).isInstanceOf(ProviderFailure.class).hasMessage("Provider returned no final image");
    }
    @Test void malformedBytesAndRawProviderContentAreNotExposed() {
        assertThatThrownBy(()->GoogleImageProvider.parseResponse("private raw content", "m"))
            .isInstanceOf(ProviderFailure.class).hasMessage("Provider returned an invalid final image");
    }
    @Test void mockAlwaysLabelsItself() throws Exception {
        var bytes=image(3);var result=new MockTryOnProvider().generate(new GenerationRequest(bytes,"image/png",bytes,"image/png"));
        assertThat(result.demo()).isTrue();assertThat(result.label()).isEqualTo("Demo preview");assertThat(result.estimatedCostUsd()).isZero();
    }
}
