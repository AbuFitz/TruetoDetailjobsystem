import type { BrowserContext } from "@playwright/test";

/** A fake Supabase: every auth and REST call the portal makes is answered from here. */
const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? "https://placeholder.supabase.co";
const REF = new URL(SUPABASE_URL).hostname.split(".")[0]!;

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const uid = "22222222-2222-4222-8222-222222222222";
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, exp: Math.floor(now / 1000) + 3600, role: "authenticated", aud: "authenticated" })}.sig`;
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "sam@example.com",
  created_at: iso(now - 30 * 86400e3),
  last_sign_in_at: iso(now - 3600e3),
  app_metadata: {},
  user_metadata: {},
};
const session = {
  access_token: jwt,
  refresh_token: "r",
  expires_in: 3600,
  expires_at: Math.floor(now / 1000) + 3600,
  token_type: "bearer",
  user,
};
export const sessionCookie = {
  name: `sb-${REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
  url: "http://localhost:3110",
};

const customer = {
  id: "c1",
  auth_user_id: uid,
  first_name: "Sam",
  last_name: "Lee",
  phone: "07700 900123",
  email: "sam@example.com",
  must_change_password: false,
  created_at: iso(now - 30 * 86400e3),
};
const detailer = {
  id: "d1",
  name: "Jamie Clarke",
  photo_url: null,
  phone: "07700 900999",
  job_title: "Senior Detailer",
  vehicle_description: "White Vito van",
  link_token: "tok-jamie",
  active: true,
};
const booking = (o: Record<string, unknown>) => ({
  id: "b1",
  booking_reference: "TTD-9A3E7220",
  customer_id: "c1",
  vehicle_id: null,
  address_id: null,
  fulfilment_type: "MOBILE",
  service_address_line1: "12 Acacia Road",
  service_address_line2: null,
  service_address_city: "Hemel Hempstead",
  service_postcode: "HP2 6EL",
  destination_lat: 51.7526,
  destination_lng: -0.4689,
  vehicle_registration: "AB12CDE",
  vehicle_description: "Ford Focus",
  package_id: "full-valet",
  package_name: "Full Valet Car Detail",
  vehicle_size: "small",
  addon_ids: [],
  addon_labels: [],
  price: 140,
  scheduled_start: iso(now + 3600e3),
  estimated_duration_minutes: 270,
  travel_time_minutes: null,
  assigned_detailer_id: "d1",
  status: "en_route",
  customer_notes: null,
  internal_notes: null,
  tracking_active: true,
  current_lat: 51.7401,
  current_lng: -0.4602,
  location_updated_at: iso(now - 15e3),
  eta_seconds: 780,
  eta_updated_at: iso(now - 15e3),
  tracking_token: "tok_abcdef123456",
  source: "website",
  created_at: iso(now - 86400e3),
  assigned_at: null,
  en_route_at: iso(now - 600e3),
  arrived_at: null,
  check_in_at: null,
  in_progress_at: null,
  qc_at: null,
  handover_at: null,
  completed_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  detailer,
  ...o,
});
export const bookings = [
  booking({}),
  booking({
    id: "b2",
    booking_reference: "TTD-11112222",
    status: "requested",
    assigned_detailer_id: null,
    detailer: null,
    tracking_active: false,
    eta_seconds: null,
    service_address_line1: "Address to be confirmed",
  }),
  booking({
    id: "b3",
    booking_reference: "TTD-33334444",
    status: "confirmed",
    assigned_detailer_id: null,
    detailer: null,
    tracking_active: false,
    eta_seconds: null,
  }),
  booking({
    id: "b4",
    booking_reference: "TTD-55556666",
    status: "completed",
    tracking_active: false,
    completed_at: iso(now - 12 * 86400e3),
  }),
];

const jobOf = (b: (typeof bookings)[number], first: string, phone: string | null) => ({
  id: b.id,
  booking_reference: b.booking_reference,
  customer_first_name: first,
  customer_phone: phone,
  vehicle_registration: b.vehicle_registration,
  vehicle_description: b.vehicle_description,
  service_address_line1: b.service_address_line1,
  service_address_line2: null,
  service_address_city: b.service_address_city,
  service_postcode: b.service_postcode,
  destination_lat: b.destination_lat,
  destination_lng: b.destination_lng,
  scheduled_start: b.scheduled_start,
  estimated_duration_minutes: b.estimated_duration_minutes,
  package_name: b.package_name,
  status: b.status,
  customer_notes: "Silver Focus on the driveway, gate code 1234.",
  internal_notes: null,
  tracking_active: b.tracking_active,
  current_lat: b.current_lat,
  current_lng: b.current_lng,
  location_updated_at: b.location_updated_at,
});
const detailerJobs = [
  jobOf(bookings[0]!, "Sam", "07700 900123"),
  {
    ...jobOf(bookings[2]!, "Priya", null),
    id: "b3",
    status: "assigned",
    scheduled_start: iso(now + 26 * 3600e3),
  },
];

