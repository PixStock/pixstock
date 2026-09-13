import { expect, test } from "@playwright/test";

const WEB = "http://localhost:3000";

/**
 * The public site, as a judge meets it.
 *
 * Chiefly: every route the navigation and the sitemap promise must exist. All
 * five once returned 404 while the build was green, because nothing checks an
 * href against a route.
 */
const ROUTES = ["/", "/trade", "/basket", "/vault", "/sign", "/protocol", "/legal"];

test.describe("the public site", () => {
  for (const route of ROUTES) {
    test(`${route} answers`, async ({ page }) => {
      const response = await page.goto(`${WEB}${route}`);
      expect(response?.status(), route).toBe(200);
    });
  }

  test("every internal link in the navigation and footer resolves", async ({ page, request }) => {
    await page.goto(`${WEB}/`);

    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href")!)
        .filter((href) => href.startsWith("/") && !href.startsWith("//")),
    );
    expect(hrefs.length).toBeGreaterThan(5);

    for (const href of new Set(hrefs)) {
      const path = href.split("#")[0] || "/";
      const response = await request.get(`${WEB}${path}`);
      expect(response.status(), `${href} is linked from the landing page`).toBe(200);
    }
  });

  test("the sitemap lists only pages that exist", async ({ request }) => {
    const body = await (await request.get(`${WEB}/sitemap.xml`)).text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      const path = new URL(url).pathname;
      expect((await request.get(`${WEB}${path}`)).status(), url).toBe(200);
    }
  });
});

test.describe("the optical channel on screen", () => {
  test("cycles QR frames and reports the real frame count", async ({ page }) => {
    await page.goto(`${WEB}/sign`);

    await expect(page.getByRole("heading", { name: "Send to vault" })).toBeVisible();
    // The measured three-leg basket: five frames at the default size.
    await expect(page.getByText(/5 frames/)).toBeVisible();
    await expect(page.getByRole("img", { name: /Order frame/ })).toBeVisible();

    // Polled rather than slept on: one fixed wait lands on the same frame
    // whenever the machine is busy enough to skip a cycle, and a test that
    // fails on a loaded runner teaches everyone to ignore it.
    const frame = page.getByRole("img", { name: /Order frame/ });
    const first = await frame.getAttribute("aria-label");
    await expect
      .poll(() => frame.getAttribute("aria-label"), {
        message: "the frames must keep cycling",
        timeout: 5_000,
      })
      .not.toBe(first);
  });

  test("changing the frame size changes the frame count", async ({ page }) => {
    await page.goto(`${WEB}/sign`);
    await page.getByRole("button", { name: /^S ·/ }).click();
    // 1330 bytes at 200 per frame.
    await expect(page.getByText(/7 frames/)).toBeVisible();
  });
});

test.describe("the protocol page", () => {
  test("reports each rule's state from the code, not from the copy", async ({ page }) => {
    // The table is generated from EVALUATED_RULES, so it cannot drift from
    // what the vault actually runs. Every rule is enforced today; if one ever
    // stops being, this page says so on its own.
    await page.goto(`${WEB}/protocol`);

    for (const rule of ["P1", "P6", "P8", "P11"]) {
      const row = page.locator("tr", { has: page.locator("code", { hasText: new RegExp(`^${rule}$`) }) });
      await expect(row, `${rule} must report its state`).toContainText("Enforced");
    }

    await expect(page.getByText(/Every rule in this table is evaluated/)).toBeVisible();
  });

  test("says the offline price guard is enforced, and names its limit", async ({ page }) => {
    await page.goto(`${WEB}/protocol`);
    await expect(page.getByText(/Built and enforced/)).toBeVisible();
    // The page must keep saying which feeds the grant does not cover. A
    // capability claimed more broadly than it is held is the one kind of
    // inaccuracy this product cannot afford.
    await expect(page.getByText(/grant currently covers/)).toBeVisible();
  });
});

test.describe("the basket builder", () => {
  test("computes per-leg amounts that add up", async ({ page }) => {
    await page.goto(`${WEB}/basket`);

    // The CDC preset: 40 / 30 / 30 of 500 USDC.
    await expect(page.getByText("200 USDC")).toBeVisible();
    await expect(page.getByText("150 USDC").first()).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
  });
});
