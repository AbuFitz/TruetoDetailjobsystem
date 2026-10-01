import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/ttd/AppShell";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { EmptyState } from "@/components/ttd/EmptyState";
import { useRequireCustomerSession } from "@/hooks/use-session";
import {
  createAddress,
  deleteAddress,
  listMyAddresses,
  updateAddress,
  type AddressLabel,
} from "@/lib/addresses";
import { checkServiceArea } from "@/lib/service-area";

export const Route = createFileRoute("/account/addresses")({
  head: () => ({
    meta: [{ title: "Your addresses | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AddressesPage,
});

interface FormValues {
  label: AddressLabel;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
}

function AddressesPage() {
  const { session, loading: authLoading } = useRequireCustomerSession();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: addresses, isLoading } = useQuery({
    queryKey: ["my-addresses"],
    queryFn: listMyAddresses,
    enabled: Boolean(session),
  });

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { label: "Home", line1: "", line2: "", city: "", postcode: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const area = await checkServiceArea(values.postcode);
      if (!area.covered) {
        throw new Error(`We don't currently cover ${area.postcode}, sorry!`);
      }
      return createAddress({
        label: values.label,
        line1: values.line1,
        line2: values.line2 || undefined,
        city: values.city || undefined,
        postcode: area.postcode,
        lat: area.lat,
        lng: area.lng,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
      reset();
      setShowForm(false);
      setFormError(null);
      toast.success("Address saved");
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : "Couldn't save this address."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
      toast.success("Address removed");
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => updateAddress(id, { is_default: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
      toast.success("Default address updated");
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
      width="narrow"
      eyebrow="Your addresses"
      title={
        <>
          YOUR ADDRESSES<span className="text-signal">.</span>
        </>
      }
      back={{ to: "/account/settings", label: "Settings" }}
    >
      {isLoading ? (
        <BrandedLoading label="Loading addresses" className="mt-8" />
      ) : addresses && addresses.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2.5">
          {addresses.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-hairline bg-surface p-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground">
                <MapPin className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold">{a.label}</p>
                  {a.is_default ? (
                    <span className="rounded-full bg-signal/12 px-2 py-0.5 text-[10px] font-semibold uppercase text-signal-deep">
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {a.line1}
                  {a.city ? `, ${a.city}` : ""} · {a.postcode}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {!a.is_default ? (
                  <button
                    type="button"
                    aria-label="Set as default"
                    onClick={() => setDefaultMutation.mutate(a.id)}
                    className="press grid h-9 w-9 place-items-center rounded-full border border-hairline text-muted-foreground hover:text-signal-deep"
                  >
                    <Star className="h-4 w-4" strokeWidth={2} />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove address"
                  onClick={() => deleteMutation.mutate(a.id)}
                  className="press grid h-9 w-9 place-items-center rounded-full border border-hairline text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState className="mt-6" icon={MapPin} title="No addresses saved yet" />
      )}

      {showForm ? (
        <form
          onSubmit={handleSubmit((v) => createMutation.mutate(v))}
          className="mt-5 flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-5"
        >
          <div>
            <span className="eyebrow block text-muted-foreground">Label</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["Home", "Work", "Other"] as const).map((l) => (
                <label key={l} className="press">
                  <input
                    type="radio"
                    value={l}
                    className="peer sr-only"
                    {...register("label")}
                    defaultChecked={l === "Home"}
                  />
                  <span className="flex min-h-10 items-center justify-center rounded-xl border border-input bg-surface-2 text-sm font-semibold peer-checked:border-signal peer-checked:bg-signal peer-checked:text-signal-foreground">
                    {l}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Field
            id="line1"
            label="Address line 1"
            inputProps={register("line1", { required: true })}
          />
          <Field id="line2" label="Address line 2 (optional)" inputProps={register("line2")} />
          <Field id="city" label="Town / city" inputProps={register("city")} />
          <Field
            id="postcode"
            label="Postcode"
            upper
            inputProps={register("postcode", { required: true })}
          />
          {formError ? <p className="text-[13px] text-destructive">{formError}</p> : null}
          <div className="flex gap-2">
            <PrimaryActionButton
              type="submit"
              loading={createMutation.isPending}
              className="flex-1"
            >
              Save address
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
          Add address
        </PrimaryActionButton>
      )}
    </AppShell>
  );
}
