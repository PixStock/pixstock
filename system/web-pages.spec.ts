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

test.describe("the landing page the app routes share a stylesheet with", () => {
  test("the closing band is still a band", async ({ page }) => {
    // The app routes' CTA button was called `.cta`, which is also the
    // landing page's closing section. A 54px pill height landed on a whole
    // <section> and squashed #try flat. The two apps share one stylesheet;
    // that makes every bare class name a shared namespace.
    await page.goto(`${WEB}/`);
    const band = page.locator("#try");
    await expect(band).toBeVisible();

    const box = await band.boundingBox();
    expect(box, "#try must have a box").not.toBeNull();
    expect(box!.height, "#try is a band, not a button").toBeGreaterThan(300);
    expect(box!.width, "#try spans the viewport").toBeGreaterThan(1000);

    // And it still carries its own heading and both calls to action.
    await expect(band.getByRole("heading")).toBeVisible();
    await expect(band.getByRole("link", { name: "Open the vault" })).toBeVisible();
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
    // The page must keep stating the limit on its own guarantee. A capability
    // claimed more broadly than it is held is the one kind of inaccuracy this
    // product cannot afford — and the limit moved once already, when the
    // coverage widened, so this asserts that one is named rather than which.
    await expect(page.getByText(/a grant rather than a right/)).toBeVisible();
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

  /**
   * The builder once allowed five legs while `CreateOrderDto` capped at four,
   * and with exactly five assets in the table the fifth was reachable: quote
   * every leg, press send, collect a 400. The interface has to hold the same
   * line the relayer does.
   */
  test("stops adding legs at the number the relayer accepts", async ({ page }) => {
    await page.goto(`${WEB}/basket`);

    const add = page.getByRole("button", { name: "Add a line" });
    for (let i = 0; i < 6 && (await add.isEnabled()); i++) {
      await add.click();
    }

    await expect(add).toBeDisabled();
    expect(await page.locator(".alloc-row").count()).toBeLessThanOrEqual(4);
  });
});

/**
 * The five asset cards, and the sentence under them, both say which feeds our
 * Pyth grant reaches. The sentence used to say "Tesla" in the JSX — three
 * lines under a comment explaining that a list written here goes stale the
 * first time the grant changes. It has to follow the relayer's answer, so the
 * relayer's answer is what this test changes.
 */
test.describe("which feeds carry a signed price", () => {
  const priceFor = (symbol: string, unavailable?: string) => ({
    symbol,
    price: 100,
    confidence: null,
    expo: -8,
    publisherCount: null,
    feedId: 1,
    session: "regular",
    publishTime: Date.now(),
    ...(unavailable ? { unavailable } : {}),
  });

  const serve = (page: import("@playwright/test").Page, prices: unknown[]) =>
    page.route("**/v1/prices*", (route) =>
      route.fulfill({ json: { prices, verifiedBy: "test" } }),
    );

  test("names the covered feeds rather than a list typed into the page", async ({ page }) => {
    await serve(page, [
      priceFor("TSLAx"),
      priceFor("AAPLx", "no grant accepts this feed"),
      priceFor("NVDAx", "no grant accepts this feed"),
      priceFor("MSFTx"),
      priceFor("SPYx", "no grant accepts this feed"),
    ]);
    await page.goto(`${WEB}/trade`);

    // Both covered names, and neither of the uncovered ones.
    await expect(page.getByText(/Our Pyth grant covers/)).toContainText("Tesla and Microsoft");
    await expect(page.getByText(/Our Pyth grant covers/)).not.toContainText("Apple");
  });

  test("says so plainly when the grant reaches nothing", async ({ page }) => {
    await serve(page, [priceFor("TSLAx", "no grant accepts this feed")]);
    await page.goto(`${WEB}/trade`);

    await expect(page.getByText(/No feed is signed right now/)).toBeVisible();
  });
});

/**
 * Pairing is the first thing anyone does and nothing works without it: with no
 * vault address, neither /trade nor /basket can build an order. For a while
 * the only way in was a webcam, which is the one part of this flow a machine
 * may simply not have.
 */
test.describe("pairing a vault", () => {
  test("takes a typed address, on a machine with no webcam", async ({ page }) => {
    const vault = "8ZqYQ7mKPfLmVm4Uu1kKXHkbXaqvYuQhzFHBBLPuKvnQ";

    await page.goto(`${WEB}/vault`);

    // Shut by default, because the camera is the ordinary path — but it must
    // be there, and it must say what it is for.
    await page.getByText(/No webcam on this machine/).click();
    await page.getByPlaceholder(/public key shown on your vault/).fill(vault);

    // Written to the same store the scanner writes to, so the two paths
    // cannot come to mean different things.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("pixstock.pairedVault")))
      .toBe(vault);
  });

  test("says so rather than remembering something that is not an address", async ({ page }) => {
    await page.goto(`${WEB}/vault`);

    await page.getByText(/No webcam on this machine/).click();
    await page.getByPlaceholder(/public key shown on your vault/).fill("not-an-address");

    await expect(page.getByText("That is not a Solana address.")).toBeVisible();
  });
});