export const tracked = (status: string, hasAccount = false) => ({
  reference: "TTD-9A3E7220",
  status,
  source: "website",
  package_name: "Full Valet Car Detail",
  addon_labels: [],
  price: 140,
  vehicle_description: "Ford Focus",
  vehicle_registration: "AB12CDE",
  scheduled_start: iso(now + 3600e3),
  estimated_duration_minutes: 270,
  service_city: "Hemel Hempstead",
  service_postcode: "HP2 6EL",
  customer_first_name: "Sam",
  customer_has_account: hasAccount,
  created_at: iso(now - 86400e3),
  en_route_at: ["en_route", "arrived", "in_progress", "completed"].includes(status)
    ? iso(now - 1200e3)
    : null,
  arrived_at: ["arrived", "in_progress", "completed"].includes(status) ? iso(now - 600e3) : null,
  in_progress_at: ["in_progress", "completed"].includes(status) ? iso(now - 500e3) : null,
  completed_at: status === "completed" ? iso(now - 60e3) : null,
  cancelled_at: null,
  detailer: {
    first_name: "Jamie",
    job_title: "Senior Detailer",
    photo_url: null,
    vehicle_description: "White Vito van",
  },
  tracking:
    status === "en_route"
      ? {
          lat: 51.7401,
          lng: -0.4602,
          updated_at: iso(now - 15e3),
          destination_lat: 51.7526,
          destination_lng: -0.4689,
          eta_seconds: 780,
          eta_updated_at: iso(now - 15e3),
        }
      : null,
  stages: [
    { key: "exterior", done: true },
    { key: "interior", done: false },
    { key: "protection", done: false },
    { key: "final_check", done: false },
  ],
});

export interface FakeOptions {
  staff?: boolean;
  trackedStatus?: string;
  hasAccount?: boolean;
  mustChangePassword?: boolean;
}

export async function fakeSupabase(ctx: BrowserContext, opts: FakeOptions = {}) {
  await ctx.route(/\/(auth|rest|storage)\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    if (req.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    }
    if (p.endsWith("/auth/v1/signup")) {
      const body = JSON.parse(req.postData() ?? "{}") as { email?: string };
      // Like Supabase: an email that already has an account gets a success with no identities.
      const exists = (body.email ?? "").startsWith("exists");
      return json({
        id: "33333333-3333-4333-8333-333333333333",
        aud: "authenticated",
        role: "",
        email: body.email,
        identities: exists ? [] : [{ identity_id: "i1", provider: "email" }],
        created_at: iso(now),
        app_metadata: {},
        user_metadata: {},
      });
    }
    if (p.endsWith("/auth/v1/resend")) return json({});
    if (p.endsWith("/auth/v1/token")) {
      const body = JSON.parse(req.postData() ?? "{}") as { password?: string };
      if (body.password === "Wrong-Pass-1")
        return json({ code: "invalid_credentials", message: "Invalid login credentials" }, 400);
      return json(session);
    }
    if (p.endsWith("/auth/v1/user")) {
      if (req.method() === "PUT") {
        const body = JSON.parse(req.postData() ?? "{}") as { password?: string };
        if (body.password === "Reused-Pass-1")
          return json(
            {
              code: "same_password",
              message: "New password should be different from the old password.",
            },
            422,
          );
      }
      return json(user);
    }
    if (p.endsWith("/rpc/get_detailer_profile"))
      return json([
        {
          id: "d1",
          name: detailer.name,
          photo_url: null,
          phone: detailer.phone,
          job_title: detailer.job_title,
          vehicle_description: detailer.vehicle_description,
        },
      ]);
    if (p.endsWith("/rpc/get_detailer_jobs")) return json(detailerJobs);
    if (p.endsWith("/rpc/get_detailer_job_history")) return json([]);
    if (p.endsWith("/rpc/get_detailer_job_stages"))
      return json([
        { stage_key: "exterior", completed_at: iso(now - 60e3) },
        { stage_key: "interior", completed_at: null },
        { stage_key: "protection", completed_at: null },
        { stage_key: "final_check", completed_at: null },
      ]);
    if (p.endsWith("/rpc/is_staff")) return json(Boolean(opts.staff));
    if (p.endsWith("/rpc/get_tracked_booking"))
      return json(tracked(opts.trackedStatus ?? "en_route", opts.hasAccount));
    if (p.includes("/rest/v1/customers")) {
      const c = { ...customer, must_change_password: Boolean(opts.mustChangePassword) };
      return json(wantsObject ? c : [c]);
    }
    if (p.includes("/rest/v1/bookings")) {
      const id = url.searchParams.get("id");
      if (id) {
        const b = bookings.find((x) => `eq.${x.id}` === id) ?? bookings[0]!;
        return json(wantsObject ? b : [b]);
      }
      return json(wantsObject ? bookings[0] : bookings);
    }
    if (p.includes("/rest/v1/vehicles"))
      return json([
        { id: "v1", customer_id: "c1", make: "Ford", model: "Focus", registration: "AB12CDE" },
      ]);
    if (p.includes("/rest/v1/detailers")) return json([detailer]);
    if (p.includes("/rest/v1/booking_notifications"))
      return json([{ kind: "booked_in", sent_at: iso(now - 3600e3) }]);
    if (p.includes("/rest/v1/booking_stage_progress")) return json([]);
    return json([]);
  });
  // The map tiles and routing are not part of these checks.
  await ctx.route(/openfreemap|router\.project-osrm|api\.postcodes\.io/, (r) => r.abort());
}
