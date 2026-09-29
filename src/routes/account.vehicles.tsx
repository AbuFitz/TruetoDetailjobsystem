import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Car, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { Field } from "@/components/ttd/FormField";
import { PlateTag } from "@/components/ttd/VehicleTag";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { EmptyState } from "@/components/ttd/EmptyState";
import { useRequireCustomerSession } from "@/hooks/use-session";
import { createVehicle, deleteVehicle, listMyVehicles, vehicleDescription } from "@/lib/vehicles";

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

function VehiclesPage() {
  const { session, loading: authLoading } = useRequireCustomerSession();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["my-vehicles"],
    queryFn: listMyVehicles,
    enabled: Boolean(session),
  });

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
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVehicle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-vehicles"] }),
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
      width="narrow"
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
        <div className="mt-5 flex flex-col gap-2.5">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center bg-surface-2 text-foreground">
                <Car className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                {vehicleDescription(v) ? (
                  <p className="truncate text-[14px] font-semibold">{vehicleDescription(v)}</p>
                ) : null}
                <PlateTag registration={v.registration} className="mt-1" />
              </div>
              <button
                type="button"
                aria-label="Remove vehicle"
                onClick={() => deleteMutation.mutate(v.id)}
                className="press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState className="mt-6" icon={Car} title="No vehicles saved yet" />
      )}

      {showForm ? (
        <form
          onSubmit={handleSubmit((v) => createMutation.mutate(v))}
          className="mt-5 flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-5"
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
        <PrimaryActionButton variant="outline" className="mt-5" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Add vehicle
        </PrimaryActionButton>
      )}
    </AppShell>
  );
}
