# Google image provider connectivity evidence

On 26 October 2026, one authorized synthetic connectivity request succeeded against `gemini-nano-banana-2.1`, location `global`, project `virtualtryon-511016`. Elapsed time was 32.39 seconds; recorded usage implies an estimated US$0.0403965 at the rates checked for the request. No personal photos were used. The input was the generated synthetic hero image supplied twice.

This is connectivity evidence only. It is not a person/saree fidelity test and does not pass the 40-pair launch gate. The initial saved smoke image did not retain intermediate-versus-final classification. The production adapter explicitly excludes thought=true parts and selects the final non-thought image; unit tests cover that boundary.

Run `make ai-benchmark MODE=mock PAIRS=3` for an offline fixture evaluation. It writes ignored `work/ai-benchmark/report.json`, images and `review.csv`. Every mock output is labelled Demo preview. The review gate remains `HUMAN_REVIEW_PENDING` and `launchGatePassed=false`.

For a live run, provide an explicit consent/provenance manifest and `GOOGLE_APPLICATION_CREDENTIALS` pointing to an authorized ADC file, plus `APP_AI_PROJECT` and `MAX_USD`. The repository does not contain credentials. The wrapper mounts the provided credential file read-only; it never creates service-account keys. One-attempt estimated reserve defaults to US$0.10. Update rates and the reserve when changing models/resolution. Each run remains subject to actual cloud billing; the conservative bound is an application guard, not a provider-enforced price cap.

Full launch requires40 consented pairs, independent human scores≥4/5 on identity, garment fidelity and believable drape for≥80%, no severe artifacts, and recorded refusals/timeouts. Human scoring must never be invented or inferred from request success. No additional paid request was made while implementing this feature.

Requests explicitly bound output to candidateCount=1, imageSize=1K PNG and maxOutputTokens=2048. Default usage estimates use Nano Banana 2.1 standard rates, conservatively charging all candidate output at the image rate. Set APP_AI_INPUT_USD_PER_MILLION, APP_AI_OUTPUT_USD_PER_MILLION and APP_AI_THOUGHT_USD_PER_MILLION after revalidating pricing whenever the configured model/rates change. Keep ATTEMPT_BOUND_USD consistent with those limits and current provider pricing.
