import { lstatSync, readFileSync } from "node:fs";

export type DemoRole = "SUPER_ADMIN" | "STORE_ADMIN" | "STAFF" | "CUSTOMER";
export interface DemoUser {
  id: string;
  kind: "WORKFORCE" | "CUSTOMER";
  role: DemoRole;
  name: string;
  identifier: string;
  password: string;
  storeIds: string[];
  storeNames: string[];
  recoveryCodes: string[];
}
export interface DemoBundle {
  schemaVersion: 1;
  datasetId: string;
  users: DemoUser[];
}
export function demoFixture(): DemoBundle | null {
  const path = process.env.TEST_DEMO_CREDENTIALS_FILE;
  const required =
    process.env.TEST_FIXTURES_REQUIRED === "true" || process.env.CI === "true";
  if (!path) {
    if (!required) return null;
    throw Error(
      "Full E2E requires the generated protected demo credentials. Run make e2e; the standard runner seeds the owned demo and mounts its credential file. No account is reset.",
    );
  }
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
      throw Error("unsafe file");
    const bundle = JSON.parse(readFileSync(path, "utf8"));
    if (
      bundle.schemaVersion !== 1 ||
      typeof bundle.datasetId !== "string" ||
      !Array.isArray(bundle.users) ||
      bundle.users.some(
        (user: DemoUser) =>
          typeof user.id !== "string" ||
          !["WORKFORCE", "CUSTOMER"].includes(user.kind) ||
          typeof user.name !== "string" ||
          typeof user.identifier !== "string" ||
          typeof user.password !== "string" ||
          user.password.length < 12 ||
          !Array.isArray(user.storeIds) ||
          !Array.isArray(user.storeNames) ||
          !Array.isArray(user.recoveryCodes),
      ) ||
      ["SUPER_ADMIN", "STORE_ADMIN", "STAFF", "CUSTOMER"].some(
        (role) =>
          bundle.users.filter((user: DemoUser) => user.role === role).length <
          3,
      )
    )
      throw Error("invalid schema");
    return bundle;
  } catch {
    throw Error(
      "The protected demo credential file is missing, unsafe or invalid. Seed the standard owned dataset with make demo-seed and use make e2e. Preserve existing credentials; they are never reset to gain test access.",
    );
  }
}
