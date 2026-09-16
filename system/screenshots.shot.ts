import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { FIXTURE_VAULT, STORED_BLOB, VAULT_PASSWORD, orderFor } from "./order";

/**
 * Draws the three vault screens the README shows, from the running app.
 *
 *   npm run screenshots
 *
 * Not a test, and deliberately not named like one: the default testMatch
 * skips `.shot.ts`, so `npm run test:system` never picks it up. It lives here
 * anyway because it needs exactly what the system tests need — both apps up,
 * the recorded basket, the glued channel — and a second copy of that setup
 * would be a second copy to keep true.
 *
 * The point is that the picture in the README cannot drift from the product.
 * A screenshot pasted in once is a claim nobody can re-check; this one is a
 * command, and it fails loudly if a screen it expects is not there.
 */
const OUT = "docs/img";

/** A phone, at the size the vault is actually used on. */
const PHONE = { width: 390, height: 844 };

async function shot(page: Page, name: string): Promise<Buffer> {
  const buffer = await page.screenshot({ scale: "device" });
  writeFileSync(`${OUT}/${name}.png`, buffer);
  return buffer;
}

test("the three vault screens", async ({ page, context }) => {
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize(PHONE);


  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ["pixstock.vault.v1", STORED_BLOB] as const,
  );
  await page.goto("/");
  await page.getByRole("heading", { name: "Point at the laptop" }).waitFor();

  // Only after the app is loaded, because offline means offline and the dev
  // server is on the network too. From here it is the state the product is
  // actually used in: `navigator.onLine` false, the header reading "Airplane
  // mode", no red banner telling the holder to turn the radios off. Not a
  // cosmetic edit — a screenshot taken with the radios on advertises the
  // warning instead of the guarantee. Everything after this point is local
  // anyway, which is the claim.
  await context.setOffline(true);
  await page.getByText("Airplane mode").first().waitFor();

  const waiting = await shot(page, "vault-1-waiting");

  const order = orderFor(FIXTURE_VAULT);
  await page.getByText("Glued channel").click();
  await page.locator("details.glued textarea").fill(order.frames.join("\n"));
  await page.getByRole("button", { name: "Feed frames" }).click();

  await page.getByText("Frames assembled").waitFor();
  await page.getByText("You receive").first().waitFor();
  // The ticket is longer than a phone; start it at the top, where it starts
  // for the holder, rather than wherever the last click left it.
  await page.evaluate(() => window.scrollTo(0, 0));
  const review = await shot(page, "vault-2-ticket");

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("heading", { name: "Confirm what you approved" }).waitFor();
  await page.getByLabel("Master password", { exact: true }).fill(VAULT_PASSWORD);
  await page.getByRole("button", { name: "Sign this order" }).click();

  await page.getByRole("heading", { name: "Hold this up to the webcam" }).waitFor({
    timeout: 20_000,
  });
  await page.locator("img.qr").waitFor();
  const reply = await shot(page, "vault-3-signature");

  // Composed in the browser rather than with an image library, for the same
  // reason the Open Graph card is: chromium is already here, and a strip is
  // three images in a row.
  const strip = [waiting, review, reply].map((b) => `data:image/png;base64,${b.toString("base64")}`);
  // Tall enough to hold a phone plus its padding: an element screenshot is
  // still clipped to the viewport.
  await page.setViewportSize({ width: 1266, height: PHONE.height + 48 });
  await page.setContent(`
    <style>
      body { margin: 0; background: #0b0b0c; display: flex; gap: 24px;
             padding: 24px; width: max-content; }
      img { width: 390px; height: 844px; border-radius: 18px; display: block; }
    </style>
    ${strip.map((src) => `<img src="${src}">`).join("")}
  `);
  const body = page.locator("body");
  writeFileSync(`${OUT}/vault-demo-loop.png`, await body.screenshot({ scale: "device" }));
});
