import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { sendBookingEmail } from "@/lib/portal-email";
import { VehicleSizePicker } from "@/components/ttd/VehicleSizePicker";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { searchCustomers, createWalkInCustomer, type Customer } from "@/lib/customers";
import {
  getCustomerAddresses,
  createAddressForCustomer,
  type CustomerAddress,
  type AddressLabel,
} from "@/lib/addresses";
import {
  getCustomerVehicles,
  createVehicleForCustomer,
  vehicleDescription,
  type Vehicle,
} from "@/lib/vehicles";
import { createBookingForCustomer } from "@/lib/bookings";
import { checkServiceArea, type ServiceAreaResult } from "@/lib/service-area";
import {
  DETAIL_ADDONS,
  DETAIL_PACKAGES,
  VEHICLE_SIZE_LABELS,
  type VehicleSize,
} from "@/lib/constants";
import { useRequireStaffSession } from "@/hooks/use-session";
import { ukTimeToIso } from "@/lib/slots";

export const Route = createFileRoute("/admin/bookings/new")({
  head: () => ({
    meta: [{ title: "New booking | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: NewBooking,
});

const ADDRESS_LABELS: AddressLabel[] = ["Home", "Work", "Other"];

function NewBooking() {
  useRequireStaffSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [customerMode, setCustomerMode] = useState<"search" | "new">("search");
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const { data: results } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 1,
  });

  const [newCustomer, setNewCustomer] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });
  const createCustomer = useMutation({
    mutationFn: () =>
      createWalkInCustomer({
        first_name: newCustomer.first_name.trim(),
        last_name: newCustomer.last_name.trim() || undefined,
        phone: newCustomer.phone.trim() || undefined,
        email: newCustomer.email.trim() || undefined,
      }),
    onSuccess: (c) => {
      setCustomer(c);
      setCustomerMode("search");
      setNewCustomer({ first_name: "", last_name: "", phone: "", email: "" });
    },
  });

  const { data: addresses } = useQuery({
    queryKey: ["customer-addresses", customer?.id],
    queryFn: () => getCustomerAddresses(customer!.id),
    enabled: Boolean(customer),
  });
  const { data: vehicles } = useQuery({
    queryKey: ["customer-vehicles", customer?.id],
    queryFn: () => getCustomerVehicles(customer!.id),
    enabled: Boolean(customer),
  });

  const [addressId, setAddressId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicleSize, setVehicleSize] = useState<VehicleSize>("midsize");
  const [packageId, setPackageId] = useState(DETAIL_PACKAGES[1]!.id);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [internalNotes, setInternalNotes] = useState("");
  const [areaResult, setAreaResult] = useState<ServiceAreaResult | null>(null);

  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    label: "Home" as AddressLabel,
    line1: "",
    line2: "",
    city: "",
    postcode: "",
  });
  const createAddress = useMutation({
    mutationFn: () =>
      createAddressForCustomer(customer!.id, {
        label: addressForm.label,
        line1: addressForm.line1.trim(),
        line2: addressForm.line2.trim() || undefined,
        city: addressForm.city.trim() || undefined,
        postcode: addressForm.postcode.trim().toUpperCase(),
      }),
    onSuccess: (addr) => {
      queryClient.setQueryData<CustomerAddress[]>(["customer-addresses", customer!.id], (old) => [
        ...(old ?? []),
        addr,
      ]);
      setAddressId(addr.id);
      setShowAddAddress(false);
      setAddressForm({ label: "Home", line1: "", line2: "", city: "", postcode: "" });
    },
  });

  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    make: "",
    model: "",
    registration: "",
    colour: "",
  });
  const createVehicle = useMutation({
    mutationFn: () =>
      createVehicleForCustomer(customer!.id, {
        make: vehicleForm.make.trim() || undefined,
        model: vehicleForm.model.trim() || undefined,
        registration: vehicleForm.registration.trim().toUpperCase(),
        colour: vehicleForm.colour.trim() || undefined,
      }),
    onSuccess: (v) => {
      queryClient.setQueryData<Vehicle[]>(["customer-vehicles", customer!.id], (old) => [
        ...(old ?? []),
        v,
      ]);
      setVehicleId(v.id);
      setShowAddVehicle(false);
      setVehicleForm({ make: "", model: "", registration: "", colour: "" });
    },
  });

  const selectedAddress = addresses?.find((a) => a.id === addressId);
  const selectedVehicle = vehicles?.find((v) => v.id === vehicleId);
  const selectedPackage = DETAIL_PACKAGES.find((p) => p.id === packageId)!;
  const addonTotal = DETAIL_ADDONS.filter((a) => addonIds.includes(a.id)).reduce(
    (s, a) => s + a.price,
    0,
  );
  const totalPrice = selectedPackage.priceBySize[vehicleSize] + addonTotal;

  const submit = useMutation({
    mutationFn: async () => {
      if (!customer) throw new Error("Select a customer first.");
      if (!selectedAddress) throw new Error("Select a service address.");
      if (!selectedVehicle) throw new Error("Select a vehicle.");

      const created = await createBookingForCustomer({
        customer_id: customer.id,
        vehicle_id: selectedVehicle.id,
        vehicle_registration: selectedVehicle.registration,
        vehicle_description: vehicleDescription(selectedVehicle) ?? undefined,
        address_id: selectedAddress.id,
        service_address_line1: selectedAddress.line1,
        service_address_line2: selectedAddress.line2 ?? undefined,
        service_address_city: selectedAddress.city ?? undefined,
        service_postcode: selectedAddress.postcode,
        destination_lat: selectedAddress.lat ?? undefined,
        destination_lng: selectedAddress.lng ?? undefined,
        package_id: selectedPackage.id,
        package_name: selectedPackage.name,
        vehicle_size: vehicleSize,
        addon_ids: addonIds,
        addon_labels: DETAIL_ADDONS.filter((a) => addonIds.includes(a.id)).map((a) => a.label),
        price: totalPrice,
        scheduled_start: ukTimeToIso(date, time),
        estimated_duration_minutes: selectedPackage.durationMinutes,
        internal_notes: internalNotes.trim() || undefined,
      });
      // Email the customer their booking and tracking link. If it fails the
      // booking still stands, and the booking page has a Resend button.
      await sendBookingEmail(created.id, "booked_in");
      return created;
    },
    onSuccess: (booking) => navigate({ to: "/admin/bookings/$id", params: { id: booking.id } }),
  });

  return (
    <AppShell
      area="admin"
      width="narrow"
      eyebrow="New booking"
      title={
        <>
          CREATE A BOOKING<span className="text-signal">.</span>
        </>
      }
      back={{ to: "/admin", label: "Today" }}
      subtitle="The customer gets an email with their booking and a tracking link as soon as you save."
    >
      <section className="mt-5">
        <span className="eyebrow block text-muted-foreground">Customer</span>
        {customer ? (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-signal/30 bg-signal/8 p-3.5">
            <p className="text-[14px] font-semibold">
              {customer.first_name} {customer.last_name}
              {customer.email ? ` · ${customer.email}` : ""}
              {!customer.auth_user_id ? (
                <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Walk-in
                </span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => setCustomer(null)}
              className="text-[12px] font-semibold text-muted-foreground underline"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setCustomerMode("search")}
                className={`min-h-10 rounded-xl border text-[13px] font-semibold ${
                  customerMode === "search"
                    ? "border-signal bg-signal text-signal-foreground"
                    : "border-input bg-surface-2 text-muted-foreground"
                }`}
              >
                Search existing
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode("new")}
                className={`min-h-10 rounded-xl border text-[13px] font-semibold ${
                  customerMode === "new"
                    ? "border-signal bg-signal text-signal-foreground"
                    : "border-input bg-surface-2 text-muted-foreground"
                }`}
              >
                New customer
              </button>
            </div>

            {customerMode === "search" ? (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, email or phone"
                  className="mt-2 min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
                {results && results.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCustomer(c)}
                        className="press rounded-xl border border-hairline bg-surface p-3 text-left text-sm hover:bg-surface-2"
                      >
                        {c.first_name} {c.last_name} · {c.email}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-[12px] text-muted-foreground">
                  No account needed. This creates a customer record staff can book against. If they
                  sign up later with the same email, their history carries over automatically.
                </p>
                <input
                  value={newCustomer.first_name}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, first_name: e.target.value }))}
                  placeholder="First name"
                  className="min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
                <input
                  value={newCustomer.last_name}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, last_name: e.target.value }))}
                  placeholder="Last name (optional)"
                  className="min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
                <input
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone"
                  className="min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
                <input
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email"
                  type="email"
                  className="min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm outline-none focus:border-signal"
                />
                {createCustomer.isError ? (
                  <p className="text-[12px] text-destructive">
                    {createCustomer.error instanceof Error
                      ? createCustomer.error.message
                      : "Couldn't create this customer."}
                  </p>
                ) : null}
                <PrimaryActionButton
                  size="sm"
                  className="w-auto px-5"
                  disabled={!newCustomer.first_name.trim()}
                  loading={createCustomer.isPending}
                  onClick={() => createCustomer.mutate()}
                >
                  Add customer
                </PrimaryActionButton>
              </div>
            )}
          </>
        )}
      </section>

      {customer ? (
        <>
          <section className="mt-5">
            <span className="eyebrow block text-muted-foreground">Service address</span>
            <div className="mt-2 flex flex-col gap-1.5">
              {(addresses ?? []).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAddressId(a.id)}
                  className={`rounded-xl border p-3 text-left text-sm ${addressId === a.id ? "border-signal bg-signal/8" : "border-hairline bg-surface"}`}
                >
                  {a.label} · {a.line1}, {a.postcode}
                </button>
              ))}
              {addresses && addresses.length === 0 && !showAddAddress ? (
                <p className="text-[13px] text-muted-foreground">
                  This customer has no saved addresses yet.
                </p>
              ) : null}
            </div>

            {showAddAddress ? (
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-hairline bg-surface p-3.5">
                <div className="grid grid-cols-3 gap-1.5">
                  {ADDRESS_LABELS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setAddressForm((p) => ({ ...p, label: l }))}
                      className={`min-h-9 rounded-lg border text-[12px] font-semibold ${
                        addressForm.label === l
                          ? "border-signal bg-signal text-signal-foreground"
                          : "border-input bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <input
                  value={addressForm.line1}
                  onChange={(e) => setAddressForm((p) => ({ ...p, line1: e.target.value }))}
                  placeholder="Address line 1"
                  className="min-h-10 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
                />
                <input
                  value={addressForm.city}
                  onChange={(e) => setAddressForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="Town / city (optional)"
                  className="min-h-10 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
                />
                <input
                  value={addressForm.postcode}
                  onChange={(e) => setAddressForm((p) => ({ ...p, postcode: e.target.value }))}
                  placeholder="Postcode"
                  className="min-h-10 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm uppercase outline-none focus:border-signal"
                />
                {createAddress.isError ? (
                  <p className="text-[12px] text-destructive">
                    {createAddress.error instanceof Error
                      ? createAddress.error.message
                      : "Couldn't save this address."}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <PrimaryActionButton
                    size="sm"
                    className="w-auto px-4"
                    disabled={!addressForm.line1.trim() || !addressForm.postcode.trim()}
                    loading={createAddress.isPending}
                    onClick={() => createAddress.mutate()}
                  >
                    Save address
                  </PrimaryActionButton>
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(false)}
                    className="text-[12px] font-semibold text-muted-foreground underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddAddress(true)}
                className="mt-2 text-[13px] font-semibold text-signal-deep underline underline-offset-2"
              >
                + Add address
              </button>
            )}
          </section>

          <section className="mt-5">
            <span className="eyebrow block text-muted-foreground">Vehicle</span>
            <div className="mt-2 flex flex-col gap-1.5">
              {(vehicles ?? []).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicleId(v.id)}
                  className={`rounded-xl border p-3 text-left text-sm ${vehicleId === v.id ? "border-signal bg-signal/8" : "border-hairline bg-surface"}`}
                >
                  {vehicleDescription(v) ?? "Vehicle"} · {v.registration}
                </button>
              ))}
              {vehicles && vehicles.length === 0 && !showAddVehicle ? (
                <p className="text-[13px] text-muted-foreground">
                  This customer has no saved vehicles yet.
                </p>
              ) : null}
            </div>

            {showAddVehicle ? (
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-hairline bg-surface p-3.5">
                <input
                  value={vehicleForm.registration}
                  onChange={(e) => setVehicleForm((p) => ({ ...p, registration: e.target.value }))}
                  placeholder="Registration"
                  className="min-h-10 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm uppercase outline-none focus:border-signal"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    value={vehicleForm.make}
                    onChange={(e) => setVehicleForm((p) => ({ ...p, make: e.target.value }))}
                    placeholder="Make (optional)"
                    className="min-h-10 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
                  />
                  <input
                    value={vehicleForm.model}
                    onChange={(e) => setVehicleForm((p) => ({ ...p, model: e.target.value }))}
                    placeholder="Model (optional)"
                    className="min-h-10 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
                  />
                </div>
                <input
                  value={vehicleForm.colour}
                  onChange={(e) => setVehicleForm((p) => ({ ...p, colour: e.target.value }))}
                  placeholder="Colour (optional)"
                  className="min-h-10 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
                />
                {createVehicle.isError ? (
                  <p className="text-[12px] text-destructive">
                    {createVehicle.error instanceof Error
                      ? createVehicle.error.message
                      : "Couldn't save this vehicle."}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <PrimaryActionButton
                    size="sm"
                    className="w-auto px-4"
                    disabled={!vehicleForm.registration.trim()}
                    loading={createVehicle.isPending}
                    onClick={() => createVehicle.mutate()}
                  >
                    Save vehicle
                  </PrimaryActionButton>
                  <button
                    type="button"
                    onClick={() => setShowAddVehicle(false)}
                    className="text-[12px] font-semibold text-muted-foreground underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddVehicle(true)}
                className="mt-2 text-[13px] font-semibold text-signal-deep underline underline-offset-2"
              >
                + Add vehicle
              </button>
            )}

            <VehicleSizePicker className="mt-3" value={vehicleSize} onChange={setVehicleSize} />
          </section>

          <section className="mt-5">
            <span className="eyebrow block text-muted-foreground">Package</span>
            <div className="mt-2 flex flex-col gap-1.5">
              {DETAIL_PACKAGES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPackageId(p.id)}
                  className={`flex items-center justify-between rounded-xl border p-3 text-left text-sm ${packageId === p.id ? "border-signal bg-signal/8" : "border-hairline bg-surface"}`}
                >
                  <span>{p.name}</span>
                  <span className="font-semibold">£{p.priceBySize[vehicleSize]}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DETAIL_ADDONS.map((a) => (
                <label
                  key={a.id}
                  className="press inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-3 py-1.5 text-[12px]"
                >
                  <input
                    type="checkbox"
                    checked={addonIds.includes(a.id)}
                    onChange={(e) =>
                      setAddonIds((prev) =>
                        e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                      )
                    }
                  />
                  {a.label} (+£{a.price})
                </label>
              ))}
            </div>
          </section>

          <section className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <span className="eyebrow block text-muted-foreground">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
              />
            </div>
            <div>
              <span className="eyebrow block text-muted-foreground">Time</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3 text-sm outline-none focus:border-signal"
              />
            </div>
          </section>

          <section className="mt-5">
            <span className="eyebrow block text-muted-foreground">
              Internal notes (detailer only)
            </span>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={2}
              className="mt-2 w-full resize-none rounded-xl border border-input bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-signal"
            />
          </section>

          {selectedAddress ? (
            <AreaCheck postcode={selectedAddress.postcode} onResult={setAreaResult} />
          ) : null}

          {submit.isError ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-[13px] text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
              {submit.error instanceof Error
                ? submit.error.message
                : "Couldn't create this booking."}
            </p>
          ) : null}

          <PrimaryActionButton
            className="mt-6"
            loading={submit.isPending}
            disabled={
              !selectedAddress ||
              !selectedVehicle ||
              !date ||
              (areaResult ? !areaResult.covered : false)
            }
            onClick={() => submit.mutate()}
          >
            Create booking · £{totalPrice}
          </PrimaryActionButton>
        </>
      ) : null}
    </AppShell>
  );
}

function AreaCheck({
  postcode,
  onResult,
}: {
  postcode: string;
  onResult: (r: ServiceAreaResult) => void;
}) {
  const { data } = useQuery({
    queryKey: ["area-check", postcode],
    queryFn: async () => {
      const result = await checkServiceArea(postcode);
      onResult(result);
      return result;
    },
  });
  if (!data) return null;
  return data.covered ? null : (
    <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-destructive">
      <TriangleAlert className="h-4 w-4" /> {postcode} is outside the mobile service area.
    </p>
  );
}
