import { expect, test, type Page } from "@playwright/test";
import { fakeSupabase, sessionCookie } from "./fixtures";

const SIZES: [number, number][] = [
  [320, 568],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [844, 390],
];

interface PageCase {
  name: string;
  path: string;
  auth?: boolean;
  staff?: boolean;
  trackedStatus?: string;
  /** Where the wordmark should go. */
  logoHref: string;
  /** Text that proves the right page rendered. */
  text: RegExp;
}

const PAGES: PageCase[] = [
  {
    name: "sign in",
    path: "/account/login",
    logoHref: "https://www.truetodetail.co.uk",
    text: /Forgot your password/i,
  },
  {
    name: "create account",
    path: "/account/create?email=sam%40example.com",
    logoHref: "https://www.truetodetail.co.uk",
    text: /Create account/i,
  },
  {
    name: "forgot password",
    path: "/account/forgot",
    logoHref: "https://www.truetodetail.co.uk",
    text: /Send reset link/i,
  },
  {
    name: "tracking, on the way",
    path: "/account/track/tok_abcdef123456",
    logoHref: "https://www.truetodetail.co.uk",
    text: /\d+ min/i,
  },
  {
    name: "tracking, requested",
    path: "/account/track/tok_abcdef123456",
    trackedStatus: "requested",
    logoHref: "https://www.truetodetail.co.uk",
    text: /checking your slot/i,
  },
  {
    name: "customer dashboard",
    path: "/account",
    auth: true,
    logoHref: "/account",
    text: /Welcome/i,
  },
  {
    name: "customer booking",
    path: "/account/bookings/b1",
    auth: true,
    logoHref: "/account",
    text: /\d+ min|on the way/i,
  },
  {
    name: "customer details",
    path: "/account/details",
    auth: true,
    logoHref: "/account",
    text: /Your Details/i,
  },
  {
    name: "book a detail",
    path: "/book",
    auth: true,
    logoHref: "/account",
    text: /Book a detail/i,
  },
  {
    name: "admin today",
    path: "/admin",
    auth: true,
    staff: true,
    logoHref: "/admin",
    text: /Needs confirming/i,
  },
  {
    name: "admin request",
    path: "/admin/bookings/b2",
    auth: true,
    staff: true,
    logoHref: "/admin",
    text: /House number and street/i,
  },
  {
    name: "admin customer",
    path: "/admin/customers/c1",
    auth: true,
    staff: true,
    logoHref: "/admin",
    text: /Portal sign-in/i,
  },
  {
    name: "admin new booking",
    path: "/admin/bookings/new",
    auth: true,
    staff: true,
    logoHref: "/admin",
    text: /Create a booking/i,
  },
];

async function open(page: Page, c: PageCase, opts: { mustChange?: boolean } = {}) {
  const ctx = page.context();
  await fakeSupabase(ctx, {
    staff: c.staff,
    trackedStatus: c.trackedStatus,
    mustChangePassword: opts.mustChange,
  });
  if (c.auth) await ctx.addCookies([sessionCookie]);
  await page.goto(c.path, { waitUntil: "networkidle" });
}

for (const c of PAGES) {
  test.describe(c.name, () => {
    test("renders, wordmark goes home once, no sideways scroll at any size", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await open(page, c);
      await expect(page.getByText(c.text).first()).toBeVisible();

      const logos = page.locator('a[aria-label^="True To Detail"]');
      await expect(logos).toHaveCount(1);
      await expect(logos.first()).toHaveAttribute("href", c.logoHref);

      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(150);
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(over, `${c.name} overflows by ${over}px at ${w}x${h}`).toBeLessThanOrEqual(1);
      }
      expect(errors).toEqual([]);
    });
  });
}

test("a customer on a temporary password is held on the choose-your-password step", async ({
  page,
}) => {
  await open(
    page,
    { name: "dashboard", path: "/account", auth: true, logoHref: "/account", text: /x/ },
    { mustChange: true },
  );
  await expect(page).toHaveURL(/\/account\/welcome/);
  await expect(page.getByText(/temporary password/i).first()).toBeVisible();
  await page.goto("/account", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/account\/welcome/);
});

test("the password rules are shown as you type and stop a weak password", async ({ page }) => {
  await open(
    page,
    { name: "welcome", path: "/account/welcome", auth: true, logoHref: "/account", text: /x/ },
    { mustChange: true },
  );
  await page.fill("#new-password", "abc");
  await page.fill("#confirm-password", "abc");
  await page.getByRole("button", { name: /save and continue/i }).click();
  await expect(page.getByRole("alert")).toContainText(/needs/i);
});

test("the tracking page invites people without an account to create one, and not people who have one", async ({
  page,
}) => {
  const ctx = page.context();
  await fakeSupabase(ctx, { trackedStatus: "confirmed", hasAccount: false });
  await page.goto("/account/track/tok_abcdef123456", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /create your free account/i })).toBeVisible();

  const page2 = await ctx.newPage();
  await ctx.unroute(/\/(auth|rest|storage)\/v1\//);
  await fakeSupabase(ctx, { trackedStatus: "confirmed", hasAccount: true });
  await page2.goto("/account/track/tok_abcdef123456", { waitUntil: "networkidle" });
  await expect(page2.getByRole("link", { name: /create your free account/i })).toHaveCount(0);
  await expect(page2.getByRole("link", { name: /sign in to manage/i })).toBeVisible();
});

