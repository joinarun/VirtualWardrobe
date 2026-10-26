package com.virtualwardrobe.ai;

import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;

public final class ImageValidation {
    private ImageValidation() { }
    public static void validate(byte[] image, String mimeType) {
        if (image == null || image.length == 0 || image.length > 10 * 1024 * 1024)
            throw new IllegalArgumentException("Image must be between 1 byte and 10 MB");
        if (!"image/png".equals(mimeType) && !"image/jpeg".equals(mimeType))
            throw new IllegalArgumentException("Only PNG and JPEG images are supported");
        try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(image))) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw new IllegalArgumentException("Image content is invalid");
            var reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                String format = reader.getFormatName().toLowerCase();
                if (!(format.equals("png") && mimeType.equals("image/png")) &&
                    !((format.equals("jpeg") || format.equals("jpg")) && mimeType.equals("image/jpeg")))
                    throw new IllegalArgumentException("Image content does not match its type");
                long width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || width * height > 20_000_000)
                    throw new IllegalArgumentException("Image exceeds 20 megapixels");
                if (reader.read(0) == null) throw new IllegalArgumentException("Image cannot be decoded");
            } finally { reader.dispose(); }
        } catch (IllegalArgumentException e) { throw e; }
        catch (Exception e) { throw new IllegalArgumentException("Image content is invalid"); }
    }
}
