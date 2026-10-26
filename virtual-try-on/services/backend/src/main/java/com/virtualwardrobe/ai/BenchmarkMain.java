package com.virtualwardrobe.ai;

import com.google.gson.*;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/** Offline evaluation entrypoint. Does not start the HTTP server or require a database. */
public final class BenchmarkMain {
    public record Pair(String id, String person, String garment) { }
    public record Manifest(String assetRoot, String source, String license, String permittedUsage,
                           boolean consentRecorded, boolean synthetic, List<Pair> pairs) { }
    public record ValidatedPair(String id, byte[] person, String personMime, byte[] garment, String garmentMime) { }
    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().create();
    private BenchmarkMain() { }

    public static void main(String[] args) throws Exception {
        try {
            Map<String,String> options = new HashMap<>();
            for (int i=0;i<args.length;i+=2) {
                if (i+1>=args.length || !args[i].startsWith("--")) throw new IllegalArgumentException("Expected --option value arguments");
                options.put(args[i].substring(2),args[i+1]);
            }
            String mode = options.getOrDefault("mode","mock");
            if (!Set.of("mock","live").contains(mode)) throw new IllegalArgumentException("Mode must be mock or live");
            int count = Integer.parseInt(options.getOrDefault("pairs","3"));
            Path manifestPath = Path.of(options.getOrDefault("manifest","docs/evaluations/synthetic-manifest.json"));
            Path output = Path.of(options.getOrDefault("output","work/ai-benchmark"));
            BigDecimal maxUsd = new BigDecimal(options.getOrDefault("max-usd","0"));
            BigDecimal attemptBound = new BigDecimal(options.getOrDefault("attempt-bound-usd","0.10"));
            ImageProvider provider;
            String model;
            if (mode.equals("live")) {
                if (maxUsd.signum()<=0) throw new IllegalArgumentException("Live evaluation requires an explicit positive max-usd");
                var properties = new AiProperties(env("APP_AI_PROJECT",""),env("APP_AI_LOCATION","global"),env("APP_AI_MODEL","gemini-nano-banana-2.1"),120);
                provider = new GoogleImageProvider(properties); model = properties.model();
            } else { provider = new MockTryOnProvider(); model = "fixture-v1"; }
            var report = evaluate(manifestPath,output,count,mode,maxUsd,attemptBound,provider,model);
            System.out.println(JSON.toJson(report));
        } catch (IllegalArgumentException e) {
            System.err.println("Evaluation refused: " + e.getMessage());
            System.exit(2);
        }
    }

    public static JsonObject evaluate(Path manifestPath, Path output, int count, String mode,
                                      BigDecimal maxUsd, BigDecimal attemptBound, ImageProvider provider, String model) throws Exception {
        var pairs = validateManifest(manifestPath,count);
        if (attemptBound.signum()<=0) throw new IllegalArgumentException("Attempt bound must be positive");
        if (mode.equals("live") && attemptBound.multiply(BigDecimal.valueOf(count)).compareTo(maxUsd)>0)
            throw new IllegalArgumentException("Requested evaluation exceeds its maximum estimated spend; no requests sent");
        Files.createDirectories(output);
        var outcomes = new JsonArray();
        List<Long> durations = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        int successful = 0;
        var review = new StringBuilder("pairId,identityScore,garmentScore,drapeScore,severeArtifact,accepted,reviewer\n");
        for (var pair : pairs) {
            var row = new JsonObject(); row.addProperty("pairId",pair.id());
            long start = System.nanoTime();
            try {
                var result = provider.generate(new GenerationRequest(pair.person(),pair.personMime(),pair.garment(),pair.garmentMime()));
                String extension = result.mimeType().equals("image/png") ? ".png" : ".jpg";
                Files.write(output.resolve(pair.id()+extension),result.image(),StandardOpenOption.CREATE,StandardOpenOption.TRUNCATE_EXISTING);
                row.addProperty("outcome","SUCCEEDED"); row.addProperty("demo",result.demo()); row.addProperty("label",result.label());
                row.addProperty("estimatedCostUsd",result.estimatedCostUsd().toPlainString());
                total = total.add(result.estimatedCostUsd()); successful++;
                if (mode.equals("live") && result.estimatedCostUsd().compareTo(attemptBound)>0) {
                    row.addProperty("spendBoundWarning","Observed estimate exceeded reserved attempt bound; remaining calls stopped");
                }
            } catch (ProviderFailure failure) {
                row.addProperty("outcome",failure.kind().name());
                row.addProperty("message",failure.getMessage());
                if (mode.equals("live")) total=total.add(attemptBound); // conservative ambiguous/failed call accounting
            }
            long elapsed = (System.nanoTime()-start)/1_000_000;
            durations.add(elapsed); row.addProperty("elapsedMs",elapsed); outcomes.add(row);
            review.append(pair.id()).append(",,,,,,\n");
            if (row.has("spendBoundWarning") || (mode.equals("live") && total.add(attemptBound).compareTo(maxUsd)>0)) break;
        }
        Collections.sort(durations);
        var report = new JsonObject(); report.addProperty("createdAt",Instant.now().toString());
        report.addProperty("mode",mode); report.addProperty("provider",mode.equals("mock")?"mock":"google"); report.addProperty("model",model);
        report.addProperty("requestedPairs",count); report.addProperty("attemptedPairs",outcomes.size()); report.addProperty("successfulPairs",successful);
        report.addProperty("failedPairs",outcomes.size()-successful); report.addProperty("estimatedTotalUsd",total.toPlainString());
        report.addProperty("p50Ms",percentile(durations,.50)); report.addProperty("p95Ms",percentile(durations,.95));
        report.addProperty("qualityGate","HUMAN_REVIEW_PENDING"); report.addProperty("humanAcceptedResults",(String)null);
        report.addProperty("launchGatePassed",false); report.addProperty("requiredReviewedPairs",40);
        report.addProperty("note",mode.equals("mock")?"Demo fixtures do not measure live saree quality":"Human review required; success alone does not establish garment fidelity");
        report.add("pairs",outcomes);
        Files.writeString(output.resolve("report.json"),JSON.toJson(report));
        Files.writeString(output.resolve("review.csv"),review);
        return report;
    }

