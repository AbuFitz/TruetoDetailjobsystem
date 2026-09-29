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
    text: /Full address needed/i,
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
  await page.goto("/account/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /book a detail/i }).click();
  const group = page.getByRole("radiogroup", { name: /vehicle size/i });
  await expect(group).toContainText("Hatchbacks and coupes");
  await expect(group).toContainText("Saloons and estates");
  await expect(group).toContainText("SUVs, 4x4s and people carriers");
  await expect(page.locator("body")).not.toContainText(/sedan/i);
});