test("the admin queue lets staff confirm a website request", async ({ page }) => {
  await open(page, {
    name: "admin",
    path: "/admin",
    auth: true,
    staff: true,
    logoHref: "/admin",
    text: /x/,
  });
  const card = page.locator("article", { hasText: "TTD-11112222" });
  await expect(card.getByRole("button", { name: /confirm/i })).toBeVisible();
});

test("the booking popup asks for the vehicle size with the UK guide", async ({ page }) => {
  await fakeSupabase(page.context());
  await page.goto("/account/login?mode=register", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /book a detail/i }).click();
  const group = page.getByRole("radiogroup", { name: /vehicle size/i });
  await expect(group).toContainText("Hatchbacks and coupes");
  await expect(group).toContainText("Saloons and estates");
  await expect(group).toContainText("SUVs, 4x4s and people carriers");
  await expect(page.locator("body")).not.toContainText(/sedan/i);
});

test("the signed-in booking flow has the website's three steps", async ({ page }) => {
  await open(page, { name: "book", path: "/book", auth: true, logoHref: "/account", text: /x/ });
  await expect(page.getByRole("heading", { name: /vehicle and package/i })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: /vehicle size/i })).toContainText(
    "Saloons and estates",
  );
  await page
    .getByRole("radio", { name: /full valet/i })
    .first()
    .click();
  await page.getByRole("button", { name: /next: when and where/i }).click();
  await expect(page.getByRole("heading", { name: /when and where/i })).toBeVisible();
  await expect(page.getByText(/enter the postcode/i)).toBeVisible();
  // Back returns to step one with choices kept.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: /vehicle and package/i })).toBeVisible();
});

async function fillCreate(page: Page, email: string) {
  await page.goto("/account/create", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.fill("#first-name", "Sam");
  await page.fill("#email", email);
  await page.fill("#new-password", "Correct-Horse-9");
  await page.fill("#confirm-password", "Correct-Horse-9");
  await page.getByRole("button", { name: /create account/i }).click();
}

test("registering with an email that already has an account says so and offers sign in", async ({
  page,
}) => {
  await fakeSupabase(page.context());
  await fillCreate(page, "exists@example.com");
  await expect(page.getByRole("heading", { name: /already have an account/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveAttribute(
    "href",
    /email=exists%40example\.com/,
  );
  await expect(page.getByRole("link", { name: /forgot my password/i })).toBeVisible();
});

test("a new registration says to check email and lets them send it again", async ({ page }) => {
  await fakeSupabase(page.context());
  await fillCreate(page, "new@example.com");
  await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  await page.getByRole("button", { name: /send the email again/i }).click();
  await expect(page.getByText(/sent again/i)).toBeVisible();
});

test("the confirmation link lands on a verified page that leads to sign in, and handles an expired link", async ({
  page,
}) => {
  await fakeSupabase(page.context());
  await page.goto("/account/verified", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /email verified/i })).toBeVisible();
  await expect(page.getByText(/sign in to continue/i)).toBeVisible();
  // A fresh page load, as a person clicking an expired link gets.
  const expired = await page.context().newPage();
  await expired.goto("/account/verified#error=access_denied&error_code=otp_expired", {
    waitUntil: "networkidle",
  });
  await expect(expired.getByRole("heading", { name: /link has expired/i })).toBeVisible();
});

test("sign in and forgot password are prefilled from the link", async ({ page }) => {
  await fakeSupabase(page.context());
  await page.goto("/account/login?email=sam%40example.com", { waitUntil: "networkidle" });
  await expect(page.locator("#email")).toHaveValue("sam@example.com");
  await page.goto("/account/forgot?email=sam%40example.com", { waitUntil: "networkidle" });
  await expect(page.locator("#email")).toHaveValue("sam@example.com");
});

test("settings hold the password, help and sign out, appearance is a header toggle, and no page footer shows the company phone number", async ({
  page,
}) => {
  await open(page, {
    name: "settings",
    path: "/account/settings",
    auth: true,
    logoHref: "/account",
    text: /x/,
  });
  await expect(page.getByText("Password", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i }).first()).toBeVisible();
  // Appearance is one tap in the header, not a setting to hunt for.
  await expect(page.getByText("Appearance")).toHaveCount(0);
  const toggle = page.getByRole("button", { name: /switch to dark mode/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.setViewportSize({ width: 1440, height: 900 });
  const footer = page.locator("footer");
  await expect(footer).toContainText("truetodetail.co.uk");
  await expect(footer).not.toContainText(/07359|591800/);
});

test("the header has a settings gear and a sign out button, and the tab bar has settings on phones", async ({
  page,
}) => {
  await open(page, { name: "dash", path: "/account", auth: true, logoHref: "/account", text: /x/ });
  await expect(page.getByRole("link", { name: "Settings", exact: true }).first()).toBeVisible();
  const header = page.locator("header");
  await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.locator("nav[aria-label='Quick links']").getByText("Settings")).toBeVisible();
});

for (const area of [
  { name: "customer", path: "/account/settings", staff: false },
  { name: "staff", path: "/admin/settings", staff: true },
]) {
  test(`${area.name} settings: the password change checks the current password and gives clear answers`, async ({
    page,
  }) => {
    await fakeSupabase(page.context(), { staff: area.staff });
    await page.context().addCookies([sessionCookie]);
    await page.goto(area.path, { waitUntil: "networkidle" });
    const fill = async (current: string, next: string) => {
      await page.fill("#current-password", current);
      await page.fill("#new-password", next);
      await page.fill("#confirm-password", next);
      await page.getByRole("button", { name: /update password/i }).click();
    };
    await fill("Wrong-Pass-1", "Brand-New-Pass-7");
    await expect(page.getByRole("alert")).toContainText(/current password is not right/i);
    await fill("Old-Pass-1", "Reused-Pass-1");
    await expect(page.getByRole("alert")).toContainText(/not used before/i);
    await fill("Old-Pass-1", "Brand-New-Pass-7");
    await expect(page.getByText("Password updated")).toBeVisible();
    await expect(page.locator("#current-password")).toHaveValue("");
  });
}

test("the sign out button is in the header of the customer and staff portals, on desktop and phone", async ({
  page,
}) => {
  for (const [path, staff] of [
    ["/account", false],
    ["/admin", true],
  ] as const) {
    await fakeSupabase(page.context(), { staff });
    await page.context().addCookies([sessionCookie]);
    for (const w of [1280, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("header").getByRole("button", { name: "Sign out" })).toBeVisible();
    }
  }
});

test("tracking, on the way: route distance, journey log, alerts, calendar and share", async ({
  page,
}) => {
  await fakeSupabase(page.context(), { trackedStatus: "en_route" });
  await page.goto("/account/track/tok_abcdef123456", { waitUntil: "networkidle" });
  await expect(page.getByText(/Your visit so far/i)).toBeVisible();
  await expect(page.getByText(/Jamie set off/i)).toBeVisible();
  await expect(page.getByText(/Before we arrive/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Google/ })).toHaveAttribute(
    "href",
    /calendar\.google\.com.*action=TEMPLATE/,
  );
  await expect(page.getByRole("button", { name: /Apple \/ Outlook/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share this page/ })).toBeVisible();
  await expect(page).toHaveTitle(/min away|on the way/i);
});

test("tracking, detailing: finish estimate and checklist progress", async ({ page }) => {
  await fakeSupabase(page.context(), { trackedStatus: "in_progress" });
  await page.goto("/account/track/tok_abcdef123456", { waitUntil: "networkidle" });
  await expect(page.getByText(/Done by|Nearly there/)).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /Detailing progress/ })).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await expect(page.getByText(/1 of 4 steps done/)).toBeVisible();
});

