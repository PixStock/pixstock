import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_VAULT, STORED_BLOB, VAULT_PASSWORD, orderFor } from "./order";

/**
 * Every control on the phone, measured rather than computed.
 *
 * 44px is the smallest thing a thumb hits reliably, and a signer that has to
 * be tapped twice at the wrong moment is a signer nobody trusts.
 *
 * Checkboxes are excluded and their labels measured instead: every one in the
 * vault is wrapped by its label, so the label is what a thumb lands on.
 */
const MIN = 44;

async function measure(page: Page, where: string) {
  const boxes = await page.evaluate(() => {
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, a, [role="button"], input:not([type="checkbox"]):not([type="hidden"]), summary, label.ack, label.gate',
    );
    return [...nodes]
      .filter((n) => n.offsetParent !== null || n.getClientRects().length > 0)
      .map((n) => {
        const r = n.getBoundingClientRect();
        return {
          tag: n.tagName.toLowerCase(),
          cls: n.className.toString().slice(0, 44),
          text: (n.textContent ?? "").trim().slice(0, 38),
          h: Math.round(r.height * 10) / 10,
        };
      })
      .filter((b) => b.h > 0);
  });

  const small = boxes.filter((b) => b.h < MIN);
  for (const b of small) {
    console.log(`  UNDER ${MIN}px on ${where}: <${b.tag} class="${b.cls}"> "${b.text}" — ${b.h}px`);
  }
  console.log(`  ${where}: ${boxes.length} controls, ${small.length} under ${MIN}px`);
  return small;
}

test("no control on the phone is under 44px", async ({ page }) => {
  const failures: string[] = [];
  const check = async (where: string) => {
    const small = await measure(page, where);
    for (const b of small) failures.push(`${where}: ${b.tag}.${b.cls} "${b.text}" ${b.h}px`);
  };

  // ── onboarding ──────────────────────────────────────────────────────
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await check("setup step 1");

  await page.getByLabel("Master password", { exact: true }).fill(VAULT_PASSWORD);
  await page.getByLabel("Confirm").fill(VAULT_PASSWORD);
  await page.getByRole("button", { name: "Create my vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Print this. It is the way back." }),
  ).toBeVisible({ timeout: 15_000 });
  await check("setup step 2");

  // ── the demo loop, on the vault the fixture order names ─────────────
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ["pixstock.vault.v1", STORED_BLOB] as const,
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Point at the laptop" })).toBeVisible();
  await check("scan");

  await page.getByText("Glued channel").click();
  await check("scan, glued channel open");

  await page.locator("details.glued textarea").fill(orderFor(FIXTURE_VAULT).frames.join("\n"));
  await page.getByRole("button", { name: "Feed frames" }).click();
  await expect(page.getByText("No signed price for this order")).toBeVisible();
  await check("review");

  await page.getByText("Order details, fees and one more note").click();
  await check("review, details open");

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("heading", { name: "Confirm what you approved" })).toBeVisible();
  await check("sign");

  await page.getByLabel("Master password", { exact: true }).fill(VAULT_PASSWORD);
  await page.getByRole("button", { name: "Sign this order" }).click();
  await expect(
    page.getByRole("heading", { name: "Hold this up to the webcam" }),
  ).toBeVisible({ timeout: 15_000 });
  await check("reply");

  await page.getByRole("button", { name: "The laptop has it — done" }).click();

  // ── settings, both rows open ────────────────────────────────────────
  await page.getByRole("button", { name: "Settings" }).click();
  await check("settings");
  await page.getByRole("button", { name: /Show my Paper-Vault/ }).click();
  await check("settings, paper open");
  await page.getByRole("button", { name: /Export to another wallet/ }).click();
  await check("settings, export open");
  await page.getByRole("button", { name: "Erase this vault" }).click();
  await check("settings, erase confirming");

  expect(failures, failures.join("\n")).toEqual([]);
});
