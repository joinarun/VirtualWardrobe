import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
export default class RequiredJourneysReporter implements Reporter {
  private skipped: string[] = [];
  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === "skipped") this.skipped.push(test.title);
  }
  async onEnd(_result: FullResult) {
    if (
      (process.env.TEST_FIXTURES_REQUIRED === "true" ||
        process.env.CI === "true") &&
      this.skipped.length
    ) {
      console.error(
        `Full E2E verification requires every journey. Unexpected skips: ${this.skipped.join("; ")}. Run make e2e with the local fixture environment.`,
      );
      return { status: "failed" as const };
    }
  }
}