test("tracking, finished: thank you, time on site and a way to book again", async ({ page }) => {
  await fakeSupabase(page.context(), { trackedStatus: "completed" });
  await page.goto("/account/track/tok_abcdef123456", { waitUntil: "networkidle" });
  await expect(page.getByText(/Enjoy the finish, Sam/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Book again/ })).toHaveAttribute("href", "/book");
  await expect(page.getByText(/Detailing started/)).toBeVisible();
});

test("the public login page toggles between sign in and register, and register points to booking", async ({
  page,
}) => {
  await fakeSupabase(page.context());
  await page.goto("/account/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#password")).toBeVisible();
  await page.getByRole("tab", { name: "Register" }).click();
  await expect(
    page.getByRole("heading", { name: /book a detail, and your account is ready/i }),
  ).toBeVisible();
  await expect(page.locator("#password")).toBeHidden();
  await expect(page.getByRole("link", { name: /create one/i })).toHaveAttribute(
    "href",
    /account\/create/,
  );
  await page.getByRole("button", { name: "Book a detail" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Sign in" }).click();
  await expect(page.locator("#password")).toBeVisible();
  await page.goto("/account/login?mode=register", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await expect(page.getByRole("tab", { name: "Register" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("switching between sign in and register keeps the main button and the legal links in place", async ({
  page,
}) => {
  await fakeSupabase(page.context());
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/account/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const y = async (loc: ReturnType<Page["locator"]>) => Math.round((await loc.boundingBox())!.y);
    const legal = page.getByRole("link", { name: /^terms/i }).first();
    const signIn = await y(page.getByRole("button", { name: "Sign in", exact: true }).last());
    const legalSignIn = await y(legal);
    await page.getByRole("tab", { name: "Register" }).click();
    await page.waitForTimeout(400);
    expect(await y(page.getByRole("button", { name: "Book a detail" }))).toBe(signIn);
    expect(await y(legal)).toBe(legalSignIn);
  }
});

test("the staff sign in has no register option", async ({ page }) => {
  await fakeSupabase(page.context());
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByText(/register|create an account|sign up/i)).toHaveCount(0);
});

/** Distance from the top of the viewport to the top of an element, or null when it is not on screen. */
async function topOf(page: Page, locator: ReturnType<Page["locator"]>) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom < 0 || r.top > window.innerHeight ? null : Math.round(r.top);
  });
}

for (const [label, size] of [
  ["phone", { width: 390, height: 700 }],
  ["desktop", { width: 1280, height: 720 }],
] as const) {
  test(`${label}: the booking popup guides to the next part after each choice`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await fakeSupabase(page.context());
    await page.goto("/account/login?mode=register", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Book a detail" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Step 1: size, then package, then add-ons come into view without scrolling by hand.
    await dialog.getByRole("radio").nth(1).click();
    await page.waitForTimeout(900);
    const pack = dialog.getByText("Choose your package");
    expect(
      await topOf(page, pack),
      "package section is in view after picking a size",
    ).not.toBeNull();
    await dialog
      .getByRole("button", { name: /full valet/i })
      .first()
      .click();
    await page.waitForTimeout(900);
    const extras = dialog.getByText("Optional extras");
    expect(await topOf(page, extras), "add-ons are in view after picking a package").not.toBeNull();
    if (size.width < 500) {
      expect((await topOf(page, extras))!, "add-ons were scrolled up to the top area").toBeLessThan(
        400,
      );
    }

    // Step 2: date, then time, then location.
    await dialog
      .getByRole("button", { name: /next: schedule|next/i })
      .first()
      .click();
    await dialog.locator('input[type="date"]').fill("2030-01-15");
    await page.waitForTimeout(900);
    const slot = dialog.getByRole("button", { name: "10:00 AM", exact: true });
    expect(await topOf(page, slot), "time slots are in view after the date").not.toBeNull();
    await slot.click();
    await page.waitForTimeout(900);
    const postcode = dialog.getByPlaceholder("Enter your postcode");
    expect(await topOf(page, postcode), "postcode is in view after the time").not.toBeNull();
    if (size.width < 500) {
      expect((await topOf(page, postcode))!).toBeLessThan(450);
    }
  });
}

test("phone: the signed-in booking page guides from vehicle to size to package", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await fakeSupabase(page.context());
  await page.context().addCookies([sessionCookie]);
  await page.goto("/book", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /vehicle and package/i }).waitFor();
  await page.locator("button", { hasText: "AB12CDE" }).first().click();
  await page.waitForTimeout(900);
  const size = page.getByText(/Vehicle size$/).first();
  expect(await topOf(page, size)).not.toBeNull();
  await page.getByRole("radio").nth(2).click();
  await page.waitForTimeout(900);
  const pack = page.getByText(/Package$/).first();
  expect(await topOf(page, pack), "package heading in view after picking a size").not.toBeNull();
  expect((await topOf(page, pack))!).toBeLessThan(300);
  await page
    .getByRole("radio", { name: /full valet/i })
    .first()
    .click();
  await page.waitForTimeout(900);
  const addons = page.getByText(/Add-ons \(optional\)/);
  // In the upper part of the screen, not left at the bottom edge.
  expect((await topOf(page, addons))!).toBeLessThan(490);
});

