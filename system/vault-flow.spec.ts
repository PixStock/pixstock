import { expect, test, type Page } from "@playwright/test";
import {
  FIXTURE_VAULT,
  STORED_BLOB,
  VAULT_PASSWORD,
  orderFor,
  strangerVault,
  toBase58,
} from "./order";

const PASSWORD = VAULT_PASSWORD;

/** Creates a vault and returns its public key, read from the browser. */
async function createVault(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Master password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm").fill(PASSWORD);
  await page.getByRole("button", { name: "Create vault" }).click();

  await expect(page.getByRole("heading", { name: "Print this, now" })).toBeVisible({
    timeout: 15_000,
  });
  // The Paper-Vault must be shown before anything else can happen.
  await expect(page.locator("canvas.qr")).toBeVisible();

  // The public key sits at a fixed offset in the stored blob — see
  // packages/vault-crypto/src/blob.ts.
  const publicKey = await page.evaluate(() => {
    const stored = localStorage.getItem("pixstock.vault.v1")!;
    const bytes = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return Array.from(bytes.slice(87, 119));
  });

  await page.getByRole("button", { name: "I have printed it" }).click();
  return toBase58(publicKey);
}

/**
 * Plants the vault the recorded order was built for, as a restore would.
 *
 * Skips onboarding deliberately: onboarding has its own test, and this one is
 * about what happens to an order.
 */
async function installFixtureVault(page: Page) {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ["pixstock.vault.v1", STORED_BLOB] as const,
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Scan the order" })).toBeVisible();
}

/** Feeds frames through the glued channel — the same path as the camera. */
async function feed(page: Page, frames: string[]) {
  await page.getByText("Glued channel").click();
  await page.locator("details.glued textarea").fill(frames.join("\n"));
  await page.getByRole("button", { name: "Feed frames" }).click();
}

test.describe("the vault, end to end in a browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("creates a vault and shows the Paper-Vault before anything else", async ({ page }) => {
    const vault = await createVault(page);
    expect(vault).toHaveLength(44);
    await expect(page.getByRole("heading", { name: "Scan the order" })).toBeVisible();
  });

  test("reads an order, shows a ticket, and signs it", async ({ page }) => {
    await installFixtureVault(page);
    const order = orderFor(FIXTURE_VAULT);

    // ── scan ────────────────────────────────────────────────────────────
    await feed(page, order.frames);

    await expect(page.getByText("Order received.")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // ── review ──────────────────────────────────────────────────────────
    await expect(page.getByRole("heading", { name: "Check this order" })).toBeVisible();
    await expect(page.getByText("Frames assembled")).toBeVisible();
    await expect(page.getByText("Policy (9 rules)")).toBeVisible();

    // The order ticket: one line in and one out per leg.
    await expect(page.getByText("You pay").first()).toBeVisible();
    await expect(page.getByText("You receive").first()).toBeVisible();
    await expect(page.getByText("paid by the relayer")).toBeVisible();
    await expect(page.getByText("AAPLx")).toBeVisible();
    await expect(page.getByText("NVDAx")).toBeVisible();
    await expect(page.getByText("MSFTx")).toBeVisible();

    // The price cannot be checked yet, and the screen must say so.
    await expect(page.getByText("Price attestation not verified").first()).toBeVisible();

    // ── sign ────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("heading", { name: "Confirm and sign" })).toBeVisible();

    await page.getByLabel("Master password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign", exact: true }).click();

    // ── reply ───────────────────────────────────────────────────────────
    await expect(page.getByRole("heading", { name: "Show this to the webcam" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("canvas.qr")).toBeVisible();
    await expect(page.getByText(/Sixty-four bytes of signature/)).toBeVisible();
  });

  test("refuses an order addressed to another vault", async ({ page }) => {
    await installFixtureVault(page);
    const order = orderFor(strangerVault());

    await feed(page, order.frames);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("This order is for another vault")).toBeVisible();
    // And there is no way forward from here.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });

  test("refuses a wrong master password", async ({ page }) => {
    await installFixtureVault(page);

    await feed(page, orderFor(FIXTURE_VAULT).frames);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Approve" }).click();

    await page.getByLabel("Master password", { exact: true }).fill("definitely not it");
    await page.getByRole("button", { name: "Sign", exact: true }).click();

    await expect(page.getByText("wrong password")).toBeVisible({ timeout: 15_000 });
  });

  test("ignores frames that are not an order", async ({ page }) => {
    await installFixtureVault(page);
    await feed(page, ["hello there", "PS1:broken", ""]);

    await expect(page.getByText("Order received.")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Scan the order" })).toBeVisible();
  });

  test("says the device is online, because it is", async ({ page }) => {
    await installFixtureVault(page);
    // A browser on a dev server is not in airplane mode, and the vault must
    // say so rather than imply an air gap it does not have.
    await expect(page.getByText(/Turn on airplane mode before signing/)).toBeVisible();
  });
});
