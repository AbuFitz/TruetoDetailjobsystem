import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, Car, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/ttd/AppShell";
import { Field } from "@/components/ttd/FormField";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { EmptyState } from "@/components/ttd/EmptyState";
import { useRequireCustomerSession } from "@/hooks/use-session";
import { createVehicle, deleteVehicle, listMyVehicles, vehicleDescription } from "@/lib/vehicles";
import { listMyBookings } from "@/lib/bookings";
import { formatAppointment } from "@/lib/format";
import { UK_TIME } from "@/lib/uk-time";

export const Route = createFileRoute("/account/vehicles")({
  head: () => ({
    meta: [{ title: "Your Garage | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: VehiclesPage,
});

interface FormValues {
  make: string;
  model: string;
  registration: string;
  colour: string;
}

const plateKey = (reg: string) => reg.replace(/\s+/g, "").toUpperCase();

function VehiclesPage() {
  const { session, loading: authLoading } = useRequireCustomerSession();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["my-vehicles"],
    queryFn: listMyVehicles,
    enabled: Boolean(session),
  });
  // The same bookings the account home reads, so a car's history here is the history there.
  const { data: bookings } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: listMyBookings,
    enabled: Boolean(session),
  });

  const history = useMemo(() => {
    const m = new Map<string, { done: number; last: string | null; next: string | null }>();
    const now = Date.now();
    for (const b of bookings ?? []) {
      const k = plateKey(b.vehicle_registration);
      const h = m.get(k) ?? { done: 0, last: null, next: null };
      if (b.status === "completed") {
        h.done += 1;
        if (!h.last || b.scheduled_start > h.last) h.last = b.scheduled_start;
      } else if (
        b.status !== "cancelled" &&
        new Date(b.scheduled_start).getTime() >= now - 6 * 3600e3
      ) {
        if (!h.next || b.scheduled_start < h.next) h.next = b.scheduled_start;
      }
      m.set(k, h);
    }
    return m;
  }, [bookings]);

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { make: "", model: "", registration: "", colour: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createVehicle({
        make: values.make || undefined,
        model: values.model || undefined,
        registration: values.registration.toUpperCase(),
        colour: values.colour || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-vehicles"] });
      reset();
      setShowForm(false);
      toast.success("Car saved to your garage");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVehicle,
    onSuccess: () => {
      setConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["my-vehicles"] });
      toast.success("Car removed");
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Checking session" />
      </div>
    );
  }

  return (
    <AppShell
      area="customer"
      width="medium"
      eyebrow="Your Garage"
      title={
        <>
          YOUR GARAGE<span className="text-signal">.</span>
        </>
      }
      back={{ to: "/account", label: "Your account" }}
    >
      {isLoading ? (
        <BrandedLoading label="Loading vehicles" className="mt-8" />
      ) : vehicles && vehicles.length > 0 ? (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {vehicles.map((v, i) => {
            const h = history.get(plateKey(v.registration));
            const desc = vehicleDescription(v);
            return (
              <li
                key={v.id}
                className="rise-in grid gap-x-8 gap-y-4 py-7 md:grid-cols-[auto_minmax(0,1fr)] md:items-center"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <PlateTag
                  registration={v.registration}
                  size="xl"
                  className="max-w-full justify-self-start"
                />
                <div className="min-w-0">
                  <p className="font-display text-[34px] leading-none sm:text-[40px]">
                    {desc ? desc.toUpperCase() : "SAVED CAR"}
                    {v.colour ? (
                      <span className="text-foreground/40"> · {v.colour.toUpperCase()}</span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-[14px] text-muted-foreground">
                    {h && h.done > 0
                      ? `${h.done} ${h.done === 1 ? "detail" : "details"} with us. Last done ${format(new Date(h.last!), "d MMMM yyyy", { in: UK_TIME })}.`
                      : "No details with us yet."}
                    {h?.next
                      ? ` Next: ${formatAppointment(h.next).dayLabel}, ${formatAppointment(h.next).timeLabel}.`
                      : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Link
                      to="/book"
                      className="press inline-flex min-h-11 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-deep"
                    >
                      Book a detail <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
                    </Link>
                    {confirmId === v.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] text-muted-foreground">Remove this car?</span>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(v.id)}
                          disabled={deleteMutation.isPending}
                          className="press min-h-11 px-3 text-[12px] font-bold uppercase tracking-[0.12em] text-destructive"
                        >
                          Yes, remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="press min-h-11 px-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                        >
                          Keep it
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label="Remove vehicle"
                        onClick={() => setConfirmId(v.id)}
                        className="press inline-flex min-h-11 items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState className="mt-6" icon={Car} title="No vehicles saved yet" />
      )}

      <div className="mx-auto max-w-xl">
        {showForm ? (
          <form
            onSubmit={handleSubmit((v) => createMutation.mutate(v))}
            className="mt-8 flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-5"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field id="make" label="Make" placeholder="BMW" inputProps={register("make")} />
              <Field id="model" label="Model" placeholder="220d" inputProps={register("model")} />
            </div>
            <Field
              id="registration"
              label="Registration"
              upper
              mono
              placeholder="AB12 CDE"
              inputProps={register("registration", { required: true })}
            />
            <Field id="colour" label="Colour (optional)" inputProps={register("colour")} />
            <div className="flex gap-2">
              <PrimaryActionButton
                type="submit"
                loading={createMutation.isPending}
                className="flex-1"
              >
                Save vehicle
              </PrimaryActionButton>
              <PrimaryActionButton
                type="button"
                variant="outline"
                className="w-auto px-5"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </PrimaryActionButton>
            </div>
          </form>
        ) : (
          <PrimaryActionButton variant="outline" className="mt-8" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add vehicle
          </PrimaryActionButton>
        )}
      </div>
    </AppShell>
  );
}