test("phone: the staff tab bar stays on one row and booking titles are not cut off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await fakeSupabase(page.context(), { staff: true });
  await page.context().addCookies([sessionCookie]);
  await page.goto("/admin", { waitUntil: "networkidle" });
  const tops = await page
    .locator("nav[aria-label='Quick links'] a")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops).toHaveLength(5);
  expect(new Set(tops).size, "all five tabs share one row").toBe(1);
  const cut = await page
    .locator("article p.font-display")
    .evaluateAll(
      (els) =>
        els.filter(
          (e) =>
            e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === "ellipsis",
        ).length,
    );
  expect(cut, "no booking title is truncated").toBe(0);
});

test("phone: the detailer sees where and what on each job, and the job page is one card of plain rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeSupabase(page.context());
  await page.goto("/d/tok-jamie", { waitUntil: "networkidle" });
  await expect(page.getByText("Hemel Hempstead, HP2 6EL").first()).toBeVisible();
  await expect(page.getByText("Full Valet Car Detail").first()).toBeVisible();
  await page.goto("/d/tok-jamie/b1", { waitUntil: "networkidle" });
  await expect(page.getByText("12 Acacia Road, HP2 6EL")).toBeVisible();
  await expect(page.getByRole("link", { name: /start navigation/i })).toBeVisible();
  await expect(page.getByText(/gate code 1234/)).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over).toBeLessThanOrEqual(1);
});

const CUSTOMER_UID = "22222222-2222-4222-8222-222222222222";

async function rewardsPage(
  page: Page,
  o: { extra: number; seen?: number; reduce?: boolean; width?: number },
) {
  await page.setViewportSize({ width: o.width ?? 1280, height: 900 });
  if (o.reduce) await page.emulateMedia({ reducedMotion: "reduce" });
  await fakeSupabase(page.context(), { extraCompleted: o.extra });
  await page.context().addCookies([sessionCookie]);
  if (o.seen !== undefined) {
    await page.context().addInitScript(
      // Seed the "last seen" count only the first time, as a real earlier visit would have.
      ([k, v]) => {
        if (localStorage.getItem(k!) === null) localStorage.setItem(k!, v!);
      },
      [`ttd_rewards_seen:${CUSTOMER_UID}`, String(o.seen)],
    );
  }
  await page.goto("/account", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
}

test("rewards: the car is finished one real visit at a time and each column says which visit it is", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByRole("img", { name: "3 of 7 qualifying visits" })).toBeVisible();
  await expect(card.getByText("4 MORE VISITS")).toBeVisible();
  await expect(card.getByRole("listitem")).toHaveCount(7);
  await card.getByRole("button", { name: /^Visit 2, completed/ }).click();
  await expect(
    card.getByText(/^Visit 2: Full Valet Car Detail, \d{1,2} \w{3} \d{4}$/),
  ).toBeVisible();
  await card.getByRole("button", { name: "Visit 4, next" }).click();
  await expect(card.getByText(/Visit 4 is next/)).toBeVisible();
  await card.getByRole("button", { name: "Visit 6, not yet completed" }).click();
  await expect(card.getByText("Visit 6 is 3 visits away.")).toBeVisible();
  // First look on a device never celebrates.
  await expect(card.getByRole("status")).toHaveCount(0);
});

