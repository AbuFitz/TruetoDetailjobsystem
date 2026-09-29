import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, Check, Loader2 } from "lucide-react";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { signUpCustomer, getSession } from "@/lib/auth";
import {
  DETAIL_ADDONS,
  DETAIL_PACKAGES,
  VEHICLE_SIZE_LABELS,
  type VehicleSize,
} from "@/lib/constants";
import {
  TIME_SLOTS,
  formatBookingDate,
  formatShortDate,
  isSlotAvailable,
  ukNow,
} from "@/lib/slots";

// Same lead-capture endpoint the main site's own booking popup posts to —
// this app has no separate booking backend for an anonymous, not-yet-signed-in
// visitor, so a quick booking made here goes through the exact same email
// pipeline (staff notification + customer confirmation) as truetodetail.co.uk.
const BOOKING_API_URL = "https://www.truetodetail.co.uk/api/booking";

// The main site's pack ids are the human-readable names themselves
// ("Essential", "Full Valet", "Premium Detail") — this app's DETAIL_PACKAGES
// use slug ids instead, so map one onto the other for the shared API.
const PACK_ID_FOR_API: Record<string, string> = {
  essential: "Essential",
  "full-valet": "Full Valet",
  "premium-detail": "Premium Detail",
};

const POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s+\-()]{7,20}$/;
const CAR_REG_RE = /^[A-Z0-9]{2,8}$/;

type Step = 1 | 2 | 3;
type View = "form" | "success" | "account" | "account-done";

const STEP_LABELS = ["Vehicle & Pack", "Schedule", "Your Details"];

