import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useRequireStaffSession } from "@/hooks/use-session";
import { getDetailerById, updateDetailer } from "@/lib/detailers";
import { DetailerLinkRow } from "@/components/ttd/DetailerLinkRow";

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
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Loading detailer" />
      </div>
    );
  }

  const link = `${window.location.origin}/d/${detailer.link_token}`;

  return (
    <AppShell
      area="admin"
      width="narrow"
      eyebrow="Edit detailer"
      title={
        <>
          {detailer.name}
          <span className="text-signal">.</span>
        </>
      }
      back={{ to: "/admin/detailers", label: "Detailers" }}
    >
      <DetailerLinkRow link={link} className="mt-3" />

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
    </AppShell>
  );
}