    public static List<ValidatedPair> validateManifest(Path manifestPath, int count) throws Exception {
        var manifest = JSON.fromJson(Files.readString(manifestPath),Manifest.class);
        if (manifest == null || !nonblank(manifest.source()) || !nonblank(manifest.license()) || !nonblank(manifest.permittedUsage()) || !manifest.consentRecorded())
            throw new IllegalArgumentException("Manifest requires recorded consent, source, licence and permitted usage");
        if (!nonblank(manifest.assetRoot()) || manifest.pairs()==null || count<1 || count>40 || count>manifest.pairs().size())
            throw new IllegalArgumentException("Requested pair count must be 1–40 and available in the manifest");
        Path base = manifestPath.toAbsolutePath().getParent().resolve(manifest.assetRoot()).toRealPath();
        Set<String> seen = new HashSet<>();
        for (Pair pair : manifest.pairs()) {
            if (pair==null || pair.id()==null || !pair.id().matches("[A-Za-z0-9_-]{1,64}") || !seen.add(pair.id()))
                throw new IllegalArgumentException("Pair IDs must be unique safe identifiers");
        }
        List<ValidatedPair> selected = new ArrayList<>();
        for (Pair pair : manifest.pairs().subList(0,count)) {
            var person = resolve(base,pair.person()); var garment = resolve(base,pair.garment());
            byte[] personBytes=readBounded(person), garmentBytes=readBounded(garment);
            String personMime=mime(person), garmentMime=mime(garment);
            ImageValidation.validate(personBytes,personMime); ImageValidation.validate(garmentBytes,garmentMime);
            selected.add(new ValidatedPair(pair.id(),personBytes,personMime,garmentBytes,garmentMime));
        }
        return selected;
    }
    private static Path resolve(Path base,String value) throws Exception {
        if (!nonblank(value)) throw new IllegalArgumentException("Input photo path is required");
        Path real=base.resolve(value).toRealPath();
        if (!real.startsWith(base) || !Files.isRegularFile(real)) throw new IllegalArgumentException("Input photo escapes the declared asset root");
        return real;
    }
    private static byte[] readBounded(Path file) throws Exception {
        if (Files.size(file)>10*1024*1024) throw new IllegalArgumentException("Input image exceeds 10 MB");
        return Files.readAllBytes(file);
    }
    private static String mime(Path p) {
        String name=p.getFileName().toString().toLowerCase();
        return name.endsWith(".png")?"image/png":name.endsWith(".jpg")||name.endsWith(".jpeg")?"image/jpeg":"unsupported";
    }
    private static boolean nonblank(String s) { return s!=null && !s.isBlank() && s.length()<=2000; }
    private static long percentile(List<Long> a,double p) { return a.isEmpty()?0:a.get(Math.min(a.size()-1,(int)Math.ceil(a.size()*p)-1)); }
    private static String env(String key,String fallback) { return System.getenv().getOrDefault(key,fallback); }
}
