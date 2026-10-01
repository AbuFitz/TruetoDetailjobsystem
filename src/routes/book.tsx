import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Plus, TriangleAlert, X } from "lucide-react";
import { TtdLogo } from "@/components/ttd/Header";
import { ThemeToggle } from "@/components/ttd/ThemeToggle";
import { sendBookingEmail, type EmailResult } from "@/lib/portal-email";
import { confirmationNotice } from "@/lib/booking-email";
import { whenParts } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStillPage } from "@/hooks/use-still";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useSession } from "@/hooks/use-session";
import { checkServiceArea, type ServiceAreaResult } from "@/lib/service-area";
import {
  listMyAddresses,
  createAddress,
  type AddressLabel,
  type CustomerAddress,
} from "@/lib/addresses";
import { listMyVehicles, createVehicle, vehicleDescription, type Vehicle } from "@/lib/vehicles";
import { createBooking } from "@/lib/bookings";
import {
  TIME_SLOTS,
  firstAvailableSlot,
  formatBookingDate,
  formatShortDate,
  isSlotAvailable,
  ukNow,
  ukSlotToIso,
} from "@/lib/slots";
import {
  DETAIL_ADDONS,
  DETAIL_PACKAGES,
  VEHICLE_SIZE_GUIDE,
  VEHICLE_SIZE_LABELS,
  VEHICLE_SIZE_NOTE,
  type VehicleSize,
} from "@/lib/constants";

export const Route = createFileRoute("/book")({
  head: () => ({ meta: [{ title: "Book a mobile detail | True To Detail" }] }),
  component: BookingFlow,
});

/**
 * One question per screen. The page is exactly the height of the screen (no
 * page scroll, nothing to zoom into): a black header with the question, a
 * white sheet with the answer, and the main button always in the same place.
 * Every field is 16px so a phone never zooms in on focus.
 */
type Step = "vehicle" | "size" | "package" | "extras" | "when" | "where" | "review" | "done";
type Question = Exclude<Step, "done">;

const QUESTIONS: { key: Question; label: string; title: string; hint: string }[] = [
  { key: "vehicle", label: "Car", title: "Your car", hint: "Which car are we detailing?" },
  { key: "size", label: "Size", title: "Car size", hint: "This sets the price." },
  { key: "package", label: "Package", title: "Package", hint: "Pick the level of detail." },
  { key: "extras", label: "Extras", title: "Extras", hint: "Optional. Add whatever helps." },
  { key: "when", label: "When", title: "Date and time", hint: "Pick a day, then a time." },
  { key: "where", label: "Where", title: "Where to", hint: "We come to you." },
  { key: "review", label: "Send", title: "Check and send", hint: "Last look before it goes." },
];

const fieldClass =
  "min-h-12 w-full rounded-2xl border border-input bg-surface-2 px-4 text-base outline-none focus:border-signal focus:ring-2 focus:ring-signal/30";

