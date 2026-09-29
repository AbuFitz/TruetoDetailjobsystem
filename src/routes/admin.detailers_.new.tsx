import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { useRequireStaffSession } from "@/hooks/use-session";
import { createDetailer } from "@/lib/detailers";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export const Route = createFileRoute("/admin/detailers_/new")({
  head: () => ({
    meta: [{ title: "Add detailer | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: NewDetailer,
});

interface FormValues {
  name: string;
  phone: string;
  jobTitle: string;
  vehicleDescription: string;
  bio: string;
}

function NewDetailer() {
  useRequireStaffSession();
  const navigate = useNavigate();
  const { copied, copy } = useCopyToClipboard();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { name: "", phone: "", jobTitle: "", vehicleDescription: "", bio: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createDetailer({
        name: values.name,
        phone: values.phone || undefined,
        job_title: values.jobTitle || undefined,
        vehicle_description: values.vehicleDescription || undefined,
        bio: values.bio || undefined,
      }),
    onSuccess: (detailer) => setLinkToken(detailer.link_token),
  });

  const link = linkToken ? `${window.location.origin}/d/${linkToken}` : null;

  return (
    <AppShell
      area="admin"
      width="narrow"
      eyebrow="Add detailer"
      title={
        <>
          ADD A DETAILER<span className="text-signal">.</span>
        </>
      }
      back={{ to: "/admin/detailers", label: "Detailers" }}
    >
      {link ? (
        <div className="mt-5 rounded-2xl border border-success/30 bg-success/8 p-5 text-center">
          <p className="font-display text-lg">Detailer created</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Send them their persistent job link. No login needed.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-hairline bg-surface p-2.5">
            <p className="min-w-0 flex-1 truncate text-[13px]">{link}</p>
            <button
              type="button"
              onClick={() => copy(link)}
              aria-label={copied ? "Link copied" : "Copy detailer link"}
              className="press grid h-8 w-8 shrink-0 place-items-center border border-hairline"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <Link to="/admin/detailers" className="mt-4 inline-block">
            <PrimaryActionButton size="md" className="w-auto px-6">
              Done
            </PrimaryActionButton>
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((v) => createMutation.mutate(v))}
          className="mt-5 flex flex-col gap-4"
        >
          <Field id="name" label="Name" inputProps={register("name", { required: true })} />
          <Field id="phone" label="Phone (optional)" inputProps={register("phone")} />
          <Field
            id="jobTitle"
            label="Job title (optional)"
            placeholder="Senior Detailer"
            inputProps={register("jobTitle")}
          />
          <Field
            id="vehicleDescription"
            label="Vehicle (optional)"
            placeholder="White Transit Custom"
            inputProps={register("vehicleDescription")}
          />
          <PrimaryActionButton type="submit" loading={createMutation.isPending}>
            Create detailer
          </PrimaryActionButton>
        </form>
      )}
    </AppShell>
  );
}