test("rewards: a newly counted visit gets an earned moment once, then not again", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2, seen: 2 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("New visit counted. That is visit 3 of 7.")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(card.getByText(/New visit counted/)).toHaveCount(0);
});

test("rewards: reaching the goal is a milestone", async ({ page }) => {
  await rewardsPage(page, { extra: 6, seen: 6 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("Milestone reached").first()).toBeVisible();
  await expect(card.getByText("YOU ARE THERE")).toBeVisible();
  await expect(card.getByText("That is visit 7. Milestone reached.")).toBeVisible();
});

test("rewards: a phone shows all seven visits without sideways scroll", async ({ page }) => {
  await rewardsPage(page, { extra: 2, width: 360 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByRole("listitem")).toHaveCount(7);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over).toBeLessThanOrEqual(1);
});

test("rewards: the visit rail names the counted visit each booking is, and choosing a visit in the hero lights its row", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2, width: 1280 });
  const rail = page.getByRole("region", { name: "Your visits" });
  await expect(rail.getByText("Visit 3")).toBeVisible();
  await expect(rail.getByText("Visit 1")).toBeVisible();
  const hero = page.getByRole("region", { name: "TTD Rewards" });
  await hero.getByRole("button", { name: /^Visit 2,/ }).click();
  await expect(rail.locator('a[aria-current="true"]')).toContainText("Visit 2");
});

test("rewards: with reduced motion the surface is a still poster at the right level and all the numbers are there", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 6, seen: 6, reduce: true });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("YOU ARE THERE")).toBeVisible();
  const stage = page.locator("[data-stage]").first();
  await expect(stage).toHaveAttribute("data-stage", "fallback");
  await expect(stage).toHaveAttribute("data-reason", "reduced-motion");
  await expect(stage.locator("img").first()).toHaveAttribute("src", /f100-/);
});

test("surface: normally it goes live, and the poster is the level's own frame until then", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2, seen: 3, width: 1280 });
  const stage = page.locator("[data-stage]").first();
  await expect(stage).toHaveAttribute("data-stage", "live");
  await expect(stage.locator("canvas")).toHaveCount(1);
  await expect(stage.locator("source").first()).toHaveAttribute("srcset", /f43-wide/);
  await expect(stage.locator("img").first()).toHaveAttribute("src", /f43-narrow/);
});

test("surface: with WebGL unavailable the page falls back to the poster and nothing is lost", async ({
  page,
}) => {
  await page.context().addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await rewardsPage(page, { extra: 2, seen: 3, width: 390 });
  const stage = page.locator("[data-stage]").first();
  await expect(stage).toHaveAttribute("data-stage", "fallback");
  await expect(stage).toHaveAttribute("data-reason", "no-webgl");
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("4 MORE VISITS")).toBeVisible();
  await card.getByRole("button", { name: /^Visit 2,/ }).click();
  await expect(card.getByText(/^Visit 2: Full Valet Car Detail/)).toBeVisible();
});

test("surface: a slow poster never holds the page back", async ({ page }) => {
  await page.context().route(/\/finish\/.*\.webp/, async (r) => {
    await new Promise((res) => setTimeout(res, 4000));
    await r.continue();
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await fakeSupabase(page.context(), { extraCompleted: 2 });
  await page.context().addCookies([sessionCookie]);
  const started = Date.now();
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("4 MORE VISITS")).toBeVisible({ timeout: 3500 });
  expect(Date.now() - started).toBeLessThan(3600);
});

test("surface: the inspection torch really changes the paint, and stays off with reduced motion", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2, seen: 3, width: 1280 });
  const stage = page.locator("[data-stage]").first();
  await expect(stage).toHaveAttribute("data-stage", "live");
  const box = (await stage.boundingBox())!;
  const clip = { x: box.x, y: box.y + 110, width: box.width, height: 150 };
  const before = await page.screenshot({ clip });
  await page.mouse.move(box.x + box.width * 0.75, box.y + 200, { steps: 6 });
  await expect(stage).toHaveAttribute("data-torch", "on");
  await page.waitForTimeout(700);
  const during = await page.screenshot({ clip });
  expect(before.equals(during)).toBe(false);
  await page.mouse.move(2, 2);
  await expect(stage).not.toHaveAttribute("data-torch", "on");

  await rewardsPage(page, { extra: 2, seen: 3, width: 1280, reduce: true });
  const still = page.locator("[data-stage]").first();
  const b2 = (await still.boundingBox())!;
  await page.mouse.move(b2.x + b2.width * 0.75, b2.y + 200, { steps: 6 });
  await expect(still).not.toHaveAttribute("data-torch", "on");
});

