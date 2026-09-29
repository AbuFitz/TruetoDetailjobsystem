# True To Detail workflows

Every path a booking, customer, detailer or member of staff can take through
the website (truetodetail.co.uk) and the portal (app.truetodetail.co.uk),
what happens at each step, and which emails go out. Diagrams are Mermaid and
render on GitHub.

Statuses of a booking: `requested` (website enquiry, waiting for staff),
`confirmed`, `assigned`, `en_route`, `arrived`, `check_in`, `in_progress`,
`qc`, `handover`, `completed`, `cancelled`.

## 1. Booking arrives, from any of four doors

```mermaid
flowchart TD
  A1[Website: Book Now popup] --> W[/api/booking on the website/]
  A2[Portal sign-in page: quick book popup] --> W
  W -->|validates, prices server-side, checks slot is still open| R[(submit_website_booking RPC)]
  R -->|creates or finds the customer by email| C[(customers)]
  R -->|status: requested| B[(bookings)]
  W --> E1[Email to the customer: request received + tracking link + create account]
  W --> E2[Email to staff: new request]
  A3[Portal: signed-in customer, Book page] --> P[Booking insert]
  A4[Portal: staff, New booking] --> P
  P -->|database guard reprices, resets staff fields, refuses past times| B
  P -->|status: confirmed| B
  P --> E3[Email to the customer: you are booked in + tracking link + create account]
  B --> Q[Staff queue in the admin console]
```

Today: the website and the quick-book popup email but store nothing, so
staff cannot see them in the portal. Portal and staff bookings send no email.

## 2. Staff handle a request

```mermaid
flowchart TD
  Q[Requested booking in the admin queue] --> D{Staff decision}
  D -->|Confirm| C[status: confirmed]
  D -->|Change time or details| U[Edit, then confirm]
  D -->|Decline| X[status: cancelled + reason]
  C --> E1[Email: you are booked in]
  X --> E2[Email: sorry, we could not fit this in, call us]
  C --> AS[Assign a detailer]
  AS --> S[status: assigned]
  S --> E3[Email: your detailer is Jamie]
```

## 3. The job on the day (detailer link, no login)

```mermaid
flowchart TD
  L[Detailer opens their personal link /d/token] --> J[Sees today's jobs and history]
  J --> SJ[Start journey: shares location]
  SJ --> EN[status: en_route, live map for the customer]
  EN --> E1[Email: on the way + live tracking link]
  EN --> AR[Mark arrived]
  AR --> CI[Check-in form: photos, condition, access notes]
  CI --> IP[status: in_progress, six-stage checklist]
  IP --> QC[Final quality check]
  QC --> HO[Handover: customer name confirmed]
  HO --> CO[Complete]
  CO --> E2[Email: all done, thank you + create account / rewards]
```

## 4. The customer follows their booking

```mermaid
flowchart TD
  M[Email link] --> T[/t/token: public tracking page/]
  T --> V[Status, detailer, live map, what is included]
  T --> N{Has an account?}
  N -->|No| CA[Create your account card]
  CA --> SU[/account/create, email prefilled/]
  SU --> CF[Confirmation email from Supabase]
  CF --> CL[Confirmed: past bookings, cars and addresses are attached to the account]
  N -->|Yes| SI[Sign in]
  CL --> D[Dashboard]
  SI --> D
  D --> DB[Booking page: live job, timeline, cancel]
```

## 5. Accounts and access

```mermaid
flowchart TD
  S[Sign up] --> U[auth.users row]
  U -->|trigger| CU[customers row, or the staff-created record with the same email
  is claimed once the email is confirmed]
  SI[Sign in] --> R{is_staff?}
  R -->|yes| A[/admin/]
  R -->|no| CA[/account/]
  FP[Forgot password] --> EM[Reset email] --> RP[/account/reset/] --> SI
  DL[Detailer link] --> TK[Token checked inside each database function]
```

Access rules (enforced in the database, not the browser):
- A customer can read and create only their own bookings, cars and addresses.
- Staff can read and change everything.
- A detailer link works only for that detailer's assigned jobs.
- The tracking link shows one booking and nothing else.
- Customers cannot set a price, package, status or detailer on a booking they create.

## 6. Cancel and change

```mermaid
flowchart TD
  C1[Customer cancels while confirmed] --> RPC[cancel_own_booking]
  C2[Staff cancel with a reason] --> ST[status: cancelled]
  RPC --> ST
  ST --> E[Email: cancelled, with the fee note if inside 24 hours]
  CH[Customer wants to change date or details] --> CALL[Call or WhatsApp, shown on the booking page]
  CALL --> UPD[Staff edit the booking]
```

## Emails

| When | To | Sent by |
| --- | --- | --- |
| Website request received | customer, staff | website API |
| Booked in (portal, staff or after confirming a request) | customer | website email service, called by the portal |
| Detailer on the way | customer | same |
| Job complete | customer | same |
| Cancelled or declined | customer | same |
| Account confirmation, password reset | the person | Supabase Auth |

Each email is logged per booking and kind, so a retry, a double click or a
refresh can never send it twice.

## Owner settings these flows depend on

- Supabase Auth: Site URL `https://app.truetodetail.co.uk`, redirect URLs for
  `/account`, `/account/reset` and `/t/*`, and a custom SMTP sender. The
  built-in sender only delivers to your own team's addresses, so confirmation
  and reset emails to customers will not arrive without one.
- Website (Vercel): `RESEND_API_KEY`, `BOOKING_FROM_EMAIL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_APP_URL`.
