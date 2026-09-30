import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { sendBookingEmail, type EmailResult } from "@/lib/portal-email";
import { confirmationNotice } from "@/lib/booking-email";
import { guideTo } from "@/lib/guide";
import { SuccessMark } from "@/components/ttd/SuccessMark";
import { VehicleSizePicker } from "@/components/ttd/VehicleSizePicker";
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
  isSlotAvailable,
  ukNow,
  ukSlotToIso,
} from "@/lib/slots";
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

type Step = "vehicle" | "schedule" | "review" | "done";

function BookingFlow() {
  const { session, loading: authLoading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("vehicle");
  const sizeRef = useRef<HTMLDivElement>(null);
  const newVehicleRef = useRef<HTMLDivElement>(null);
  const packageRef = useRef<HTMLDivElement>(null);
  const addonsRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const whereRef = useRef<HTMLDivElement>(null);
  const newAddressRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
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
      // Never throws: the booking is made either way, and the screen reports what happened.
      const email = await sendBookingEmail(booking.id, "booked_in");
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
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Loading" />
      </div>
    );
  }

  return (
    <AppShell
      area="customer"
      width="medium"
      eyebrow="We come to you"
      title={
        <>
          BOOK A DETAIL<span className="text-signal">.</span>
        </>
      }
    >
      {step !== "vehicle" && step !== "done" ? (
        <button
          type="button"
          onClick={() => setStep(prevStep(step))}
          className="press mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
      ) : null}

      {step === "vehicle" ? (
        <section>
          <h2 className="font-display text-[28px] leading-none">Vehicle and package</h2>
          <div className="mt-5 grid gap-8 lg:grid-cols-2">
            <div>
              <p className="eyebrow text-muted-foreground">Vehicle</p>
              <div className="mt-3 flex flex-col gap-2.5">
                {(vehicles ?? []).map((v) => (
                  <ChoiceCard
                    key={v.id}
                    selected={vehicleChoice !== "new" && vehicleChoice?.id === v.id}
                    onClick={() => {
                      setVehicleChoice(v);
                      guideTo(sizeRef.current);
                    }}
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
                  onClick={() => {
                    setVehicleChoice("new");
                    guideTo(newVehicleRef.current);
                  }}
                >
                  <p className="text-[14px] font-semibold">Add a new vehicle</p>
                </ChoiceCard>
              </div>

              {vehicleChoice === "new" ? (
                <div ref={newVehicleRef} className="mt-4 grid grid-cols-2 gap-2">
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

              <div ref={sizeRef} className="mt-5">
                <span className="eyebrow block text-muted-foreground">Vehicle size</span>
                <VehicleSizePicker
                  className="mt-2"
                  value={vehicleSize}
                  onChange={(size) => {
                    setVehicleSize(size);
                    guideTo(packageRef.current);
                  }}
                />
              </div>
            </div>
            <div ref={packageRef}>
              <p className="eyebrow text-muted-foreground">Package</p>
              <div className="mt-3 flex flex-col gap-2.5">
                {DETAIL_PACKAGES.map((p) => (
                  <ChoiceCard
                    key={p.id}
                    selected={packageId === p.id}
                    onClick={() => {
                      setPackageId(p.id);
                      guideTo(addonsRef.current);
                    }}
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

              <div ref={addonsRef} className="mt-5">
                <span className="eyebrow block text-muted-foreground">Add-ons</span>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
            </div>
          </div>
          <div ref={nextRef} />
          <PrimaryActionButton
            className="mt-6"
            disabled={
              vehicleChoice === null || (vehicleChoice === "new" && !newVehicle.registration.trim())
            }
            onClick={() => setStep("schedule")}
          >
            Next: when and where · £{totalPrice}
          </PrimaryActionButton>
        </section>
      ) : null}

      {step === "schedule" ? (
        <section>
          <h2 className="font-display text-[28px] leading-none">When and where</h2>
          <div className="mt-5 grid gap-8 lg:grid-cols-2">
            <div>
              <p className="eyebrow text-muted-foreground">Date and time</p>
              <div className="mt-5">
                <span className="eyebrow block text-muted-foreground">Date</span>
                <input
                  type="date"
                  value={date}
                  min={ukNow().date}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDate(next);
                    if (next && !isSlotAvailable(next, time))
                      setTime(firstAvailableSlot(next) ?? "");
                    if (next) guideTo(timeRef.current);
                  }}
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-base outline-none focus:border-signal"
                />
              </div>
              <div ref={timeRef} className="mt-4">
                <span className="eyebrow block text-muted-foreground">Time</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {TIME_SLOTS.map((t) => {
                    const unavailable = Boolean(date) && !isSlotAvailable(date, t);
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={unavailable}
                        aria-pressed={time === t}
                        onClick={() => {
                          setTime(t);
                          guideTo(addressChoice ? nextRef.current : whereRef.current);
                        }}
                        className={`min-h-11 border text-[13px] font-semibold disabled:cursor-not-allowed disabled:line-through disabled:opacity-35 ${time === t ? "border-signal bg-signal text-signal-foreground" : "border-input bg-surface-2"}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                {date && !firstAvailableSlot(date) ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    No slots left on this day. Please pick another date.
                  </p>
                ) : null}
              </div>
            </div>
            <div ref={whereRef}>
              <p className="eyebrow text-muted-foreground">Where should we come?</p>
              <div className="mt-3 flex flex-col gap-2.5">
                {(addresses ?? []).map((a) => (
                  <ChoiceCard
                    key={a.id}
                    selected={addressChoice !== "new" && addressChoice?.id === a.id}
                    onClick={() => {
                      setAddressChoice(a);
                      guideTo(nextRef.current);
                    }}
                  >
                    <p className="text-[14px] font-semibold">{a.label}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {a.line1} · {a.postcode}
                    </p>
                  </ChoiceCard>
                ))}
                <ChoiceCard
                  selected={addressChoice === "new"}
                  onClick={() => {
                    setAddressChoice("new");
                    guideTo(newAddressRef.current);
                  }}
                >
                  <p className="text-[14px] font-semibold">Another address</p>
                  <p className="text-[13px] text-muted-foreground">
                    Postcode {areaResult?.postcode}
                  </p>
                </ChoiceCard>
              </div>
              {addressChoice === "new" ? (
                <div ref={newAddressRef} className="mt-4">
                  <p className="text-[14px] text-muted-foreground">
                    Enter the postcode and we'll check we cover your area.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                      placeholder="e.g. HP2 6EL"
                      className="min-h-12 min-w-0 flex-1 rounded-xl border border-input bg-surface-2 px-3.5 text-base font-medium uppercase outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
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
                    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-4">
                      <div className="grid grid-cols-3 gap-2">
                        {(["Home", "Work", "Other"] as const).map((l) => (
                          <button
                            key={l}
                            type="button"
                            onClick={() => setNewAddress((s) => ({ ...s, label: l }))}
                            className={`min-h-9 border text-[13px] font-semibold ${newAddress.label === l ? "border-signal bg-signal text-signal-foreground" : "border-input bg-surface-2"}`}
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
                </div>
              ) : null}
            </div>
          </div>
          <div ref={nextRef} />
          <PrimaryActionButton
            className="mt-6"
            loading={createAddressMutation.isPending}
            disabled={
              !date ||
              !time ||
              !isSlotAvailable(date, time) ||
              addressChoice === null ||
              (addressChoice === "new" && (!areaResult?.covered || !newAddress.line1.trim()))
            }
            onClick={() =>
              addressChoice === "new" ? createAddressMutation.mutate() : setStep("review")
            }
          >
            Next: review
          </PrimaryActionButton>
        </section>
      ) : null}

      {step === "review" ? (
        <section>
          <h2 className="font-display text-[28px] leading-none">Confirm your booking</h2>
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
              {formatBookingDate(date)} · {time}
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
          <SuccessMark tone="success" />
          <h2 className="mt-5 font-display text-[28px] leading-tight">Booking confirmed</h2>
          <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            We'll see you on {formatBookingDate(date)} at {time}. Your detailer will come to you,
            and you can track it all from your account.
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
                className="mt-4 max-w-sm rounded-xl border border-warning/40 bg-warning/8 px-4 py-3 text-[14px] leading-relaxed"
              >
                {notice.text}
              </p>
            )
          ) : null}
          <Link to="/account/bookings/$id" params={{ id: bookingId }} className="mt-6">
            <PrimaryActionButton className="w-auto px-8">View booking</PrimaryActionButton>
          </Link>
        </section>
      ) : null}
    </AppShell>
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
      className={`press border p-3.5 text-left transition-colors ${selected ? "border-signal bg-signal/8" : "border-hairline bg-surface hover:bg-surface-2"}`}
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
  const order: Step[] = ["vehicle", "schedule", "review"];
  const idx = order.indexOf(step);
  return order[Math.max(0, idx - 1)] ?? "vehicle";
}
