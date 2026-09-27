import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, CheckCircle2, ChevronLeft, TriangleAlert } from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
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
  DETAIL_ADDONS,
  DETAIL_PACKAGES,
  VEHICLE_SIZE_LABELS,
  type VehicleSize,
} from "@/lib/constants";

export const Route = createFileRoute("/book")({
  head: () => ({ meta: [{ title: "Book a mobile detail | True To Detail" }] }),
  component: BookingFlow,
});

type Step = "postcode" | "address" | "vehicle" | "package" | "schedule" | "review" | "done";

const TIME_SLOTS = ["8:00 AM", "10:00 AM", "12:00 PM", "2:00 PM", "4:00 PM", "6:00 PM"];

function BookingFlow() {
  const { session, loading: authLoading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("postcode");
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

  const [date, setDate] = useState("");
  const [time, setTime] = useState(TIME_SLOTS[1]!);
  const [notes, setNotes] = useState("");

  const [bookingId, setBookingId] = useState<string | null>(null);

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
    if (addresses && addresses.length > 0 && addressChoice === null) {
      setAddressChoice(addresses.find((a) => a.is_default) ?? addresses[0]!);
    }
  }, [addresses, addressChoice]);

  useEffect(() => {
    if (vehicles && vehicles.length > 0 && vehicleChoice === null) {
      setVehicleChoice(vehicles[0]!);
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
      if (result.covered) {
        if (!session) {
          navigate({ to: "/account/login", search: { next: "/book" } });
          return;
        }
        setStep("address");
      }
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
      setStep("vehicle");
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

      const [hour, minutePeriod] = parseTimeSlot(time);
      const scheduledStart = new Date(date);
      scheduledStart.setHours(hour, minutePeriod, 0, 0);

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
        scheduled_start: scheduledStart.toISOString(),
        estimated_duration_minutes: selectedPackage.durationMinutes,
        customer_notes: notes || undefined,
      });
      return booking;
    },
    onSuccess: (booking) => {
      setBookingId(booking.id);
      setStep("done");
    },
  });

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <BrandedLoading label="Loading" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-16">
      <TtdHeader homeTo="/" eyebrow="Book a mobile detail" containerClassName="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        {step !== "postcode" && step !== "done" ? (
          <button
            type="button"
            onClick={() => setStep(prevStep(step))}
            className="press mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        ) : null}

        {step === "postcode" ? (
          <section>
            <h1 className="font-display text-[30px] leading-none">
              Where should we detail the vehicle?
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Enter your postcode and we'll check we cover your area.
            </p>
            <div className="mt-5 flex gap-2">
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="e.g. HP2 6EL"
                className="min-h-12 flex-1 rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium uppercase outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
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
                  <TriangleAlert className="h-4 w-4" /> This address is currently outside our mobile
                  service area.
                </p>
              )
            ) : null}
            {areaError ? <p className="mt-3 text-[13px] text-destructive">{areaError}</p> : null}
          </section>
        ) : null}

        {step === "address" ? (
          <section>
            <h1 className="font-display text-[28px] leading-none">Where should we come?</h1>
            <div className="mt-5 flex flex-col gap-2.5">
              {(addresses ?? []).map((a) => (
                <ChoiceCard
                  key={a.id}
                  selected={addressChoice !== "new" && addressChoice?.id === a.id}
                  onClick={() => setAddressChoice(a)}
                >
                  <p className="text-[14px] font-semibold">{a.label}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {a.line1} · {a.postcode}
                  </p>
                </ChoiceCard>
              ))}
              <ChoiceCard
                selected={addressChoice === "new"}
                onClick={() => setAddressChoice("new")}
              >
                <p className="text-[14px] font-semibold">Another address</p>
                <p className="text-[13px] text-muted-foreground">Postcode {areaResult?.postcode}</p>
              </ChoiceCard>
            </div>

            {addressChoice === "new" ? (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-4">
                <div className="grid grid-cols-3 gap-2">
                  {(["Home", "Work", "Other"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setNewAddress((s) => ({ ...s, label: l }))}
                      className={`min-h-9 rounded-lg border text-[13px] font-semibold ${newAddress.label === l ? "border-signal bg-signal text-signal-foreground" : "border-input bg-surface-2"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <input
                  value={newAddress.line1}
                  onChange={(e) => setNewAddress((s) => ({ ...s, line1: e.target.value }))}
                  placeholder="Address line 1"
                  className="min-h-11 rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
                <input
                  value={newAddress.city}
                  onChange={(e) => setNewAddress((s) => ({ ...s, city: e.target.value }))}
                  placeholder="Town / city"
                  className="min-h-11 rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
              </div>
            ) : null}

            <PrimaryActionButton
              className="mt-5"
              loading={createAddressMutation.isPending}
              disabled={addressChoice === null}
              onClick={() =>
                addressChoice === "new" ? createAddressMutation.mutate() : setStep("vehicle")
              }
            >
              Continue
            </PrimaryActionButton>
          </section>
        ) : null}

        {step === "vehicle" ? (
          <section>
            <h1 className="font-display text-[28px] leading-none">Which vehicle?</h1>
            <div className="mt-5 flex flex-col gap-2.5">
              {(vehicles ?? []).map((v) => (
                <ChoiceCard
                  key={v.id}
                  selected={vehicleChoice !== "new" && vehicleChoice?.id === v.id}
                  onClick={() => setVehicleChoice(v)}
                >
                  <div className="flex items-center gap-2">
                    {vehicleDescription(v) ? (
                      <p className="text-[14px] font-semibold">{vehicleDescription(v)}</p>
                    ) : null}
                    <PlateTag registration={v.registration} />
                  </div>
                </ChoiceCard>
              ))}
              <ChoiceCard
                selected={vehicleChoice === "new"}
                onClick={() => setVehicleChoice("new")}
              >
                <p className="text-[14px] font-semibold">Add a new vehicle</p>
              </ChoiceCard>
            </div>

            {vehicleChoice === "new" ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <input
                  value={newVehicle.make}
                  onChange={(e) => setNewVehicle((s) => ({ ...s, make: e.target.value }))}
                  placeholder="Make"
                  className="min-h-11 rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
                <input
                  value={newVehicle.model}
                  onChange={(e) => setNewVehicle((s) => ({ ...s, model: e.target.value }))}
                  placeholder="Model"
                  className="min-h-11 rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
                <input
                  value={newVehicle.registration}
                  onChange={(e) => setNewVehicle((s) => ({ ...s, registration: e.target.value }))}
                  placeholder="Registration"
                  className="col-span-2 min-h-11 rounded-xl border border-input bg-surface-2 px-3.5 text-sm uppercase outline-none focus:border-signal"
                />
              </div>
            ) : null}

            <div className="mt-5">
              <span className="eyebrow block text-muted-foreground">Vehicle size</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(Object.keys(VEHICLE_SIZE_LABELS) as VehicleSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setVehicleSize(size)}
                    className={`min-h-11 rounded-xl border text-[12px] font-semibold ${vehicleSize === size ? "border-signal bg-signal text-signal-foreground" : "border-input bg-surface-2"}`}
                  >
                    {VEHICLE_SIZE_LABELS[size]}
                  </button>
                ))}
              </div>
            </div>

            <PrimaryActionButton
              className="mt-5"
              disabled={vehicleChoice === null}
              onClick={() => setStep("package")}
            >
              Continue
            </PrimaryActionButton>
          </section>
        ) : null}

        {step === "package" ? (
          <section>
            <h1 className="font-display text-[28px] leading-none">Choose your package</h1>
            <div className="mt-5 flex flex-col gap-2.5">
              {DETAIL_PACKAGES.map((p) => (
                <ChoiceCard
                  key={p.id}
                  selected={packageId === p.id}
                  onClick={() => setPackageId(p.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[15px] font-semibold">{p.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {p.tagline} · {p.durationLabel}
                      </p>
                    </div>
                    <p className="font-display text-xl">£{p.priceBySize[vehicleSize]}</p>
                  </div>
                </ChoiceCard>
              ))}
            </div>

            <div className="mt-5">
              <span className="eyebrow block text-muted-foreground">Add-ons</span>
              <div className="mt-2 flex flex-col gap-2">
                {DETAIL_ADDONS.map((a) => (
                  <label
                    key={a.id}
                    className="press flex items-center justify-between rounded-xl border border-hairline bg-surface p-3.5"
                  >
                    <span className="flex items-center gap-2.5 text-[14px] font-medium">
                      <input
                        type="checkbox"
                        checked={addonIds.includes(a.id)}
                        onChange={(e) =>
                          setAddonIds((prev) =>
                            e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                          )
                        }
                        className="h-4 w-4 rounded border-input accent-[var(--color-signal)]"
                      />
                      {a.label}
                    </span>
                    <span className="text-[13px] text-muted-foreground">+£{a.price}</span>
                  </label>
                ))}
              </div>
            </div>

            <PrimaryActionButton className="mt-5" onClick={() => setStep("schedule")}>
              Continue · £{totalPrice}
            </PrimaryActionButton>
          </section>
        ) : null}

        {step === "schedule" ? (
          <section>
            <h1 className="font-display text-[28px] leading-none">Pick a date and time</h1>
            <div className="mt-5">
              <span className="eyebrow block text-muted-foreground">Date</span>
              <input
                type="date"
                value={date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base outline-none focus:border-signal"
              />
            </div>
            <div className="mt-4">
              <span className="eyebrow block text-muted-foreground">Time</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {TIME_SLOTS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    className={`min-h-11 rounded-xl border text-[13px] font-semibold ${time === t ? "border-signal bg-signal text-signal-foreground" : "border-input bg-surface-2"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <span className="eyebrow block text-muted-foreground">
                Anything we should know? (optional)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-input bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-signal"
              />
            </div>
            <PrimaryActionButton
              className="mt-5"
              disabled={!date}
              onClick={() => setStep("review")}
            >
              Review booking
            </PrimaryActionButton>
          </section>
        ) : null}

        {step === "review" ? (
          <section>
            <h1 className="font-display text-[28px] leading-none">Confirm your booking</h1>
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-5">
              <SummaryRow label="Package">{selectedPackage.name}</SummaryRow>
              <SummaryRow label="Vehicle">
                {vehicleChoice === "new"
                  ? `${newVehicle.make} ${newVehicle.model} (${newVehicle.registration})`
                  : vehicleChoice
                    ? `${vehicleDescription(vehicleChoice) ?? ""} (${vehicleChoice.registration})`
                    : ""}
              </SummaryRow>
              <SummaryRow label="Address">
                {addressChoice === "new"
                  ? `${newAddress.line1}, ${areaResult?.postcode}`
                  : addressChoice
                    ? `${addressChoice.line1}, ${addressChoice.postcode}`
                    : ""}
              </SummaryRow>
              <SummaryRow label="When">
                {date} · {time}
              </SummaryRow>
              {addonIds.length ? (
                <SummaryRow label="Add-ons">
                  {DETAIL_ADDONS.filter((a) => addonIds.includes(a.id))
                    .map((a) => a.label)
                    .join(", ")}
                </SummaryRow>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-hairline pt-3">
                <p className="font-display text-lg">Total</p>
                <p className="font-display text-2xl">£{totalPrice}</p>
              </div>
            </div>
            {submitBooking.isError ? (
              <p className="mt-3 text-[13px] text-destructive">
                {submitBooking.error instanceof Error
                  ? submitBooking.error.message
                  : "Couldn't create this booking."}
              </p>
            ) : null}
            <PrimaryActionButton
              className="mt-5"
              loading={submitBooking.isPending}
              onClick={() => submitBooking.mutate()}
            >
              Confirm booking
            </PrimaryActionButton>
          </section>
        ) : null}

        {step === "done" && bookingId ? (
          <section className="rise-in flex flex-col items-center py-10 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-success/12 text-success">
              <CheckCircle2 className="h-8 w-8" strokeWidth={2.2} />
            </span>
            <h1 className="mt-5 font-display text-[28px] leading-tight">Booking confirmed</h1>
            <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              We'll see you on {date}. Your detailer will come to you — track it all from your
              account.
            </p>
            <Link to="/account/bookings/$id" params={{ id: bookingId }} className="mt-6">
              <PrimaryActionButton className="w-auto px-8">View booking</PrimaryActionButton>
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ChoiceCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press rounded-xl border p-3.5 text-left transition-colors ${selected ? "border-signal bg-signal/8" : "border-hairline bg-surface hover:bg-surface-2"}`}
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[14px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function prevStep(step: Step): Step {
  const order: Step[] = ["postcode", "address", "vehicle", "package", "schedule", "review"];
  const idx = order.indexOf(step);
  return order[Math.max(0, idx - 1)] ?? "postcode";
}

/** "10:00 AM" -> [10, 0], "2:00 PM" -> [14, 0]. */
function parseTimeSlot(slot: string): [number, number] {
  const match = /(\d+):(\d+)\s*(AM|PM)/.exec(slot);
  if (!match) return [10, 0];
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3];
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return [hour, minute];
}