/** Seven days starting `offset` days after today, in UK time, as YYYY-MM-DD. */
function weekDates(weekOffset: number): string[] {
  const start = new Date(`${ukNow().date}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + weekOffset * 7 + i);
    return d.toISOString().slice(0, 10);
  });
}

function monthLabel(dates: string[]): string {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(new Date(`${d}T00:00:00Z`));
  const first = fmt(dates[0]!, { month: "long", year: "numeric" });
  const last = fmt(dates[6]!, { month: "long", year: "numeric" });
  return first === last ? first : `${fmt(dates[0]!, { month: "short" })} to ${last}`;
}

function BookingFlow() {
  useStillPage();
  const { session, loading: authLoading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("vehicle");
  const [postcode, setPostcode] = useState("");
  const [areaResult, setAreaResult] = useState<ServiceAreaResult | null>(null);
  const [checkingArea, setCheckingArea] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);

  const [addressChoice, setAddressChoice] = useState<CustomerAddress | "new" | null>(null);
  const [newAddress, setNewAddress] = useState({
    label: "Home" as AddressLabel,
    line1: "",
    line2: "",
    city: "",
  });

  const [vehicleChoice, setVehicleChoice] = useState<Vehicle | "new" | null>(null);
  const [newVehicle, setNewVehicle] = useState({ make: "", model: "", registration: "" });
  const [vehicleSize, setVehicleSize] = useState<VehicleSize>("midsize");

  const [packageId, setPackageId] = useState(DETAIL_PACKAGES[1]!.id);
  const [addonIds, setAddonIds] = useState<string[]>([]);

  const [weekOffset, setWeekOffset] = useState(0);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  const [bookingId, setBookingId] = useState<string | null>(null);
  // What happened to the confirmation email, so the screen can say so honestly.
  const [emailResult, setEmailResult] = useState<EmailResult | null>(null);

  const { data: addresses } = useQuery({
    queryKey: ["my-addresses"],
    queryFn: listMyAddresses,
    enabled: Boolean(session),
  });
  const { data: vehicles } = useQuery({
    queryKey: ["my-vehicles"],
    queryFn: listMyVehicles,
    enabled: Boolean(session),
  });

  useEffect(() => {
    if (addresses && addressChoice === null) {
      setAddressChoice(
        addresses.length > 0 ? (addresses.find((a) => a.is_default) ?? addresses[0]!) : "new",
      );
    }
  }, [addresses, addressChoice]);

  useEffect(() => {
    if (vehicles && vehicleChoice === null) {
      setVehicleChoice(vehicles.length > 0 ? vehicles[0]! : "new");
    }
  }, [vehicles, vehicleChoice]);

  const selectedPackage = DETAIL_PACKAGES.find((p) => p.id === packageId)!;
  const addonTotal = DETAIL_ADDONS.filter((a) => addonIds.includes(a.id)).reduce(
    (s, a) => s + a.price,
    0,
  );
  const totalPrice = selectedPackage.priceBySize[vehicleSize] + addonTotal;

  async function handlePostcodeSubmit() {
    setAreaError(null);
    setCheckingArea(true);
    try {
      const result = await checkServiceArea(postcode);
      setAreaResult(result);
    } catch (err) {
      setAreaError(err instanceof Error ? err.message : "Couldn't check that postcode.");
    } finally {
      setCheckingArea(false);
    }
  }

  const createAddressMutation = useMutation({
    mutationFn: () =>
      createAddress({
        label: newAddress.label,
        line1: newAddress.line1,
        line2: newAddress.line2 || undefined,
        city: newAddress.city || undefined,
        postcode: areaResult!.postcode,
        lat: areaResult!.lat,
        lng: areaResult!.lng,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
      setAddressChoice(created);
      setStep("review");
    },
  });

  const submitBooking = useMutation({
    mutationFn: async () => {
      const address = addressChoice === "new" ? null : addressChoice;
      let vehicle = vehicleChoice === "new" ? null : vehicleChoice;

      if (vehicleChoice === "new") {
        vehicle = await createVehicle({
          make: newVehicle.make || undefined,
          model: newVehicle.model || undefined,
          registration: newVehicle.registration.toUpperCase(),
        });
        queryClient.invalidateQueries({ queryKey: ["my-vehicles"] });
      }
      if (!vehicle) throw new Error("Select or add a vehicle first.");
      if (!address) throw new Error("Select or add an address first.");

      if (!isSlotAvailable(date, time)) {
        throw new Error("That time has already passed. Please pick a later slot or another day.");
      }

      // A portal booking is a request: it is not locked in until the team approves it.
      const booking = await createBooking({
        vehicle_id: vehicle.id,
        vehicle_registration: vehicle.registration,
        vehicle_description: vehicleDescription(vehicle) ?? undefined,
        address_id: address.id,
        service_address_line1: address.line1,
        service_address_line2: address.line2 ?? undefined,
        service_address_city: address.city ?? undefined,
        service_postcode: address.postcode,
        destination_lat: address.lat ?? undefined,
        destination_lng: address.lng ?? undefined,
        package_id: selectedPackage.id,
        package_name: selectedPackage.name,
        vehicle_size: vehicleSize,
        addon_ids: addonIds,
        addon_labels: DETAIL_ADDONS.filter((a) => addonIds.includes(a.id)).map((a) => a.label),
        price: totalPrice,
        scheduled_start: ukSlotToIso(date, time),
        estimated_duration_minutes: selectedPackage.durationMinutes,
        customer_notes: notes || undefined,
      });
      // Neither throws: the request is saved either way, and the screen reports what happened.
      const [received, staff] = await Promise.all([
        sendBookingEmail(booking.id, "received"),
        sendBookingEmail(booking.id, "staff_alert"),
      ]);
      const email: EmailResult = { ...received, staffNotified: staff.sent };
      return { booking, email };
    },
    onSuccess: ({ booking, email }) => {
      setBookingId(booking.id);
      setEmailResult(email);
      setStep("done");
    },
  });

  const notice = confirmationNotice(emailResult, session?.user.email);

  // Signed-out visitors are sent to sign in, then straight back here.
  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/account/login", search: { next: "/book" } });
  }, [authLoading, session, navigate]);

  if (authLoading || !session) {
    return (
      <div className="min-h-dvh bg-background">
        <BrandedLoading label="Loading" />
      </div>
    );
  }

  const at = step === "done" ? QUESTIONS.length : QUESTIONS.findIndex((q) => q.key === step);
  const question = step === "done" ? null : QUESTIONS[at]!;
  // No price until the package step, where the customer first sees what things cost.
  const priced = at >= QUESTIONS.findIndex((q) => q.key === "package");

  const vehicleText =
    vehicleChoice === "new"
      ? [newVehicle.make, newVehicle.model].filter(Boolean).join(" ") || "New car"
      : vehicleChoice
        ? (vehicleDescription(vehicleChoice) ?? "Your car")
        : "";
  const vehicleReg =
    vehicleChoice === "new"
      ? newVehicle.registration.toUpperCase()
      : (vehicleChoice?.registration ?? "");
  const addressText =
    addressChoice === "new"
      ? [newAddress.line1, areaResult?.postcode].filter(Boolean).join(", ")
      : addressChoice
        ? `${addressChoice.line1}, ${addressChoice.postcode}`
        : "";
  const whenText = date && time ? `${formatShortDate(date)}, ${time}` : "";
  const addonText = DETAIL_ADDONS.filter((a) => addonIds.includes(a.id))
    .map((a) => a.label)
    .join(", ");

  const canContinue: Record<Question, boolean> = {
    vehicle:
      vehicleChoice !== null &&
      (vehicleChoice !== "new" || Boolean(newVehicle.registration.trim())),
    size: true,
    package: true,
    extras: true,
    when: Boolean(date) && Boolean(time) && isSlotAvailable(date, time),
    where:
      addressChoice !== null &&
      (addressChoice !== "new" ||
        (Boolean(areaResult?.covered) && Boolean(newAddress.line1.trim()))),
    review: true,
  };

  function next() {
    if (step === "where" && addressChoice === "new") {
      createAddressMutation.mutate();
      return;
    }
    if (step === "review") {
      submitBooking.mutate();
      return;
    }
    const i = QUESTIONS.findIndex((q) => q.key === step);
    const target = QUESTIONS[i + 1];
    if (target) setStep(target.key);
  }

  function back() {
    const i = QUESTIONS.findIndex((q) => q.key === step);
    const target = QUESTIONS[i - 1];
    if (target) setStep(target.key);
  }

  // Only what has been answered already, so the panel never shows a default as a choice.
  const summary: { label: string; value: string; after: number }[] = [
    {
      label: "Car",
      value: vehicleText ? `${vehicleText}${vehicleReg ? ` (${vehicleReg})` : ""}` : "",
      after: 0,
    },
    { label: "Size", value: VEHICLE_SIZE_LABELS[vehicleSize], after: 1 },
    { label: "Package", value: selectedPackage.name, after: 2 },
    { label: "Extras", value: addonText, after: 3 },
    { label: "When", value: whenText, after: 4 },
    { label: "Where", value: addressText, after: 5 },
  ].filter((r) => r.value && at > r.after);

  return (
    <main className="flex h-dvh touch-manipulation flex-col overflow-hidden bg-ink text-ink-foreground lg:flex-row">
      {/* Header on a phone, left-hand panel on a desktop. */}
      <header className="shrink-0 px-5 pb-4 pt-3 lg:flex lg:w-[420px] lg:flex-col lg:px-10 lg:pb-10 lg:pt-8 xl:w-[480px]">
        <div className="flex items-center justify-between gap-3">
          <Link to="/account" aria-label="True To Detail, home" className="press inline-block">
            <TtdLogo tone="light" size="md" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle className="border-white/15 bg-white/5 text-ink-foreground/70 hover:text-ink-foreground" />
            <Link
              to="/account"
              aria-label="Close booking"
              className="press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-ink-foreground/70 hover:text-ink-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
            </Link>
          </div>
        </div>

        {step === "done" ? (
          <div className="mt-4 lg:mt-14">
            <p className="eyebrow text-ink-foreground/55">Request sent</p>
            <h1 className="mt-1 font-display text-[36px] leading-[0.9] lg:text-[64px]">
              THANK YOU<span className="text-signal">.</span>
            </h1>
          </div>
        ) : (
          <>
            <ol aria-label="Booking steps" className="mt-3 grid grid-cols-7 gap-1 lg:mt-14">
              {QUESTIONS.map((q, i) => {
                const done = i < at;
                const now = i === at;
                return (
                  <li key={q.key} aria-current={now ? "step" : undefined} className="min-w-0">
                    {done ? (
                      <button
                        type="button"
                        onClick={() => setStep(q.key)}
                        aria-label={`Go back to ${q.label}`}
                        className="group block h-5 w-full"
                      >
                        <span className="mt-2 block h-1.5 rounded-sm bg-signal group-hover:bg-signal-deep" />
                      </button>
                    ) : (
                      <span className="block h-5">
                        <span
                          className={cn(
                            "mt-2 block h-1.5 rounded-sm",
                            now ? "bg-signal" : "bg-ink-foreground/18",
                          )}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="eyebrow mt-2 text-ink-foreground/55">
              Step {at + 1} of {QUESTIONS.length}
            </p>
            <h1 className="mt-1 font-display text-[36px] leading-[0.9] lg:text-[64px]">
              {question!.title.toUpperCase()}
              <span className="text-signal">.</span>
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-foreground/60 lg:mt-3 lg:text-[15px]">
              {question!.hint}
            </p>

            <div className="mt-auto hidden lg:block">
              {summary.length ? (
                <dl className="mb-6 divide-y divide-white/10 border-y border-white/10 text-[14px]">
                  {summary.map((r) => (
                    <div key={r.label} className="flex items-start justify-between gap-4 py-2.5">
                      <dt className="text-ink-foreground/55">{r.label}</dt>
                      <dd className="text-right font-medium">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {priced ? (
                <>
                  <p className="eyebrow text-ink-foreground/55">Total so far</p>
                  <p className="font-display text-[56px] leading-none" aria-hidden>
                    £{totalPrice}
                  </p>
                </>
              ) : null}
            </div>
          </>
        )}
      </header>

      {/* The sheet: the answer, and the button, always in the same place. */}
      <section
        aria-label={question ? question.title : "Request sent"}
        className="flex min-h-0 flex-1 flex-col rounded-t-3xl bg-background text-foreground lg:rounded-l-3xl lg:rounded-tr-none"
      >
        <div
          data-testid="book-scroll"
          className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-y-auto overscroll-contain px-5 pb-3 pt-5 lg:px-10 lg:pt-28"
        >
          {step === "vehicle" ? (
            <div className="flex flex-col gap-2.5">
              {(vehicles ?? []).map((v) => (
                <ChoiceCard
                  key={v.id}
                  selected={vehicleChoice !== "new" && vehicleChoice?.id === v.id}
                  onClick={() => setVehicleChoice(v)}
                >
                  <div className="flex items-center gap-2">
                    {vehicleDescription(v) ? (
                      <p className="text-[15px] font-semibold">{vehicleDescription(v)}</p>
                    ) : null}
                    <PlateTag registration={v.registration} />
                  </div>
                </ChoiceCard>
              ))}
              <ChoiceCard
                selected={vehicleChoice === "new"}
                onClick={() => setVehicleChoice("new")}
                icon={<Plus className="h-3 w-3" strokeWidth={3.4} />}
              >
                <p className="text-[15px] font-semibold">Add a new car</p>
              </ChoiceCard>
              {vehicleChoice === "new" ? (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    value={newVehicle.make}
                    onChange={(e) => setNewVehicle((s) => ({ ...s, make: e.target.value }))}
                    placeholder="Make"
                    aria-label="Make"
                    autoComplete="off"
                    className={fieldClass}
                  />
                  <input
                    value={newVehicle.model}
                    onChange={(e) => setNewVehicle((s) => ({ ...s, model: e.target.value }))}
                    placeholder="Model"
                    aria-label="Model"
                    autoComplete="off"
                    className={fieldClass}
                  />
                  <input
                    value={newVehicle.registration}
                    onChange={(e) => setNewVehicle((s) => ({ ...s, registration: e.target.value }))}
                    placeholder="Registration"
                    aria-label="Registration"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className={cn(fieldClass, "col-span-2 uppercase")}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "size" ? (
            <div>
              <div role="radiogroup" aria-label="Vehicle size" className="flex flex-col gap-2">
                {(Object.keys(VEHICLE_SIZE_LABELS) as VehicleSize[]).map((size) => (
                  <ChoiceCard
                    key={size}
                    radio
                    compact
                    selected={vehicleSize === size}
                    onClick={() => setVehicleSize(size)}
                  >
                    <p className="text-[15px] font-semibold">{VEHICLE_SIZE_LABELS[size]}</p>
                    <p className="text-[13px] leading-snug text-foreground/80">
                      {VEHICLE_SIZE_GUIDE[size].body}
                    </p>
                    <p className="text-[11.5px] leading-snug text-muted-foreground">
                      {VEHICLE_SIZE_GUIDE[size].examples}
                    </p>
                  </ChoiceCard>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
                {VEHICLE_SIZE_NOTE}
              </p>
            </div>
          ) : null}

          {step === "package" ? (
            <div role="radiogroup" aria-label="Package" className="flex flex-col gap-2.5">
              {DETAIL_PACKAGES.map((p) => (
                <ChoiceCard
                  key={p.id}
                  radio
                  selected={packageId === p.id}
                  onClick={() => setPackageId(p.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">{p.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {p.tagline} · {p.durationLabel}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-[28px] leading-none">
                      £{p.priceBySize[vehicleSize]}
                    </p>
                  </div>
                </ChoiceCard>
              ))}
            </div>
          ) : null}

          {step === "extras" ? (
            <div className="flex flex-col gap-2">
              {DETAIL_ADDONS.map((a) => (
                <label
                  key={a.id}
                  className="press flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface p-3.5 has-[:checked]:border-signal has-[:checked]:bg-signal/8 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal/40"
                >
                  <span className="flex items-center gap-3 text-[14px] font-medium">
                    <input
                      type="checkbox"
                      checked={addonIds.includes(a.id)}
                      onChange={(e) =>
                        setAddonIds((prev) =>
                          e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                        )
                      }
                      className="h-5 w-5 rounded-md border-input accent-[var(--color-signal)]"
                    />
                    {a.label}
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">
                    +£{a.price}
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {step === "when" ? (
            <WhenPicker
              weekOffset={weekOffset}
              onWeek={setWeekOffset}
              date={date}
              time={time}
              onDate={(d) => {
                setDate(d);
                if (time && !isSlotAvailable(d, time)) setTime("");
              }}
              onTime={setTime}
            />
          ) : null}

          {step === "where" ? (
            addressChoice === "new" ? (
              <div>
                {(addresses ?? []).length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAddressChoice((addresses ?? [])[0] ?? null)}
                    className="press -ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" /> Use a saved address
                  </button>
                ) : null}
                <p className="text-[14px] text-muted-foreground">
                  Enter the postcode and we will check we cover your area.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder="e.g. HP2 6EL"
                    aria-label="Postcode"
                    autoComplete="postal-code"
                    autoCapitalize="characters"
                    className={cn(fieldClass, "min-w-0 flex-1 font-medium uppercase")}
                  />
                  <PrimaryActionButton
                    className="w-auto px-6"
                    loading={checkingArea}
                    onClick={handlePostcodeSubmit}
                  >
                    Check
                  </PrimaryActionButton>
                </div>
                {areaResult ? (
                  areaResult.covered ? (
                    <p className="mt-3 flex items-center gap-2 text-[14px] font-medium text-success">
                      <Check className="h-4 w-4" strokeWidth={3} /> We cover your area
                    </p>
                  ) : (
                    <p className="mt-3 flex items-center gap-2 text-[14px] font-medium text-destructive">
                      <TriangleAlert className="h-4 w-4" /> This address is currently outside our
                      mobile service area.
                    </p>
                  )
                ) : null}
                {areaError ? (
                  <p className="mt-3 text-[13px] text-destructive">{areaError}</p>
                ) : null}
                {areaResult?.covered ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="grid grid-cols-3 gap-2">
                      {(["Home", "Work", "Other"] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setNewAddress((s) => ({ ...s, label: l }))}
                          className={cn(
                            "press min-h-11 rounded-full border text-[13px] font-semibold",
                            newAddress.label === l
                              ? "border-signal bg-signal text-signal-foreground"
                              : "border-input bg-surface-2",
                          )}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <input
                      value={newAddress.line1}
                      onChange={(e) => setNewAddress((s) => ({ ...s, line1: e.target.value }))}
                      placeholder="Address line 1"
                      aria-label="Address line 1"
                      autoComplete="address-line1"
                      className={fieldClass}
                    />
                    <input
                      value={newAddress.city}
                      onChange={(e) => setNewAddress((s) => ({ ...s, city: e.target.value }))}
                      placeholder="Town / city"
                      aria-label="Town or city"
                      autoComplete="address-level2"
                      className={fieldClass}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {(addresses ?? []).map((a) => (
                  <ChoiceCard
                    key={a.id}
                    selected={addressChoice !== null && addressChoice.id === a.id}
                    onClick={() => setAddressChoice(a)}
                  >
                    <p className="text-[15px] font-semibold">{a.label}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {a.line1} · {a.postcode}
                    </p>
                  </ChoiceCard>
                ))}
                <ChoiceCard
                  selected={false}
                  onClick={() => setAddressChoice("new")}
                  icon={<Plus className="h-3 w-3" strokeWidth={3.4} />}
                >
                  <p className="text-[15px] font-semibold">Another address</p>
                </ChoiceCard>
              </div>
            )
          ) : null}

          {step === "review" ? (
            <div>
              <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
                <div className="flex items-end justify-between gap-4 bg-ink px-4 py-3 text-ink-foreground">
                  <p className="font-display text-[26px] leading-none">{whenText}</p>
                  <p className="font-display text-[26px] leading-none">£{totalPrice}</p>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <SummaryRow label="Package">{selectedPackage.name}</SummaryRow>
                  <SummaryRow label="Car">
                    {vehicleText}
                    {vehicleReg ? ` (${vehicleReg})` : ""} · {VEHICLE_SIZE_LABELS[vehicleSize]}
                  </SummaryRow>
                  <SummaryRow label="Where">{addressText}</SummaryRow>
                  {addonText ? <SummaryRow label="Extras">{addonText}</SummaryRow> : null}
                </div>
              </div>
              <label className="mt-3 block">
                <span className="eyebrow block text-muted-foreground">
                  Anything we should know? (optional)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-2xl border border-input bg-surface-2 px-4 py-3 text-base outline-none focus:border-signal focus:ring-2 focus:ring-signal/30"
                />
              </label>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                This sends us a request. It is not locked in until we confirm it with you. Payment
                is on the day.
              </p>
              {submitBooking.isError ? (
                <p role="alert" className="mt-2 text-[13px] text-destructive">
                  {submitBooking.error instanceof Error
                    ? submitBooking.error.message
                    : "Couldn't send this request."}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "done" && bookingId ? (
            <div className="flex h-full flex-col justify-center py-4">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-success/12 text-success">
                <Check className="h-6 w-6" strokeWidth={3} />
              </div>
              <h2 className="mt-4 font-display text-[30px] leading-tight">Request sent</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                You asked for{" "}
                {whenParts(ukSlotToIso(date, time)).today ? "today" : formatBookingDate(date)} at{" "}
                {time}. It is not locked in yet. We will check the slot and confirm it with you
                first, and if anything needs changing we will call or text you before we change it.
              </p>
              {notice ? (
                notice.tone === "ok" ? (
                  <p
                    role="status"
                    className="mt-4 inline-flex items-center gap-2 text-[14px] font-semibold"
                  >
                    <Check className="h-4 w-4 text-success" strokeWidth={3} />
                    {notice.text}
                  </p>
                ) : (
                  <p
                    role="status"
                    className="mt-4 rounded-2xl border border-warning/40 bg-warning/8 px-4 py-3 text-[14px] leading-relaxed"
                  >
                    {notice.text}
                  </p>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-hairline bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:px-10">
          <div className="mx-auto flex w-full max-w-lg items-center gap-2">
            {step === "done" ? (
              bookingId ? (
                <Link to="/account/bookings/$id" params={{ id: bookingId }} className="w-full">
                  <PrimaryActionButton>View request</PrimaryActionButton>
                </Link>
              ) : null
            ) : (
              <>
                {at > 0 ? (
                  <PrimaryActionButton
                    variant="outline"
                    className="w-auto shrink-0 px-5"
                    aria-label="Back"
                    onClick={back}
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={2.6} />
                    Back
                  </PrimaryActionButton>
                ) : null}
                <PrimaryActionButton
                  className="flex-1"
                  loading={createAddressMutation.isPending || submitBooking.isPending}
                  disabled={!canContinue[step]}
                  onClick={next}
                >
                  {step === "review" ? (
                    "Send request"
                  ) : (
                    <>
                      {priced ? `Continue · £${totalPrice}` : "Continue"}
                      <ChevronRight className="h-4 w-4" strokeWidth={2.6} />
                    </>
                  )}
                </PrimaryActionButton>
              </>
            )}
          </div>
        </footer>
      </section>
    </main>
  );
}

function WhenPicker({
  weekOffset,
  onWeek,
  date,
  time,
  onDate,
  onTime,
}: {
  weekOffset: number;
  onWeek: (n: number) => void;
  date: string;
  time: string;
  onDate: (d: string) => void;
  onTime: (t: string) => void;
}) {
  const days = weekDates(weekOffset);
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {monthLabel(days)}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Earlier week"
            disabled={weekOffset === 0}
            onClick={() => onWeek(weekOffset - 1)}
            className="press grid h-11 w-11 place-items-center rounded-full border border-hairline bg-surface disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Later week"
            disabled={weekOffset >= 11}
            onClick={() => onWeek(weekOffset + 1)}
            className="press grid h-11 w-11 place-items-center rounded-full border border-hairline bg-surface disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div role="group" aria-label="Day" className="mt-2 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const full = firstAvailableSlot(d) === null;
          const [wd, dayNum] = formatShortDate(d).split(" ");
          const selected = date === d;
          return (
            <button
              key={d}
              type="button"
              disabled={full}
              aria-pressed={selected}
              aria-label={formatBookingDate(d)}
              onClick={() => onDate(d)}
              className={cn(
                "press flex min-h-16 flex-col items-center justify-center rounded-xl border text-center disabled:cursor-not-allowed disabled:opacity-35",
                selected
                  ? "border-signal bg-signal text-signal-foreground"
                  : "border-input bg-surface-2 hover:bg-surface",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                {wd}
              </span>
              <span className="font-display text-[24px] leading-none">{dayNum}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[13px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Time
      </p>
      <div role="group" aria-label="Time" className="mt-2 grid grid-cols-3 gap-2">
        {TIME_SLOTS.map((t) => {
          const unavailable = !date || !isSlotAvailable(date, t);
          return (
            <button
              key={t}
              type="button"
              disabled={unavailable}
              aria-pressed={time === t}
              onClick={() => onTime(t)}
              className={cn(
                "press min-h-12 rounded-full border text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-35",
                time === t
                  ? "border-signal bg-signal text-signal-foreground"
                  : "border-input bg-surface-2 hover:bg-surface",
              )}
            >
              {t}
            </button>
          );
        })}
      </div>
      {!date ? (
        <p className="mt-2 text-[12px] text-muted-foreground">Pick a day to see the times.</p>
      ) : null}
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  radio,
  compact,
  icon,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  /** Part of a one-of-several group, so it is announced that way. */
  radio?: boolean;
  /** Tighter padding, for the step with the most to read. */
  compact?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={radio ? "radio" : undefined}
      aria-checked={radio ? selected : undefined}
      aria-pressed={radio ? undefined : selected}
      onClick={onClick}
      className={cn(
        "press flex min-h-14 items-center gap-3.5 rounded-2xl border px-4 text-left",
        compact ? "py-2" : "py-3",
        selected
          ? "border-signal bg-signal/8 shadow-[0_0_0_1px_var(--color-signal)]"
          : "border-hairline bg-surface hover:bg-surface-2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
          selected ? "border-signal bg-signal text-signal-foreground" : "border-input bg-surface",
        )}
      >
        {selected ? <Check className="h-3 w-3" strokeWidth={3.4} /> : (icon ?? null)}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[14px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