test("live job: the surface shows the detailer's real stage ticks and what is happening now", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fakeSupabase(page.context(), { bookingStatus: "in_progress", stagesDone: 2 });
  await page.context().addCookies([sessionCookie]);
  await page.goto("/account/bookings/b1", { waitUntil: "networkidle" });
  const hero = page.getByRole("region", { name: "Job progress" });
  await expect(hero.getByText("Now: Protection and finish. 2 of 4 steps done.")).toBeVisible();
  const steps = hero.getByRole("list", { name: "Detailing steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(4);
  await expect(hero.locator("[data-stage]")).toHaveCount(0);
  await expect(page.locator("[data-stage]").first().locator("img").first()).toHaveAttribute(
    "src",
    /f50-/,
  );
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over).toBeLessThanOrEqual(1);
});

test("live job: a finished visit says which visit it was and links to the finish", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fakeSupabase(page.context(), { extraCompleted: 2 });
  await page.context().addCookies([sessionCookie]);
  await page.goto("/account/bookings/b4", { waitUntil: "networkidle" });
  const hero = page.getByRole("region", { name: "Job progress" });
  await expect(hero.getByText(/That is visit 3 of 7\./)).toBeVisible();
  await hero.getByRole("link", { name: /see your finish/i }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("live job: on the way shows the live arrival estimate in the hero", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeSupabase(page.context());
  await page.context().addCookies([sessionCookie]);
  await page.goto("/account/bookings/b1", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("region", { name: "Job progress" }).getByText(/MIN\s*AWAY/i),
  ).toBeVisible();
});

test("admin: the tiles are one-tap filters, rows open the job from anywhere on them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeSupabase(page.context(), { staff: true });
  await page.context().addCookies([sessionCookie]);
  await page.goto("/admin", { waitUntil: "networkidle" });
  const tile = page.getByRole("button", { name: /^Needs confirming: 1/ });
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: /Open TTD-9A3E7220/ })).toHaveCount(0);
  await expect(page.locator("article", { hasText: "TTD-11112222" })).toBeVisible();
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  const row = page.getByRole("link", { name: /Open TTD-9A3E7220/ });
  await expect(row).toBeVisible();
  // Dense: a row is a fraction of the old card.
  expect((await row.boundingBox())!.height).toBeLessThan(150);
  await page.getByRole("button", { name: /^Active now: 1/ }).click();
  await expect(page.getByRole("link", { name: /Open TTD-33334444/ })).toHaveCount(0);
});

test("admin: at a desktop width no row is squashed, cut off or overlapping", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeSupabase(page.context(), { staff: true });
  await page.context().addCookies([sessionCookie]);
  await page.goto("/admin", { waitUntil: "networkidle" });
  const cut = await page
    .locator("article p.font-display, article a span")
    .evaluateAll(
      (els) =>
        els.filter(
          (e) =>
            e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === "ellipsis",
        ).length,
    );
  expect(cut, "nothing in a row is cut off").toBe(0);
  const rows = page.getByRole("link", { name: /^Open TTD-/ });
  for (const row of await rows.all()) {
    const boxes = await row
      .locator("span.inline-flex, p, span.font-medium")
      .evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0),
      );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap =
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
        // Nested elements legitimately overlap their parents; two siblings must not.
        const nested =
          (a.left <= b.left + 1 &&
            a.right >= b.right - 1 &&
            a.top <= b.top + 1 &&
            a.bottom >= b.bottom - 1) ||
          (b.left <= a.left + 1 &&
            b.right >= a.right - 1 &&
            b.top <= a.top + 1 &&
            b.bottom >= a.bottom - 1);
        expect(overlap && !nested, "two pieces of a row overlap").toBe(false);
      }
  }
});

test("detailer: the queue marks the live job, and each stage row is a full tap target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeSupabase(page.context(), { bookingStatus: "in_progress" });
  await page.goto("/d/tok-jamie", { waitUntil: "networkidle" });
  await expect(page.getByText("Continue job")).toHaveCount(1);
  await expect(page.getByText("Open job")).toHaveCount(1);
  await page.goto("/d/tok-jamie/b1", { waitUntil: "networkidle" });
  for (const name of [/Interior clean/, /Protection and finish/]) {
    const row = page.getByRole("button", { name });
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over).toBeLessThanOrEqual(1);
});

test("the sign in and register switch is a round pill with a thumb that slides", async ({
  page,
}) => {
  await page.goto("/account/login", { waitUntil: "networkidle" });
  const tabs = page.getByRole("tablist", { name: /sign in or register/i });
  const radius = await tabs.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(radius).toBeGreaterThan(20);
  const thumb = tabs.locator("span[aria-hidden]").first();
  const x0 = (await thumb.boundingBox())!.x;
  await page.getByRole("tab", { name: "Register" }).click();
  await page.waitForTimeout(450);
  expect((await thumb.boundingBox())!.x).toBeGreaterThan(x0 + 50);
});

