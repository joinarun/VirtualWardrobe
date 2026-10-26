import { request } from "@playwright/test";
import type { FullConfig, APIRequestContext } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
type Credential = { email: string; password: string };
const required = () =>
  process.env.TEST_FIXTURES_REQUIRED === "true" || process.env.CI === "true";
function readProtected(path: string): string {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw Error(
      "E2E credential inputs must be regular owner-only files (0600).",
    );
  return readFileSync(path, "utf8");
}
function credential(path: string): Credential {
  const value = JSON.parse(readProtected(path));
  if (
    typeof value.email !== "string" ||
    !value.email.includes("@") ||
    typeof value.password !== "string" ||
    value.password.length < 12
  )
    throw Error(
      "The protected E2E operator fixture has an invalid format. No account has been reset.",
    );
  return value;
}
function storeProtected(path: string, value: Credential) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}
async function mutate(client: APIRequestContext, path: string, body: unknown) {
  const csrf = await client.get("/api/v1/auth/csrf");
  if (!csrf.ok())
    throw Error(
      "E2E could not initialize session security. Run make dev and check local readiness.",
    );
  const security = await csrf.json();
  return client.post(`/api/v1${path}`, {
    data: body,
    headers: { [security.headerName]: security.token },
  });
}
export default async function setup(config: FullConfig) {
  const bootstrap = process.env.TEST_BOOTSTRAP_FILE,
    stateDirectory = process.env.TEST_STATE_DIRECTORY;
  if (!bootstrap || !stateDirectory) {
    if (required())
      throw Error(
        "Full E2E verification requires protected operator fixtures. Run make e2e (it bootstraps and mounts them); no tests were skipped and no account was reset.",
      );
    return;
  }
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const directory = lstatSync(stateDirectory);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (directory.mode & 0o077) !== 0
  )
    throw Error(
      "E2E state must be an owner-only directory (0700). Use make e2e.",
    );
  const state = join(stateDirectory, "admin-credential.json"),
    pending = join(stateDirectory, "admin-pending-credential.json");
  let initial: Credential;
  if (existsSync(state)) initial = credential(state);
  else {
    if (!existsSync(bootstrap))
      throw Error(
        "The bootstrap fixture is missing. Run make e2e or provide TEST_BOOTSTRAP_FILE. Existing unknown credentials are never reset.",
      );
    const text = readProtected(bootstrap),
      email = text.match(/^Email:\s*(.+)$/m)?.[1]?.trim(),
      password = text.match(/^Temporary password:\s*(.+)$/m)?.[1]?.trim();
    if (!email || !password)
      throw Error(
        "No usable bootstrap or current operator fixture was found. Supply the existing protected fixture, or use make e2e-clean for an isolated disposable database. No account was reset.",
      );
    initial = { email, password };
  }
  const savedPending = existsSync(pending) ? credential(pending) : null;
  if (savedPending && savedPending.email !== initial.email)
    throw Error(
      "Pending and current E2E operator identities differ. Review the protected fixture files; no account was changed.",
    );
  const client = await request.newContext({
    baseURL:
      process.env.BASE_URL ||
      (config.projects[0]?.use.baseURL as string) ||
      "http://localhost:5173",
    timeout: 30000,
  });
  let phase = "reading local configuration";
  try {
    const authResponse = await client.get("/api/v1/auth/config"),
      providerResponse = await client.get("/api/v1/try-on/config");
    if (!authResponse.ok() || !providerResponse.ok())
      throw Error(
        "E2E setup requires a ready local API with identity and try-on routes. Run make dev first.",
      );
    if (
      !authResponse.headers()["content-type"]?.includes("json") ||
      !providerResponse.headers()["content-type"]?.includes("json")
    )
      throw Error(
        "E2E configuration endpoints returned non-JSON. Check BASE_URL and the local Vite API proxy.",
      );
    const auth = await authResponse.json(),
      provider = await providerResponse.json();
    if (auth.captcha?.mode !== "LOCAL_TEST" || provider.mode !== "FIXTURE")
      throw Error(
        "The full E2E suite requires LOCAL_TEST CAPTCHA and FIXTURE generation. It refuses to exercise paid/live provider environments.",
      );
    let current = initial,
      user;
    for (const candidate of [
      initial,
      ...(savedPending ? [savedPending] : []),
    ]) {
      phase = "authenticating the protected operator";
      const response = await mutate(client, "/auth/login", {
        kind: "WORKFORCE",
        identifier: candidate.email,
        password: candidate.password,
      });
      if (response.ok()) {
        current = candidate;
        user = (await response.json()).user;
        break;
      }
      if (response.status() !== 401)
        throw Error(
          "E2E operator sign-in was rejected. Check local readiness and protected fixtures; no credential reset was attempted.",
        );
    }
    if (!user || !user.superAdmin || user.kind !== "WORKFORCE")
      throw Error(
        "Cannot authenticate the E2E operator. Supply its current owner-only fixture, or use make e2e-clean. Existing credentials are never reset to gain test access.",
      );
    if (user.passwordChangeRequired) {
      const next = savedPending || {
        email: current.email,
        password: `E2E-${randomBytes(32).toString("base64url")}-aA9`,
      };
      // Preserve the intended credential before the HTTP mutation, so an ambiguous response is recoverable without resetting an account.
      phase = "persisting the protected pending credential";
      storeProtected(pending, next);
      phase = "rotating the initial temporary credential";
      const changed = await mutate(client, "/auth/password", {
        currentPassword: current.password,
        newPassword: next.password,
      });
      if (!changed.ok())
        throw Error(
          "E2E temporary-password rotation did not complete. The protected pending fixture is retained for recovery; no reset was attempted.",
        );
      phase = "verifying the rotated session";
      const session = await client.get("/api/v1/auth/session");
      if (
        !session.ok() ||
        (await session.json()).user?.passwordChangeRequired !== false
      )
        throw Error(
          "E2E could not verify the rotated session. Protected pending credentials are retained; retry setup rather than resetting the account.",
        );
      current = next;
    }
    phase = "persisting the verified operator fixture";
    storeProtected(state, current);
    if (existsSync(pending)) unlinkSync(pending);
    phase = "closing the setup session";
    await mutate(client, "/auth/logout", {});
    console.log(
      "Protected E2E operator verified before parallel journeys; full local verification enabled.",
    );
  } catch (error) {
    if (
      (error instanceof Error && error.message.startsWith("E2E")) ||
      (error instanceof Error && error.message.startsWith("The full")) ||
      (error instanceof Error &&
        error.message.startsWith("Cannot authenticate"))
    )
      throw error;
    const category =
      error instanceof Error
        ? error.message.match(
            /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|Timeout/,
          )?.[0] || error.name
        : "unknown error";
    throw Error(
      `E2E setup failed while ${phase} (${category}). Run make dev, inspect local readiness, and preserve the protected fixtures. No credential reset was attempted.`,
    );
  } finally {
    await client.dispose();
  }
}
