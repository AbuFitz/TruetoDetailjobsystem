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
    .getByRole("button", { name: /full valet/i })
    .first()
    .click();
  await page.getByRole("button", { name: /next: when and where/i }).click();
  await expect(page.getByRole("heading", { name: /when and where/i })).toBeVisible();
  await expect(page.getByText(/enter the postcode/i)).toBeVisible();
  // Back returns to step one with choices kept.
  await page.getByRole("button", { name: /back/i }).click();
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

test("settings hold the password, appearance, help and sign out, and no page footer shows the company phone number", async ({
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
  await expect(page.getByRole("radio", { name: /dark/i })).toBeVisible();
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
  await expect(page.locator("#password")).toHaveCount(0);
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
  const size = page.getByText("Vehicle size", { exact: true });
  expect(await topOf(page, size)).not.toBeNull();
  await page.getByRole("radio").nth(2).click();
  await page.waitForTimeout(900);
  const pack = page.getByText("Package", { exact: true }).first();
  expect(await topOf(page, pack), "package heading in view after picking a size").not.toBeNull();
  expect((await topOf(page, pack))!).toBeLessThan(300);
  await page
    .getByRole("button", { name: /full valet/i })
    .first()
    .click();
  await page.waitForTimeout(900);
  const addons = page.getByText("Add-ons", { exact: true });
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

test("rewards: the stamp card is made of real visits and tells you which one each stamp is", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByRole("img", { name: "3 of 7 qualifying visits" })).toBeVisible();
  await expect(card.getByText("4 MORE VISITS")).toBeVisible();
  await expect(card.getByRole("listitem")).toHaveCount(7);
  await card.getByRole("button", { name: /^Stamp 2, earned/ }).click();
  await expect(
    card.getByText(/^Stamp 2: Full Valet Car Detail, \d{1,2} \w{3} \d{4}$/),
  ).toBeVisible();
  await card.getByRole("button", { name: "Stamp 4, next" }).click();
  await expect(card.getByText(/Stamp 4 is next/)).toBeVisible();
  await card.getByRole("button", { name: "Stamp 6, not yet earned" }).click();
  await expect(card.getByText("Stamp 6 is 3 visits away.")).toBeVisible();
  // First look on a device never celebrates.
  await expect(card.getByRole("status")).toHaveCount(0);
});

test("rewards: a newly counted visit gets an earned moment once, then not again", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2, seen: 2 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("New stamp earned. That is visit 3 of 7.")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(card.getByText(/New stamp earned/)).toHaveCount(0);
});

test("rewards: reaching the goal is a milestone", async ({ page }) => {
  await rewardsPage(page, { extra: 6, seen: 6 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("Milestone reached").first()).toBeVisible();
  await expect(card.getByText("YOU ARE THERE")).toBeVisible();
  await expect(card.getByText("That is visit 7. Milestone reached.")).toBeVisible();
});

test("rewards: with reduced motion the state is complete and nothing flies around", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 6, seen: 6, reduce: true });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByText("YOU ARE THERE")).toBeVisible();
  const dots = await card
    .locator(".burst-dot")
    .evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== "none").length);
  expect(dots).toBe(0);
  const dash = await card
    .locator("svg circle")
    .nth(1)
    .evaluate((c) => Number((c as SVGCircleElement).style.strokeDashoffset));
  expect(dash).toBeLessThan(1);
});

test("rewards: a phone shows all seven stamps without sideways scroll", async ({ page }) => {
  await rewardsPage(page, { extra: 2, width: 360 });
  const card = page.getByRole("region", { name: "TTD Rewards" });
  await expect(card.getByRole("listitem")).toHaveCount(7);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over).toBeLessThanOrEqual(1);
});

test("rewards: past visits name the stamp they earned, and the card sits under the next visit on a phone", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2, width: 390 });
  const history = page.locator("section", { hasText: "Previous details" });
  await expect(history.getByText("Stamp 3")).toBeVisible();
  await expect(history.getByText("Stamp 1")).toBeVisible();
  const box = async (sel: ReturnType<typeof page.locator>) => (await sel.boundingBox())!.y;
  const rewardsY = await box(page.getByRole("region", { name: "TTD Rewards" }));
  const historyY = await box(history);
  expect(rewardsY).toBeLessThan(historyY);
});

test("rewards: on a desktop the card stays in the side column, beside the next visit", async ({
  page,
}) => {
  await rewardsPage(page, { extra: 2, width: 1280 });
  const rewards = await page.getByRole("region", { name: "TTD Rewards" }).boundingBox();
  const history = await page.locator("section", { hasText: "Previous details" }).boundingBox();
  expect(rewards!.x).toBeGreaterThan(history!.x + history!.width - 1);
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
  await expect(card.getByText("New stamp earned. That is visit 3 of 7.")).toBeVisible({
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