test("garage: each car is its plate with its real history, and removing asks first", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fakeSupabase(page.context(), { extraCompleted: 2 });
  await page.context().addCookies([sessionCookie]);
  await page.goto("/account/vehicles", { waitUntil: "networkidle" });
  await expect(page.getByText(/3 details with us/)).toBeVisible();
  await page.getByRole("button", { name: "Remove vehicle" }).click();
  await expect(page.getByText("Remove this car?")).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByText("Remove this car?")).toHaveCount(0);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over).toBeLessThanOrEqual(1);
});

test("rewards: every visit column is a full 44px tap target, at 360 and at 320", async ({
  page,
}) => {
  for (const width of [360, 320]) {
    await rewardsPage(page, { extra: 2, width });
    const card = page.getByRole("region", { name: "TTD Rewards" });
    for (const b of await card.getByRole("button", { name: /^Visit \d/ }).all()) {
      const box = (await b.boundingBox())!;
      expect(box.height, `column height at ${width}`).toBeGreaterThanOrEqual(44);
      expect(box.width, `column width at ${width}`).toBeGreaterThanOrEqual(44);
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  }
});

test("rewards: the keyboard reaches each visit in order and the choice is announced", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2, width: 1280 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await card.getByRole("button", { name: /^Visit 1,/ }).focus();
  await page.keyboard.press("Tab");
  await expect(card.getByRole("button", { name: /^Visit 2,/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card.getByRole("button", { name: /^Visit 2,/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card.getByText(/^Visit 2: Full Valet Car Detail/)).toBeVisible();
});

test("customer dashboard: when bookings fail to load it says so, offers a retry, and never claims nothing is booked", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fakeSupabase(page.context());
  await page.context().addCookies([sessionCookie]);
  await page.context().route(/\/rest\/v1\/bookings/, (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ message: "boom" }),
    }),
  );
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Couldn't load your bookings")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  await expect(page.getByText(/nothing booked/i)).toHaveCount(0);
  await expect(page.getByText(/finished details will collect here/i)).toHaveCount(0);
});

test("rewards: nothing is remembered or celebrated while bookings are still loading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeSupabase(page.context(), { extraCompleted: 2 });
  await page.context().addCookies([sessionCookie]);
  await page
    .context()
    .addInitScript(
      ([k, v]) => localStorage.setItem(k!, v!),
      [`ttd_rewards_seen:${CUSTOMER_UID}`, "2"],
    );
  // Answer the bookings request slowly so the card would have rendered early if it could.
  await page.route("**/rest/v1/bookings*", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fallback();
  });
  await page.goto("/account");
  await page.waitForTimeout(400);
  expect(
    await page.evaluate((k) => localStorage.getItem(k), `ttd_rewards_seen:${CUSTOMER_UID}`),
  ).toBe("2");
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("New visit counted. That is visit 3 of 7.")).toBeVisible({
    timeout: 8000,
  });
  expect(
    await page.evaluate((k) => localStorage.getItem(k), `ttd_rewards_seen:${CUSTOMER_UID}`),
  ).toBe("3");
});

test("reduced motion: page entrances, loops and skeleton shimmer are switched off across the portal", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fakeSupabase(page.context(), { trackedStatus: "en_route" });
  await page.goto("/account/track/tok_abcdef123456", { waitUntil: "networkidle" });
  const running = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("*")).filter((el) => {
        const cs = getComputedStyle(el);
        const dur = parseFloat(cs.animationDuration);
        const infinite = cs.animationIterationCount === "infinite";
        return cs.animationName !== "none" && (infinite || dur > 0.05);
      }).length,
  );
  expect(running, "no animation runs longer than a blink under reduced motion").toBe(0);
});

test("motion: with no preference, entrances and the live pulse do run", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fakeSupabase(page.context(), { trackedStatus: "en_route" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account/track/tok_abcdef123456", { waitUntil: "networkidle" });
  const names = await page.evaluate(() => [
    ...new Set(
      Array.from(document.querySelectorAll("*")).map((el) => getComputedStyle(el).animationName),
    ),
  ]);
  expect(names.some((n) => n !== "none")).toBe(true);
});

test.describe("password reset link", () => {
  test("a link carrying its own token signs in from any browser and shows the new password form", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await fakeSupabase(ctx, {});
    const page = await ctx.newPage();
    await page.goto("/account/reset?token_hash=good-hash&type=recovery");
    await expect(page.getByRole("heading", { name: /NEW PASSWORD/i })).toBeVisible();
    await expect(page.getByText(/expired/i)).toHaveCount(0);
    await ctx.close();
  });

  test("a genuinely expired link says expired", async ({ browser }) => {
    const ctx = await browser.newContext();
    await fakeSupabase(ctx, {});
    const page = await ctx.newPage();
    await page.goto("/account/reset?token_hash=expired-hash&type=recovery");
    await expect(page.getByRole("heading", { name: /LINK HAS EXPIRED/i })).toBeVisible();
    await ctx.close();
  });

  test("a link opened where it was not requested explains that, and does not claim it expired", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    await fakeSupabase(ctx, {});
    const page = await ctx.newPage();
    await page.goto("/account/reset?code=abc123");
    await expect(page.getByRole("heading", { name: /DID NOT WORK/i })).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByText(/browser you asked for it from/i)).toBeVisible();
    await ctx.close();
  });
});

