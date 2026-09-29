import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { Calendar, Check, Pencil } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { PortalAccessCard } from "@/components/ttd/PortalAccessCard";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { StatusBadge } from "@/components/ttd/StatusBadge";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { EmptyState } from "@/components/ttd/EmptyState";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { ErrorState } from "@/components/ttd/ErrorState";
import { useRequireStaffSession } from "@/hooks/use-session";
import { getCustomerById, updateCustomer, type StaffCustomerUpdate } from "@/lib/customers";
import { getCustomerVehicles, vehicleDescription } from "@/lib/vehicles";
import { getCustomerAddresses } from "@/lib/addresses";
import { getCustomerBookings } from "@/lib/bookings";
import { formatAppointment } from "@/lib/format";

export const Route = createFileRoute("/admin/customers_/$id")({
  head: () => ({
    meta: [{ title: "Customer | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: CustomerDetail,
});

function EditField({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow block text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 min-h-11 w-full rounded-xl border border-input bg-surface-2 px-3.5 text-sm font-medium outline-none focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
      />
    </div>
  );
}

function CustomerDetail() {
  useRequireStaffSession();
  const { id } = useParams({ from: "/admin/customers_/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<StaffCustomerUpdate>({});

  const {
    data: customer,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-customer", id],
    queryFn: () => getCustomerById(id),
  });
  const { data: vehicles } = useQuery({
    queryKey: ["admin-customer-vehicles", id],
    queryFn: () => getCustomerVehicles(id),
    enabled: Boolean(customer),
  });
  const { data: addresses } = useQuery({
    queryKey: ["admin-customer-addresses", id],
    queryFn: () => getCustomerAddresses(id),
    enabled: Boolean(customer),
  });
  const { data: bookings } = useQuery({
    queryKey: ["admin-customer-bookings", id],
    queryFn: () => getCustomerBookings(id),
    enabled: Boolean(customer),
  });

  useEffect(() => {
    if (customer && !editing) {
      setForm({
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        email: customer.email,
      });
    }
  }, [customer, editing]);

  const saveMutation = useMutation({
    mutationFn: () => updateCustomer(id, form),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin-customer", id], updated);
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      setEditing(false);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Loading customer" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-background">
        <ErrorState title="Couldn't load this customer." />
      </div>
    );
  }

  return (
    <AppShell
      area="admin"
      width="narrow"
      eyebrow={customer.auth_user_id ? "Customer, signed up" : "Customer, walk-in"}
      title={
        <>
          {customer.first_name} {customer.last_name}
        </>
      }
      back={{ to: "/admin/customers", label: "Customers" }}
      actions={
        !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-3 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
            Edit
          </button>
        ) : null
      }
    >
      <div className="mb-5">
        <PortalAccessCard customer={customer} />
      </div>

      {/* Identity */}
      <div className="mt-5 rounded-xl border border-hairline bg-surface p-4">
        {editing ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <EditField
                id="first_name"
                label="First name"
                value={form.first_name ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, first_name: v }))}
              />
              <EditField
                id="last_name"
                label="Last name"
                value={form.last_name ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, last_name: v }))}
              />
            </div>
            <EditField
              id="phone"
              label="Phone"
              type="tel"
              value={form.phone ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            />
            <EditField
              id="email"
              label="Email"
              type="email"
              value={form.email ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            />
            {saveMutation.isError ? (
              <p className="text-[12px] text-destructive">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Couldn't save these changes."}
              </p>
            ) : null}
            <div className="flex gap-2">
              <PrimaryActionButton
                type="button"
                size="md"
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                Save
              </PrimaryActionButton>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="press min-h-11 rounded-xl border border-hairline px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium text-foreground">{customer.phone || "Not given"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium text-foreground">{customer.email || "Not given"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Vehicles */}
      <h2 className="eyebrow mt-7 font-sans text-muted-foreground">Vehicles</h2>
      {vehicles && vehicles.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-2">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface p-3"
            >
              <PlateTag registration={v.registration} />
              {vehicleDescription(v) ? (
                <span className="text-[13px] font-medium">{vehicleDescription(v)}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-[13px] text-muted-foreground">No saved vehicles.</p>
      )}

      {/* Addresses */}
      <h2 className="eyebrow mt-7 font-sans text-muted-foreground">Addresses</h2>
      {addresses && addresses.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-2">
          {addresses.map((a) => (
            <div key={a.id} className="rounded-xl border border-hairline bg-surface p-3">
              <p className="text-[14px] font-semibold">{a.label}</p>
              <p className="text-[13px] text-muted-foreground">
                {a.line1} · {a.postcode}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-[13px] text-muted-foreground">No saved addresses.</p>
      )}

      {/* Booking history */}
      <h2 className="eyebrow mt-7 font-sans text-muted-foreground">Booking history</h2>
      {bookings && bookings.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-2">
          {bookings.map((b) => {
            const { dayLabel, timeLabel } = formatAppointment(b.scheduled_start);
            return (
              <Link
                key={b.id}
                to="/admin/bookings/$id"
                params={{ id: b.id }}
                className="press flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{b.package_name}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {dayLabel} · {timeLabel} · £{b.price}
                  </p>
                </div>
                <StatusBadge status={b.status} size="sm" />
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState className="mt-2.5" icon={Calendar} title="No bookings yet" />
      )}
    </AppShell>
  );
}
