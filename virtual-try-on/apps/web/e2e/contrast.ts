import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
export async function assertTextContrast(page: Page) {
  const result = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .analyze();
  expect(
    result.violations.map((rule) => ({
      id: rule.id,
      nodes: rule.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  ).toEqual([]);
}