test.describe("book a detail and booking status pages", () => {
  test("book: the hero tracks the three parts and the total, and the flow reaches the confirmation", async ({
    page,
  }) => {
    await fakeSupabase(page.context(), { withAddress: true });
    await page.context().addCookies([sessionCookie]);
    await page.goto("/book", { waitUntil: "networkidle" });
    const steps = page.getByRole("list", { name: "Booking steps" });
    await expect(steps.getByRole("listitem").nth(0)).toHaveAttribute("aria-current", "step");
    await expect(page.getByLabel(/Total so far, 155 pounds/)).toBeVisible();
    // Choosing a bigger package and an add-on moves the total.
    await page.getByRole("radio", { name: /Premium Full Car Detail/ }).click();
    await expect(page.getByLabel(/Total so far, 240 pounds/)).toBeVisible();
    await page.getByRole("checkbox", { name: /Engine Bay Clean/ }).check();
    await page.getByRole("button", { name: /Next: when and where · £280/ }).click();

    await expect(steps.getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");
    // A finished part takes you back to it.
    await page.getByRole("button", { name: "Go back to Vehicle and package" }).click();
    await expect(page.getByRole("heading", { name: "Vehicle and package" })).toBeVisible();
    await page.getByRole("button", { name: /Next: when and where/ }).click();

    const later = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);
    await page.locator('input[type="date"]').fill(later);
    await page.getByRole("button", { name: "10:00 AM" }).click();
    await page.getByRole("button", { name: /Next: review/ }).click();
    await expect(page.getByRole("heading", { name: "Confirm your booking" })).toBeVisible();
    await expect(page.getByText("Engine Bay Clean")).toBeVisible();
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByText("Booking confirmed")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "BOOKED IN" })).toBeVisible();
  });

  test("book: the choices are real radio and checkbox groups with visible selected states", async ({
    page,
  }) => {
    await fakeSupabase(page.context());
    await page.context().addCookies([sessionCookie]);
    await page.goto("/book", { waitUntil: "networkidle" });
    const pkg = page.getByRole("radiogroup", { name: "Package" });
    await expect(pkg.getByRole("radio")).toHaveCount(3);
    await expect(pkg.getByRole("radio", { name: /Full Valet/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await pkg.getByRole("radio", { name: /Essential/ }).focus();
    await page.keyboard.press("Enter");
    await expect(pkg.getByRole("radio", { name: /Essential/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("book: on a phone nothing scrolls sideways and the main button is full width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await fakeSupabase(page.context());
    await page.context().addCookies([sessionCookie]);
    await page.goto("/book", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    const btn = page.getByRole("button", { name: /Next: when and where/ });
    await btn.scrollIntoViewIfNeeded();
    expect((await btn.boundingBox())!.width).toBeGreaterThan(260);
  });

  test("booking status: a booking today reads TODAY in the hero, with no separate TODAY badge", async ({
    page,
  }) => {
    await fakeSupabase(page.context());
    await page.context().addCookies([sessionCookie]);
    await page.goto("/account/bookings/b2", { waitUntil: "networkidle" });
    const hero = page.getByRole("region", { name: "Job progress" });
    await expect(hero.locator('[data-today="true"]')).toContainText("TODAY");
    // Said once on the page, not again as a badge or a repeat in the summary.
    expect(await page.locator('[data-today="true"]').count()).toBe(1);
  });

  test("booking status: a booking on another day shows the real date, not TODAY or TOMORROW", async ({
    page,
  }) => {
    await fakeSupabase(page.context(), { laterVisit: true });
    await page.context().addCookies([sessionCookie]);
    await page.goto("/account/bookings/b3", { waitUntil: "networkidle" });
    const hero = page.getByRole("region", { name: "Job progress" });
    await expect(hero).toContainText(/(MON|TUE|WED|THU|FRI|SAT|SUN) \d{1,2} [A-Z]{3}/);
    await expect(hero).not.toContainText(/TODAY|TOMORROW/);
    expect(await page.locator('[data-today="true"]').count()).toBe(0);
  });

  test("booking status: on a phone the booking comes before the visit log, cancel is last", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fakeSupabase(page.context());
    await page.context().addCookies([sessionCookie]);
    await page.goto("/account/bookings/b3", { waitUntil: "networkidle" });
    const y = async (t: string) =>
      (await page.getByText(t, { exact: true }).first().boundingBox())!.y;
    const progress = await y("Progress");
    const booking = await y("Your booking");
    const log = await y("Your visit so far");
    const cancel = (await page.getByRole("button", { name: "Cancel this booking" }).boundingBox())!
      .y;
    expect(progress).toBeLessThan(booking);
    expect(booking).toBeLessThan(log);
    expect(log).toBeLessThan(cancel);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });

  test("account home: today's visits say TODAY on their calendar tile, with no separate badge", async ({
    page,
  }) => {
    await fakeSupabase(page.context());
    await page.context().addCookies([sessionCookie]);
    await page.goto("/account", { waitUntil: "networkidle" });
    // b1 is on the way (live), so the next-visit headline is its status, and the calendar tile says TODAY.
    await expect(page.locator('[data-today="true"]').first()).toBeVisible();
  });
});
