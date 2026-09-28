import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useRequireStaffSession } from "@/hooks/use-session";
import { getDetailerById, updateDetailer } from "@/lib/detailers";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export const Route = createFileRoute("/admin/detailers_/$id")({
  head: () => ({
    meta: [{ title: "Edit detailer | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: EditDetailer,
});

interface FormValues {
  name: string;
  phone: string;
  jobTitle: string;
  vehicleDescription: string;
  bio: string;
}

function EditDetailer() {
  useRequireStaffSession();
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { copied, copy } = useCopyToClipboard();

  const { data: detailer, isLoading } = useQuery({
    queryKey: ["detailer", id],
    queryFn: () => getDetailerById(id),
  });

  const { register, handleSubmit, reset } = useForm<FormValues>({
    values: detailer
      ? {
          name: detailer.name,
          phone: detailer.phone ?? "",
          jobTitle: detailer.job_title ?? "",
          vehicleDescription: detailer.vehicle_description ?? "",
          bio: detailer.bio ?? "",
        }
      : { name: "", phone: "", jobTitle: "", vehicleDescription: "", bio: "" },
  });

  const updateMutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateDetailer(id, {
        name: values.name,
        phone: values.phone || null,
        job_title: values.jobTitle || null,
        vehicle_description: values.vehicleDescription || null,
        bio: values.bio || null,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["detailer", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-detailers"] });
      reset({
        name: updated.name,
        phone: updated.phone ?? "",
        jobTitle: updated.job_title ?? "",
        vehicleDescription: updated.vehicle_description ?? "",
        bio: updated.bio ?? "",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => updateDetailer(id, { active: !detailer!.active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detailer", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-detailers"] });
    },
  });

  if (isLoading || !detailer) {
    return (
      <main className="min-h-screen bg-background">
        <BrandedLoading label="Loading detailer" />
      </main>
    );
  }

  const link = `${window.location.origin}/d/${detailer.link_token}`;

  return (
    <main className="min-h-screen bg-background pb-16">
      <TtdHeader eyebrow="Edit detailer" containerClassName="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        <Link
          to="/admin/detailers"
          className="press inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Detailers
        </Link>

        <h1 className="mt-4 font-display text-[28px] leading-none">{detailer.name}</h1>

        <div className="mt-3 flex items-center gap-2 border border-hairline bg-surface p-2.5">
          <p className="min-w-0 flex-1 truncate text-[13px]">{link}</p>
          <button
            type="button"
            onClick={() => copy(link)}
            className="press grid h-8 w-8 shrink-0 place-items-center border border-hairline"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <form
          onSubmit={handleSubmit((v) => updateMutation.mutate(v))}
          className="mt-5 flex flex-col gap-4"
        >
          <Field id="name" label="Name" inputProps={register("name", { required: true })} />
          <Field id="phone" label="Phone" inputProps={register("phone")} />
          <Field id="jobTitle" label="Job title" inputProps={register("jobTitle")} />
          <Field
            id="vehicleDescription"
            label="Vehicle"
            inputProps={register("vehicleDescription")}
          />
          <PrimaryActionButton type="submit" loading={updateMutation.isPending}>
            Save changes
          </PrimaryActionButton>
        </form>

        <PrimaryActionButton
          variant={detailer.active ? "ghostDestructive" : "outline"}
          className="mt-3"
          loading={toggleActiveMutation.isPending}
          onClick={() => toggleActiveMutation.mutate()}
        >
          {detailer.active ? "Deactivate detailer" : "Reactivate detailer"}
        </PrimaryActionButton>
      </div>
    </main>
  );
}
