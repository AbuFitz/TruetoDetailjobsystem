# True To Detail — Job System

A mobile-first job management platform for **True To Detail**, a UK mobile car detailing
service. Customers book a detail from their account, save their addresses and vehicles, and
track their detailer live on the day — from "on the way" through arrival, check-in, the detail
stages, final QC, and handover. Staff run the whole operation — bookings, detailer assignment,
a travel-time-aware schedule — from a staff console.

This is **not** a workshop/reception system. There is no "vehicle arrives", no bay, no drop-off/
collection, no service desk. The whole workflow is the detailer travelling **to** the customer:

```
CONFIRMED → ASSIGNED → EN_ROUTE → ARRIVED → CHECK_IN → IN_PROGRESS → QC → HANDOVER → COMPLETED
                                                                                  ↘ CANCELLED (any point)
```

`fulfilment_type` is `MOBILE` on every booking today, on purpose — see [Architecture](#architecture)
for why a future studio/drop-off offering is a second fulfilment type, not a retrofit of this one.

## Stack

- React 19 + TypeScript, TanStack Start / TanStack Router (file-based routes, SSR)
- Supabase — Postgres + Row Level Security, Supabase Auth (**customers and staff both** — unlike
  a link-only tracking tool, this app has real accounts), Storage (detailer/check-in photos),
  PostgREST
- MapLibre GL JS + [OpenFreeMap](https://openfreemap.org/) tiles — no API key, no Google Maps, for
  the live tracking map
- [Postcodes.io](https://postcodes.io/) for UK postcode → coordinates — no API key
- [OpenRouteService](https://openrouteservice.org/) for real, routing-based ETAs and admin
  schedule travel-time gaps — optional, falls back to an honest on-track/behind comparison and a
  straight-line estimate when not configured
- Tailwind CSS v4, shadcn/ui primitives + bespoke True To Detail components, re-themed from the
  marketing site's brand (orange `#E84A0C` / ink `#0C0C0C` / parchment `#FAFAF8`, Bebas Neue +
  DM Sans)
- Browser Geolocation API for detailer GPS; polling (no websockets) for customer/detailer reads

This project shares its architecture and a good part of its live-tracking mechanics with **FixNow
Mechanics Tracking** (a sibling tool for a mobile mechanic), but built out into a complete
mobile-service platform: real customer accounts, a booking flow with service-area checking, a
vehicle/address "Your Garage", the full on-site check-in record, a detail-stage checklist, and a
travel-time-aware admin schedule — live tracking is one feature inside it, not the whole product.

## How it works

### Customer

1. Customer creates an account (`/account/login`, "Create account" tab) or signs in.
2. Books at `/book`: enters their postcode → the app checks it against True To Detail's mobile
   service area (`HP`, `WD`, `AL`, `LU` postcode areas — see `src/lib/service-area.ts`) → picks or
   adds a service address (Home / Work / Another) → picks or adds a vehicle → chooses a package
   (Essential / Full Valet / Premium Detail) and add-ons → picks a date/time → confirms.
3. Their account (`/account`) shows their next booking, or — once a detailer is assigned and the
   job goes live — a dominant "**\<Detailer\> is on the way**" card with **View live job**.
4. `/account/bookings/$id` is the live view: status, a live MapLibre map once `EN_ROUTE` (with a
   real routing ETA when configured), the assigned detailer's card, the detail-stage checklist
   once `IN_PROGRESS`, and full booking progress.
5. Customers manage saved addresses (`/account/addresses`) and vehicles (`/account/vehicles`,
   "Your Garage") independently of booking.

### Detailer

No login — each detailer gets a **persistent link** (`/d/<link_token>`), created once by staff,
that they bookmark and reuse for every job:

1. `/d/<token>` — their job queue, soonest first.
2. Opening a job (`/d/<token>/<bookingId>`) surfaces the right action for its current status:
   - `ASSIGNED` → **Start journey** (asks for location, flips to `EN_ROUTE`, starts sharing GPS)
   - `EN_ROUTE` → live-sharing indicator + **I've arrived** (flips to `ARRIVED`, stops sharing)
   - `ARRIVED` → **Start check-in** (flips to `CHECK_IN`)
   - `CHECK_IN` → the full on-site inspection form: mileage, existing bodywork/wheel damage,
     interior condition, valuables/items, customer requests, access considerations, water/
     electric availability, vehicle position, any blocking issue, and photos — **Save check-in**
     writes the record, seeds the six-item detail-stage checklist, and flips to `IN_PROGRESS`
   - `IN_PROGRESS` → the detail-stage checklist (initial inspection → wheels & pre-wash →
     exterior wash → interior → protection → final QC) as tappable checkboxes, plus a customer
     acknowledgement (tap-to-confirm) box. Ticking **Final QC** flips the booking to `QC`
   - `QC` → **Start handover** (flips to `HANDOVER`)
   - `HANDOVER` → **Complete job** (flips to `COMPLETED` — the job then disappears from the queue)

Cancelling a booking is deliberately **not** exposed to detailers — staff-only, same principle as
the sibling FixNow tool.

### Staff

Sign in at `/admin/login` (Supabase Auth + a `staff_users` row — see
[Create the staff account](#3-create-the-staff-account)):

- `/admin` — stats, **today's schedule per detailer** (start–end time blocks with the travel gap
  to the *next* job — `↓ 18 min travel`, or a red overlap warning if two jobs are booked too
  tight), unassigned bookings, active jobs, history, search/filter.
- `/admin/bookings/new` — create a booking on a customer's behalf (search an existing customer,
  pick their saved address/vehicle, choose package/add-ons/schedule).
- `/admin/bookings/$id` — full booking detail: assign/reassign a detailer, set/edit the travel-time
  gap, view the live detail-stage checklist and the complete check-in record (including photos)
  once the detailer has recorded them, cancel with a reason.
- `/admin/detailers`, `/admin/detailers/new`, `/admin/detailers/$id` — manage detailer profiles and
  get their persistent job link.

## Architecture

Every booking is `fulfilment_type: 'MOBILE'` and carries:

```
service_address_line1 / _line2 / _city / service_postcode / destination_lat / destination_lng
vehicle_registration / vehicle_description
scheduled_start / estimated_duration_minutes / travel_time_minutes
assigned_detailer_id
status: CONFIRMED | ASSIGNED | EN_ROUTE | ARRIVED | CHECK_IN | IN_PROGRESS | QC | HANDOVER
      | COMPLETED | CANCELLED
```

Detail stages (`booking_stage_progress`) and the check-in record (`check_ins` /
`check_in_photos`) are separate tables, not columns on `bookings` — the lightweight customer-
facing checklist and the detailed on-site inspection record are different things with different
audiences (see `supabase/migrations/20260927120500_booking_stages_and_checkin.sql`).

If True To Detail ever adds a studio/drop-off offering, that's a **second** `fulfilment_type`
(`STUDIO`) with its own additional columns and its own status vocabulary — never bays, drop-off/
collection scheduling, a waiting-room status, key storage, "ready for pickup", or workshop
capacity bolted onto this one. This system deliberately has none of that.

### Status flow / button map

```
                     ┌───────────┐   staff assigns detailer     ┌──────────┐
   customer books ──▶│ CONFIRMED │─────────────────────────────▶│ ASSIGNED │
                     └───────────┘                              └────┬─────┘
                                                                      │ detailer taps
                                                                      │ START JOURNEY
                                                                      ▼
                                                                ┌───────────┐
                                                                │ EN_ROUTE  │  live GPS + map
                                                                └────┬──────┘
                                                                     │ I'VE ARRIVED
                                                                     ▼
                                                                ┌──────────┐
                                                                │ ARRIVED  │
                                                                └────┬─────┘
                                                                     │ START CHECK-IN
                                                                     ▼
                                                              ┌───────────┐
                                                              │ CHECK_IN  │  inspection form
                                                              └────┬──────┘
                                                                   │ SAVE CHECK-IN
                                                                   ▼
                                                           ┌──────────────┐
                                                           │ IN_PROGRESS  │  stage checklist
                                                           └──────┬───────┘
                                                                  │ tick "Final QC"
                                                                  ▼
                                                              ┌────────┐
                                                              │   QC   │
                                                              └───┬────┘
                                                                  │ START HANDOVER
                                                                  ▼
                                                            ┌───────────┐
                                                            │ HANDOVER  │
                                                            └─────┬─────┘
                                                                  │ COMPLETE JOB
                                                                  ▼
                                                            ┌───────────┐
                                                            │ COMPLETED │
                                                            └───────────┘

   Staff can CANCEL a booking at any point up to HANDOVER (reason required).
   Customers can cancel their own booking only while it's still CONFIRMED.
```

## Setup

### 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com) (or run one locally — see
[Local development](#local-development-optional)).

### 2. Run the SQL migrations

In the Supabase Dashboard → **SQL Editor**, run each file in `supabase/migrations/` **in filename
order** (they're timestamped, so sorting by name is correct):

1. `20260927120000_shared_token_helper.sql` — `generate_link_token()`, used by detailer links.
2. `20260927120100_customers_and_staff.sql` — `customers`, `staff_users`, `public.is_staff()`, and
   the `handle_new_user()` trigger that auto-creates a customer profile on signup.
3. `20260927120200_addresses_vehicles_service_areas.sql` — `customer_addresses`, `vehicles`,
   `service_areas` + `is_postcode_covered()`.
4. `20260927120300_detailers.sql` — `detailers` table + the `detailer-photos` storage bucket.
5. `20260927120400_bookings.sql` — the `bookings` table, `generate_booking_reference()`,
   `cancel_own_booking()`.
6. `20260927120500_booking_stages_and_checkin.sql` — `booking_stage_progress`, `check_ins`,
   `check_in_photos` + the `check-in-photos` storage bucket.
7. `20260927120600_detailer_rpcs.sql` — every `detailer_*` / `get_detailer_*` RPC the detailer job
   link uses.
8. `20260927120700_service_role_grants.sql` — the `service_role` grant the `get-eta` Edge Function
   needs.

(If you have the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
linked to your project instead, `supabase db push` applies all of these in order.)

### 3. Create the staff account

Customers self-register through `/account/login`. Staff accounts are **not** self-service —
create them directly in Supabase, same principle as FixNow's single-admin pattern:

1. Dashboard → **Authentication → Users → Add user** — set an email + password, tick
   **Auto Confirm User**.
2. Dashboard → **SQL Editor**, run:
   ```sql
   insert into public.staff_users (id, name)
   values ('<the new user's UUID from step 1>', 'Staff member name');
   ```
   (A row here is a real customer profile row will also exist for that same auth user via the
   signup trigger — harmless; `public.is_staff()` is what every RLS policy actually checks.)

### 4. Environment variables — locally

```sh
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

The anon key is safe to ship to the browser — it only works through RLS and the security-definer
RPCs in the migrations. **Never** put a `service_role` key in a `VITE_*` variable.

`ORS_API_KEY` (see [Real ETA & schedule travel-times](#real-eta--schedule-travel-times-via-openrouteservice))
is optional — the app runs fine without it, just without real routing-based ETAs/travel-times.

### 5. Run locally

```sh
bun install
bun run dev
```

Open `http://localhost:8080`. Sign up a customer at `/account/login`, or sign in as staff at
`/admin/login` once you've created a staff account (step 3).

### 6. Environment variables — Vercel (or wherever you deploy)

Project → **Settings → Environment Variables** → add `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` for the environments you use.

### 7. Deploy

Push to GitHub and import the repo in Vercel, or:

```sh
npx vercel
```

Detailer links are built from `window.location.origin` at runtime, so they're automatically
correct locally, on previews, and in production.

## Local development (optional)

```sh
npx supabase start   # applies supabase/migrations automatically
```

Prints a local `API_URL` and `ANON_KEY` — put those in `.env.local`. `npx supabase stop` shuts it
down. Detailer/check-in photo uploads need the Storage service, which the CLI's default profile
excludes if you're running a trimmed-down stack — drop `storage-api` from any exclusion list if
you need to test uploads locally.

## Real ETA & schedule travel-times (via OpenRouteService)

Same "no fabricated ETAs" rule as FixNow Mechanics Tracking (see the comments in
`src/lib/format.ts` and `supabase/functions/get-eta/index.ts`): this app never guesses an arrival
time from straight-line distance and an assumed speed. The **only** way it shows a real ETA, or a
real travel-time gap on the admin schedule, is by asking an actual routing engine.

**Without this set up, nothing breaks** — the customer's live-job card falls back to the honest
on-track/running-behind comparison, and the admin schedule's travel gaps fall back to a clearly-
labelled straight-line estimate (`src/lib/schedule.ts`'s `estimateTravelMinutesFallback`).

1. Sign up at [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup),
   create a token for the **Directions Service** (free tier: ~2,000 requests/day).
2. Deploy the Edge Function and set the secret:
   ```sh
   npx supabase secrets set ORS_API_KEY=<your key>
   npx supabase functions deploy get-eta
   ```

`get-eta` is called two ways (see its own header comment for the full detail):
- **Booking-scoped** (`{ bookingId }`) — the customer's live-job ETA card. Resolves the booking
  through the caller's own Supabase Auth JWT, so RLS — not client-supplied coordinates — decides
  what they can see.
- **Point-to-point** (`{ fromLat, fromLng, toLat, toLng }`) — the admin schedule's travel-time
  gaps. Staff-only (`public.is_staff()` checked inside the function).

## Security model

- `customers`, `customer_addresses`, `vehicles`, and `bookings` all have Row Level Security: a
  customer can read/write only their own rows (`customer_id = auth.uid()`); staff
  (`public.is_staff()`) get full access. Customers can **insert** a booking but never update one
  directly — every status change past creation goes through a `detailer_*` RPC or a staff write;
  a customer's only mutation path on an existing booking is `cancel_own_booking()`, and only while
  `status = 'confirmed'`.
- `detailers` follows FixNow's engineer pattern exactly: `anon` has **no** direct table access —
  everything the detailer app does goes through security-definer `detailer_*` / `get_detailer_*`
  RPCs, each re-resolving the `link_token` to an active detailer **and** checking the booking is
  both assigned to them **and** in the expected status before writing.
- `booking_stage_progress` and `check_ins` are readable by the owning customer and by staff, but
  only ever written by the token-gated detailer RPCs or staff.
- `check-in-photos` storage is public-read, open-insert (a deliberate, bounded relaxation vs.
  FixNow's stricter model — see the comment in
  `supabase/migrations/20260927120500_booking_stages_and_checkin.sql` for why: the detailer app
  has no auth session to hand an Edge Function, and photo evidence is low-sensitivity). Every
  *table* write around it (which check-in a photo belongs to) still goes through
  `detailer_add_check_in_photo()`.
- `service_areas` is public-read (needed before a customer signs in, at the booking flow's
  postcode gate), staff-write only.
- The detailer's `link_token` is the same format/strength as FixNow's engineer token (12-char,
  ~72-bit random, via `generate_link_token()`) — persistent, not per-job. Deactivating a detailer
  (`/admin/detailers/$id`) revokes it immediately.

## Project structure

- `src/routes/` — file-based routes (TanStack Router). Flat, dot-separated filenames; `$id`/
  `$token` are path params; a trailing underscore (`admin.detailers_.new.tsx`) means "don't nest
  under the sibling list route's layout" — same convention as the sibling FixNow project.
- `src/components/ttd/` — reusable, branded True To Detail components (header, status badge,
  tracking map, stage checklist, check-in form, schedule timeline, cards, states).
- `src/components/ui/` — shadcn/ui primitives.
- `src/lib/customers.ts`, `addresses.ts`, `vehicles.ts` — customer profile/address/vehicle data
  access (plain RLS-authenticated reads/writes).
- `src/lib/bookings.ts` — booking data access, both customer- and staff-facing halves, plus the
  live-ETA call.
- `src/lib/detailers.ts` — staff detailer-profile CRUD, and the detailer's own token-gated
  queue/journey/check-in/stage/handover flow.
- `src/lib/checkin.ts` — read-only check-in record/photo access (customer + staff views).
- `src/lib/service-area.ts` — postcode → mobile-service-area eligibility.
- `src/lib/schedule.ts` — travel-time estimation for the admin schedule.
- `src/lib/constants.ts` — brand contact info, the three detail packages + add-ons + pricing
  (mirrors the truetodetail.co.uk booking widget), the six detail-stage keys/labels.
- `src/hooks/use-session.ts` — Supabase auth session + route guards, for both customer
  (`useRequireCustomerSession`) and staff (`useRequireStaffSession`) routes.
- `src/hooks/use-detailer-tracking.ts` — GPS start/watch/throttle + wake-lock, shared by the
  detailer job screen.
- `supabase/migrations/` — schema, RLS policies, storage buckets, every RPC.
- `supabase/functions/get-eta/` — the real-ETA / travel-time Edge Function (you deploy this
  yourself — see above).
- `src/styles.css` — design tokens, re-themed from truetodetail.co.uk's brand.

## Design system

Brand palette lifted directly from truetodetail.co.uk: signal orange `#E84A0C` / `#C53D08`
(pressed), near-black ink `#0C0C0C`, parchment `#FAFAF8` / `#F0EDE8`. Display type is Bebas Neue
(the marketing site's headline font), body/UI type is DM Sans, and booking references/plates use
IBM Plex Mono — see `src/styles.css`.

## What was deliberately left out of V1

To keep this a real, buildable job system rather than a wishlist:

- **New-customer creation from the admin console.** Staff create a booking for an *existing*
  customer (`/admin/bookings/new` searches by name/email/phone); a walk-in customer with no
  account yet needs to sign up themselves first (`/account/login`), same as any customer-facing
  SaaS — creating a Supabase Auth user server-side needs the `service_role` key, which this app
  never exposes to the browser.
- **Push notifications, PWA install, offline shell.** FixNow Mechanics Tracking has all three
  (job reminders, "on the way"/arrived pushes, an installable admin console). The mechanics are
  proven there and would port the same way `get-eta` did, but weren't duplicated here to keep
  this build focused on the mobile-detailing-specific workflow the product brief asked for.
- **Digital signature capture** for the customer acknowledgement — V1 is tap-to-confirm with a
  typed name (`detailer_customer_ack`), as the brief itself flagged as an acceptable V1 shortcut.
- **Automatic distance/travel surcharge at booking time** — the brief calls this out as a
  "eventually", not a V1 requirement; the postcode gate is a flat covered/not-covered check today.
