package com.virtualwardrobe.tryon;

import com.virtualwardrobe.ai.AiProperties;
import com.virtualwardrobe.foundation.FoundationProperties;
import com.virtualwardrobe.media.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.math.BigDecimal;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class TryOnPolicyTest {
    private TryOnSettings settings(String environment,String provider,boolean enabled,String report){return new TryOnSettings(new FoundationProperties("api","local",provider),new AiProperties("test-project","global","gemini-nano-banana-2.1",120),environment,enabled,5,100,new BigDecimal("5.00"),new BigDecimal("0.25"),100,report);}
    @Test void productionGoogleFailsClosedWithoutHumanApprovalButEvaluationDoesNotClaimApproval(){var production=settings("production","google",true,"");assertThat(production.disabledReason()).isEqualTo("QUALITY_APPROVAL_REQUIRED");assertThat(production.config().get("enabled")).isEqualTo(false);var evaluation=settings("demo","google",true,"");assertThat(evaluation.disabledReason()).isNull();assertThat(evaluation.config().get("mode")).isEqualTo("EVALUATION_DEMO");assertThat(evaluation.config().get("notice").toString()).contains("pending");assertThat(evaluation.consentNotice()).contains("outside India","does not promise zero provider retention");}
    @Test void fixtureKillSwitchAndConservativeBoundsAreExplicit(){var fixture=settings("local","mock",true,"");assertThat(fixture.config().get("mode")).isEqualTo("FIXTURE");assertThat(fixture.label()).isEqualTo("Demo preview");assertThat(fixture.attemptCost()).isZero();assertThat(settings("local","mock",false,"").disabledReason()).isEqualTo("GENERATION_PAUSED");assertThatThrownBy(()->new MediaLimits(10485760,20000001,52428800,30)).isInstanceOf(IllegalArgumentException.class);}
    @Test void providerInputsAreDownscaledWithinSupportedByteAndPixelEnvelope()throws Exception{var image=new BufferedImage(2000,3000,BufferedImage.TYPE_INT_RGB);var encoded=new ByteArrayOutputStream();ImageIO.write(image,"jpeg",encoded);var processor=new ImageProcessor(MediaLimits.defaults());byte[] prepared=processor.providerJpeg(encoded.toByteArray());var read=ImageIO.read(new ByteArrayInputStream(prepared));assertThat(Math.max(read.getWidth(),read.getHeight())).isEqualTo(2048);assertThat(prepared.length).isLessThan(10*1024*1024);}
}