export function QuickBookingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [view, setView] = useState<View>("form");

  const [vehicleSize, setVehicleSize] = useState<VehicleSize | "">("");
  const [packageId, setPackageId] = useState("");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [postcode, setPostcode] = useState("");
  const [carReg, setCarReg] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [bookingId, setBookingId] = useState("");

  const [password, setPassword] = useState("");
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  const selectedPackage = DETAIL_PACKAGES.find((p) => p.id === packageId) ?? null;
  const addonTotal = DETAIL_ADDONS.filter((a) => addonIds.includes(a.id)).reduce(
    (s, a) => s + a.price,
    0,
  );
  const basePrice =
    selectedPackage && vehicleSize ? selectedPackage.priceBySize[vehicleSize] : null;
  const totalPrice = basePrice !== null ? basePrice + addonTotal : null;

  const postcodeValid = POSTCODE_RE.test(postcode.trim());
  const carRegValid = CAR_REG_RE.test(carReg.trim().replace(/\s+/g, ""));
  const phoneValid = PHONE_RE.test(phone.trim());
  const emailValid = EMAIL_RE.test(email.trim());

  const toggleAddon = (id: string) =>
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  function reset() {
    setStep(1);
    setView("form");
    setVehicleSize("");
    setPackageId("");
    setAddonIds([]);
    setDate("");
    setTime("");
    setPostcode("");
    setCarReg("");
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setTouched({});
    setApiError("");
    setBookingId("");
    setPassword("");
    setSignupError("");
    setNeedsEmailConfirm(false);
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 300);
  }

  async function handleSubmit() {
    setTouched((t) => ({ ...t, phone: true, email: true }));
    if (!phoneValid || !emailValid || !packageId || !vehicleSize) return;
    setSubmitting(true);
    setApiError("");
    try {
      const res = await fetch(BOOKING_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack: PACK_ID_FOR_API[packageId] ?? packageId,
          vehicle: vehicleSize,
          date,
          time,
          address: postcode,
          carReg,
          name,
          phone,
          email,
          notes,
          addons: addonIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setApiError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setBookingId(json.booking?.id ?? "");
      setView("success");
    } catch {
      setApiError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignUp() {
    if (password.length < 6) {
      setSignupError("Password must be at least 6 characters.");
      return;
    }
    setSignupSubmitting(true);
    setSignupError("");
    try {
      const [firstName, ...rest] = name.trim().split(" ");
      const lastName = rest.join(" ");
      await signUpCustomer({
        email: email.trim(),
        password,
        firstName: firstName || email.split("@")[0] || "there",
        ...(lastName ? { lastName } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      const session = await getSession();
      if (session) {
        navigate({ to: "/account" });
        handleClose();
      } else {
        setNeedsEmailConfirm(true);
        setView("account-done");
      }
    } catch (err) {
      setSignupError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSignupSubmitting(false);
    }
  }

  // Focus moves into the panel, Tab stays inside, the page stops scrolling,
  // and focus returns to the "Book a detail" button on close.
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(panelRef, open);

  // Escape closes the popup, like every other dialog on the site.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  const slotOk = Boolean(date && time) && isSlotAvailable(date, time);

  return (
    <div
      className="fixed inset-0 z-100 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-booking-title"
    >
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-[3px]" onClick={handleClose} />

      <div
        ref={panelRef}
        className="relative flex h-dvh w-full max-w-[520px] flex-col overflow-hidden bg-background animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-ink px-8 pb-5 pt-6 text-ink-foreground">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <p className="eyebrow text-ink-foreground/30">
                {view === "success" || view === "account" || view === "account-done"
                  ? "Booking Requested"
                  : "Mobile Detailing · Hertfordshire"}
              </p>
              <h2
                id="quick-booking-title"
                className="mt-1.5 font-display text-[28px] leading-none tracking-wide"
              >
                {view === "success" || view === "account" || view === "account-done" ? (
                  "REQUEST SENT."
                ) : (
                  <>
                    BOOK YOUR <span className="text-signal">DETAIL</span>
                  </>
                )}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="press flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/7 text-ink-foreground/50 hover:bg-white/15 hover:text-ink-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {view === "form" ? (
            <div className="flex items-start">
              {STEP_LABELS.map((label, i) => {
                const stepNum = (i + 1) as Step;
                const isDone = stepNum < step;
                const isActive = stepNum === step;
                return (
                  <div
                    key={label}
                    className={`flex items-start ${i < STEP_LABELS.length - 1 ? "flex-1" : ""}`}
                  >
                    <div className="flex flex-shrink-0 flex-col items-center gap-1.5">
                      <div
                        className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full font-sans text-[10px] font-bold transition-colors ${
                          isDone
                            ? "bg-success text-success-foreground"
                            : isActive
                              ? "bg-signal text-signal-foreground"
                              : "bg-white/12 text-ink-foreground/40"
                        }`}
                      >
                        {isDone ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : stepNum}
                      </div>
                      <span
                        className={`whitespace-nowrap font-sans text-[9px] font-semibold uppercase tracking-wide ${
                          isActive ? "text-ink-foreground" : "text-ink-foreground/35"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {i < STEP_LABELS.length - 1 ? (
                      <div
                        className={`mx-1 mt-[10px] h-0.5 flex-1 transition-colors ${
                          isDone ? "bg-success" : "bg-white/12"
                        }`}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {view === "form" && step === 1 ? (
            <div className="flex flex-col gap-7">
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-signal">
                  Vehicle
                </p>
                <p className="eyebrow mb-2.5 text-muted-foreground">What size is your vehicle?</p>
                <div className="flex gap-1.5">
                  {(Object.entries(VEHICLE_SIZE_LABELS) as [VehicleSize, string][]).map(
                    ([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setVehicleSize(key)}
                        className={`flex-1 rounded-xl border px-2 py-3.5 text-center text-[12.5px] font-semibold transition-colors ${
                          vehicleSize === key
                            ? "border-ink bg-ink text-ink-foreground"
                            : "border-input bg-surface-2 text-muted-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-signal">
                  Package
                </p>
                <p className="eyebrow mb-2.5 text-muted-foreground">Choose your package</p>
                <div className="flex flex-col gap-1.5">
                  {DETAIL_PACKAGES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPackageId(p.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4.5 py-4 text-left transition-colors ${
                        packageId === p.id
                          ? "border-ink bg-ink text-ink-foreground"
                          : "border-input bg-surface"
                      }`}
                    >
                      <div>
                        <span
                          className={`mb-0.5 block text-[15px] font-semibold ${packageId === p.id ? "text-ink-foreground" : "text-foreground"}`}
                        >
                          {p.name}
                        </span>
                        <span
                          className={`text-[12px] ${packageId === p.id ? "text-ink-foreground/40" : "text-muted-foreground"}`}
                        >
                          {p.tagline} · {p.durationLabel}
                        </span>
                      </div>
                      <span
                        className={`font-display ml-3 flex-shrink-0 text-right text-[22px] ${packageId === p.id ? "text-signal" : "text-muted-foreground/60"}`}
                      >
                        {vehicleSize
                          ? `£${p.priceBySize[vehicleSize]}`
                          : `£${Math.min(...Object.values(p.priceBySize))}–£${Math.max(...Object.values(p.priceBySize))}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-signal">
                  Add-ons
                </p>
                <p className="eyebrow mb-2.5 text-muted-foreground">Optional extras</p>
                <div className="flex flex-col gap-1.5">
                  {DETAIL_ADDONS.map((addon) => {
                    const selected = addonIds.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        onClick={() => toggleAddon(addon.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                          selected ? "border-signal bg-signal/6" : "border-input bg-surface"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] border-[1.5px] ${
                              selected ? "border-signal bg-signal" : "border-input"
                            }`}
                          >
                            {selected ? (
                              <Check
                                className="h-2.5 w-2.5 text-signal-foreground"
                                strokeWidth={3}
                              />
                            ) : null}
                          </span>
                          <span
                            className={`text-[13px] font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {addon.label}
                          </span>
                        </div>
                        <span
                          className={`font-display flex-shrink-0 text-[16px] ${selected ? "text-signal" : "text-muted-foreground/50"}`}
                        >
                          +£{addon.price}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-ink px-6 py-5 text-ink-foreground">
                <div>
                  <p className="eyebrow mb-1 text-ink-foreground/30">
                    {totalPrice !== null ? "Your Price" : "Price Range"}
                  </p>
                  <span className="font-display text-[36px] leading-none">
                    {totalPrice !== null
                      ? `£${totalPrice}`
                      : selectedPackage
                        ? `£${Math.min(...Object.values(selectedPackage.priceBySize))}–£${Math.max(...Object.values(selectedPackage.priceBySize))}`
                        : "Select above"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {view === "form" && step === 2 ? (
            <div className="flex flex-col gap-7">
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-signal">
                  Date &amp; Time
                </p>
                <div className="flex flex-col gap-5">
                  <div>
                    <label className="eyebrow block text-muted-foreground">Preferred Date</label>
                    <input
                      type="date"
                      required
                      min={ukNow().date}
                      value={date}
                      onChange={(e) => {
                        const next = e.target.value;
                        setDate(next);
                        if (time && next && !isSlotAvailable(next, time)) setTime("");
                      }}
                      className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
                    />
                  </div>
                  <div>
                    <label className="eyebrow block text-muted-foreground">
                      Preferred Time Slot
                    </label>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {TIME_SLOTS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          disabled={Boolean(date) && !isSlotAvailable(date, t)}
                          aria-pressed={time === t}
                          onClick={() => setTime(t)}
                          className={`rounded-xl border px-2 py-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-35 ${
                            time === t
                              ? "border-ink bg-ink text-ink-foreground"
                              : "border-input bg-surface-2 text-muted-foreground"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-hairline pt-6">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-signal">
                  Location &amp; Vehicle
                </p>
                <div className="flex flex-col gap-5">
                  <div>
                    <label className="eyebrow block text-muted-foreground">Service Postcode</label>
                    <input
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                      onBlur={() => setTouched((t) => ({ ...t, postcode: true }))}
                      placeholder="Enter your postcode"
                      maxLength={8}
                      className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium uppercase tracking-wide outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
                    />
                    {touched["postcode"] && postcode.trim() && !postcodeValid ? (
                      <p className="mt-1.5 text-[12px] text-destructive">
                        That doesn&rsquo;t look like a valid UK postcode.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="eyebrow block text-muted-foreground">
                      Vehicle Registration
                    </label>
                    <input
                      value={carReg}
                      onChange={(e) => setCarReg(e.target.value.toUpperCase())}
                      onBlur={() => setTouched((t) => ({ ...t, carReg: true }))}
                      placeholder="e.g. AB12 CDE"
                      maxLength={8}
                      className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium uppercase tracking-wide outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
                    />
                    {touched["carReg"] && carReg.trim() && !carRegValid ? (
                      <p className="mt-1.5 text-[12px] text-destructive">
                        That doesn&rsquo;t look like a valid registration.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {view === "form" && step === 3 ? (
            <div className="flex flex-col gap-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-signal">
                Your Details
              </p>

              <div>
                <label className="eyebrow block text-muted-foreground">Full Name (optional)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
                />
              </div>

              <div>
                <label className="eyebrow block text-muted-foreground">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  placeholder="07700 900000"
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
                />
                {touched["phone"] && phone.trim() && !phoneValid ? (
                  <p className="mt-1.5 text-[12px] text-destructive">
                    Please enter a valid phone number.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="eyebrow block text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  placeholder="john@example.com"
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
                />
                {touched["email"] && email.trim() && !emailValid ? (
                  <p className="mt-1.5 text-[12px] text-destructive">
                    Please enter a valid email address.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="eyebrow block text-muted-foreground">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Access notes, specific concerns..."
                  rows={3}
                  maxLength={1000}
                  className="mt-2 w-full resize-none rounded-xl border border-input bg-surface-2 px-3.5 py-3 text-base font-medium outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
                />
              </div>

              <div className="rounded-xl border-t-[3px] border-signal bg-surface-2 p-5">
                <p className="eyebrow mb-3.5 text-muted-foreground">Booking Summary</p>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      ["Pack", selectedPackage?.name ?? "Not set"],
                      ["Vehicle", vehicleSize ? VEHICLE_SIZE_LABELS[vehicleSize] : "Not set"],
                      ["Reg", carReg || "Not set"],
                      [
                        "Date & Time",
                        date && time ? `${formatShortDate(date)} · ${time}` : "Not set",
                      ],
                      ["Postcode", postcode || "Not set"],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span className="flex-shrink-0 text-[13px] text-muted-foreground">{k}</span>
                      <span className="max-w-[220px] truncate text-right text-[13px] font-semibold text-foreground">
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3.5 flex items-baseline justify-between border-t border-hairline pt-3.5">
                  <span className="eyebrow text-foreground">Total</span>
                  <span className="font-display text-[28px] text-foreground">
                    {totalPrice !== null ? `£${totalPrice}` : "£0"}
                  </span>
                </div>
              </div>

              {apiError ? (
                <div className="rounded-xl border-l-2 border-destructive bg-destructive/8 px-4 py-3.5 text-[13px] text-destructive">
                  {apiError}
                </div>
              ) : null}
            </div>
          ) : null}

          {view === "success" ? (
            <div className="pt-2 text-center">
              <div className="mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-signal">
                <Check className="h-7 w-7 text-signal-foreground" strokeWidth={2.5} />
              </div>
              <h3 className="font-display mb-3 text-[36px] leading-none">REQUEST SENT.</h3>
              {bookingId ? (
                <p className="eyebrow mb-4 text-muted-foreground/70">Ref: {bookingId}</p>
              ) : null}
              <p className="mx-auto mb-7 max-w-[340px] text-[15px] leading-relaxed text-muted-foreground">
                We&rsquo;ll be in touch as soon as possible to confirm your slot on{" "}
                <strong className="text-foreground">{formatBookingDate(date)}</strong> at{" "}
                <strong className="text-foreground">{time}</strong>.
              </p>

              <div className="rounded-xl border border-hairline bg-surface-2 p-6 text-left">
                <p className="eyebrow mb-1 text-muted-foreground">Want to track this booking?</p>
                <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                  Set up an account with the details you just gave us and you&rsquo;ll be able to
                  see your booking status, message us, and earn TTD Rewards on future details.
                </p>
                <PrimaryActionButton type="button" onClick={() => setView("account")}>
                  Set up my account
                </PrimaryActionButton>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="press mt-4 text-[13px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Maybe later
              </button>
            </div>
          ) : null}

          {view === "account" ? (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-signal">
                  Set up your account
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  We&rsquo;ll use the name, email and phone from your booking.
                </p>
              </div>

              <div className="rounded-xl border border-hairline bg-surface-2 p-4">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-semibold text-foreground">{name || "Not given"}</span>
                </div>
                <div className="mt-1.5 flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-semibold text-foreground">{email}</span>
                </div>
              </div>

              <div>
                <label className="eyebrow block text-muted-foreground">Create a password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
                />
              </div>

              {signupError ? (
                <div className="rounded-xl border-l-2 border-destructive bg-destructive/8 px-4 py-3.5 text-[13px] text-destructive">
                  {signupError}
                </div>
              ) : null}

              <PrimaryActionButton type="button" loading={signupSubmitting} onClick={handleSignUp}>
                Create account
              </PrimaryActionButton>
              <button
                type="button"
                onClick={handleClose}
                className="press text-[13px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Skip for now
              </button>
            </div>
          ) : null}

          {view === "account-done" ? (
            <div className="pt-2 text-center">
              <div className="mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-success">
                <Check className="h-7 w-7 text-success-foreground" strokeWidth={2.5} />
              </div>
              <h3 className="font-display mb-3 text-[32px] leading-none">ALMOST THERE.</h3>
              <p className="mx-auto mb-7 max-w-[340px] text-[15px] leading-relaxed text-muted-foreground">
                {needsEmailConfirm
                  ? `We've sent a confirmation link to ${email}. Confirm your email, then sign in to see your booking.`
                  : "Your account is ready."}
              </p>
              <PrimaryActionButton type="button" onClick={handleClose}>
                Done
              </PrimaryActionButton>
            </div>
          ) : null}
        </div>

        {/* Footer nav */}
        {view === "form" ? (
          <div className="flex flex-shrink-0 gap-2.5 border-t border-hairline bg-background px-8 py-4">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setStep((s) => (s - 1) as Step);
                  setApiError("");
                }}
                className="press flex-shrink-0 rounded-xl border border-input px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                ← Back
              </button>
            ) : null}

            {step === 1 ? (
              <PrimaryActionButton
                type="button"
                className="flex-1"
                disabled={!packageId || !vehicleSize}
                onClick={() => setStep(2)}
              >
                {!vehicleSize
                  ? "Select your vehicle size"
                  : !packageId
                    ? "Select a package"
                    : "Next: Schedule"}
              </PrimaryActionButton>
            ) : null}

            {step === 2 ? (
              <PrimaryActionButton
                type="button"
                className="flex-1"
                disabled={!slotOk || !postcodeValid || !carRegValid}
                onClick={() => {
                  setTouched((t) => ({ ...t, postcode: true, carReg: true }));
                  if (slotOk && postcodeValid && carRegValid) setStep(3);
                }}
              >
                {!date
                  ? "Select a date"
                  : !time
                    ? "Select a time"
                    : !postcodeValid
                      ? "Enter your postcode"
                      : !carRegValid
                        ? "Enter vehicle registration"
                        : "Next: Your Details"}
              </PrimaryActionButton>
            ) : null}

            {step === 3 ? (
              <PrimaryActionButton
                type="button"
                className="flex-1"
                loading={submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                  </>
                ) : (
                  "Confirm Booking"
                )}
              </PrimaryActionButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
