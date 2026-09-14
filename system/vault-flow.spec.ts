import { expect, test, type Page } from "@playwright/test";
import {
  FIXTURE_VAULT,
  PAPER_VAULT,
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
    // The screen opens with the outcome in words, before any figure.
    await expect(page.getByText("No signed price for this order")).toBeVisible();
    await expect(page.getByText("Frames assembled")).toBeVisible();
    await expect(page.getByText("Signing rules")).toBeVisible();
    await expect(page.locator(".checkrow", { hasText: "Signing rules" })).toContainText("12 / 12");

    // The amounts: one pay row and one receive block per leg.
    await expect(page.getByText("You pay").first()).toBeVisible();
    await expect(page.getByText("You receive").first()).toBeVisible();
    // Scoped to the receive blocks: each symbol also appears in the
    // disclosures below, and "is it on the ticket" is the question here.
    for (const symbol of ["AAPLx", "NVDAx", "MSFTx"]) {
      await expect(page.locator(".amount-get .sym", { hasText: symbol })).toHaveCount(1);
    }

    // The fee, and the slippage said in words, are folded away — true,
    // checkable, and not what the decision turns on.
    await page.getByText("Order details, fees and one more note").click();
    await expect(page.getByText("paid by the relayer, not you")).toBeVisible();
    await expect(page.getByText("Most you can lose to slippage")).toBeVisible();

    // No price travelled with this order — our Pyth grant does not cover
    // these three — so the vault says so and will not sign until the holder
    // says they accept it. Approve exists here, unlike on a refusal: this is
    // a decision the holder is allowed to make.
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();

    // Every amount is scaled by the mint's ScaledUiAmount multiplier, which
    // travelled with the order because an offline vault cannot read it. The
    // screen must show which one it applied and what the figure would read
    // without it — the difference reaches half a percent.
    for (const { multiplier } of order.expectedOut) {
      await expect(page.getByText(`×${multiplier} scale applied`).first()).toBeVisible();
    }
    await expect(page.getByText(/unscaled/).first()).toBeVisible();

    // And the issuer's reach, on the screen where the decision is made, in
    // the words a holder would use rather than in a base58 address.
    await expect(page.getByText(/without your signature/).first()).toBeVisible();

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

  test("shows its own address as a pairing code", async ({ page }) => {
    await installFixtureVault(page);
    await page.getByRole("button", { name: "Show my address" }).click();

    await expect(page.getByRole("heading", { name: "Show this to the laptop" })).toBeVisible();
    await expect(page.locator("canvas.qr")).toBeVisible();
    // The address in full, so it can be checked against the laptop by eye.
    await expect(page.getByText(FIXTURE_VAULT)).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("heading", { name: "Scan the order" })).toBeVisible();
  });

  test("lets the price tolerance be tightened, and only tightened", async ({ page }) => {
    await installFixtureVault(page);
    await page.getByRole("button", { name: "Settings" }).click();

    await expect(page.getByRole("heading", { name: "This vault", exact: true })).toBeVisible();
    await expect(page.getByText(FIXTURE_VAULT)).toBeVisible();

    // Two choices, and the looser of them is the built-in maximum: there is
    // no control here that widens what the vault will accept.
    const choices = await page.locator(".row button", { hasText: /%$/ }).allTextContents();
    expect(choices).toEqual(["0.5%", "1.0%"]);

    await page.getByRole("button", { name: "0.5%" }).click();
    const stored = await page.evaluate(() =>
      localStorage.getItem("pixstock.vault.settings.v1"),
    );
    expect(JSON.parse(stored!).maxDeviation).toBe(0.005);
  });

  test("erases the vault only after asking twice", async ({ page }) => {
    await installFixtureVault(page);
    await page.getByRole("button", { name: "Settings" }).click();

    await page.getByRole("button", { name: "Erase this vault" }).click();
    // Still there: the first click only asks.
    expect(await page.evaluate(() => localStorage.getItem("pixstock.vault.v1"))).not.toBeNull();

    await page.getByRole("button", { name: "Erase it. I have the paper." }).click();
    await expect(page.getByText(/gone from this phone/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("pixstock.vault.v1"))).toBeNull();
  });

  test("is installable on a phone", async ({ page }) => {
    // Not cosmetic: without a manifest naming real icons, Chrome on Android
    // never offers "add to home screen", and a signer that only exists as a
    // browser tab is not the product.
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href, "the vault must ship a web app manifest").toBeTruthy();

    const manifest = await (await page.request.get(href!)).json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(
      true,
    );

    for (const icon of manifest.icons) {
      const response = await page.request.get(`/${icon.src}`.replace(/^\/\//, "/"));
      expect(response.status(), `${icon.src} must exist`).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  });

  test("restores a vault from a printed Paper-Vault", async ({ page }) => {
    // The half that was missing: a sheet of paper and a password put the same
    // key back on a phone that has never seen it. Nothing is fetched to do
    // it — the sheet holds everything.
    await page.goto("/");
    await page.getByRole("button", { name: "Restore from Paper-Vault" }).click();

    await page.getByLabel("Paper-Vault code").fill(PAPER_VAULT.code);
    await page.getByLabel("Master password", { exact: true }).fill(PAPER_VAULT.password);
    await page.getByRole("button", { name: "Restore" }).click();

    await expect(page.getByRole("heading", { name: "Your vault is back" })).toBeVisible({
      timeout: 15_000,
    });

    // The restored key is the one on the sheet, byte for byte.
    const publicKey = await page.evaluate(() => {
      const stored = localStorage.getItem("pixstock.vault.v1")!;
      const bytes = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
      return Array.from(bytes.slice(87, 119));
    });
    expect(toBase58(publicKey)).toBe(PAPER_VAULT.publicKey);

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Scan the order" })).toBeVisible();
  });

  test("refuses a Paper-Vault opened with the wrong password", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Restore from Paper-Vault" }).click();

    await page.getByLabel("Paper-Vault code").fill(PAPER_VAULT.code);
    await page.getByLabel("Master password", { exact: true }).fill("not the password at all");
    await page.getByRole("button", { name: "Restore" }).click();

    await expect(page.getByText(/does not open this code/)).toBeVisible({ timeout: 15_000 });
    // And nothing was installed on the strength of a wrong guess.
    const stored = await page.evaluate(() => localStorage.getItem("pixstock.vault.v1"));
    expect(stored).toBeNull();
  });

  test("refuses an order whose price attestation is forged", async ({ page }) => {
    // A relayer that wants a green tick can attach anything it likes. What it
    // cannot do is produce Pyth's signature over it — and there is no
    // checkbox for this case, because the vault knows the answer.
    await installFixtureVault(page);
    await feed(page, orderFor(FIXTURE_VAULT, { attestation: "forged" }).frames);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("This phone will not sign")).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    // Absent, not disabled: a greyed-out control is an invitation to find the
    // way around it, and there is no way around this one.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject and go back" })).toBeVisible();
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
    await page.getByRole("checkbox").check();
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
