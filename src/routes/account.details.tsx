import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
import { Field } from "@/components/ttd/FormField";
import { PrimaryActionButton } from "@/components/ttd/PrimaryActionButton";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useRequireCustomerSession } from "@/hooks/use-session";
import { getMyProfile, updateMyProfile } from "@/lib/customers";
import { updateMyPassword } from "@/lib/auth";
import { supportContact } from "@/lib/constants";

export const Route = createFileRoute("/account/details")({
  head: () => ({
    meta: [{ title: "Your Details | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: DetailsPage,
});

interface ProfileValues {
  first_name: string;
  last_name: string;
  phone: string;
}

interface PasswordValues {
  password: string;
  confirm: string;
}

const PHONE_RE = /^[\d\s+\-()]{7,20}$/;

function DetailsPage() {
  const { session, loading: authLoading } = useRequireCustomerSession();
  const queryClient = useQueryClient();
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: getMyProfile,
    enabled: Boolean(session),
  });

  const profileForm = useForm<ProfileValues>({
    defaultValues: { first_name: "", last_name: "", phone: "" },
  });
  const passwordForm = useForm<PasswordValues>({ defaultValues: { password: "", confirm: "" } });

  useEffect(() => {
    if (profile) {
      profileForm.reset({
        first_name: profile.first_name,
        last_name: profile.last_name ?? "",
        phone: profile.phone ?? "",
      });
    }
  }, [profile, profileForm]);

  const profileMutation = useMutation({
    mutationFn: (v: ProfileValues) =>
      updateMyProfile({
        first_name: v.first_name.trim(),
        last_name: v.last_name.trim() || null,
        phone: v.phone.trim() || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["my-profile"], updated);
      setProfileSaved(true);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (v: PasswordValues) => updateMyPassword(v.password),
    onSuccess: () => {
      passwordForm.reset();
      setPasswordSaved(true);
    },
  });

  if (authLoading || isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <BrandedLoading label="Loading your details" />
      </main>
    );
  }

  const pErrors = profileForm.formState.errors;
  const pwErrors = passwordForm.formState.errors;

  return (
    <main className="min-h-screen bg-background pb-16">
      <TtdHeader eyebrow="Your Details" containerClassName="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        <Link
          to="/account"
          className="press inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Your account
        </Link>

        <h1 className="mt-4 font-display text-[28px] leading-none">Your Details</h1>

        <form
          onSubmit={profileForm.handleSubmit((v) => {
            setProfileSaved(false);
            profileMutation.mutate(v);
          })}
          className="mt-5 flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-5"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="first_name"
              label="First name"
              error={pErrors.first_name?.message}
              inputProps={profileForm.register("first_name", {
                validate: (v) => v.trim().length > 0 || "Enter your first name.",
              })}
            />
            <Field id="last_name" label="Last name" inputProps={profileForm.register("last_name")} />
          </div>
          <Field
            id="phone"
            label="Phone"
            type="tel"
            error={pErrors.phone?.message}
            inputProps={profileForm.register("phone", {
              validate: (v) => !v.trim() || PHONE_RE.test(v.trim()) || "Enter a valid phone number.",
            })}
          />
          <div>
            <span className="eyebrow block text-muted-foreground">Email</span>
            <p className="mt-2 text-[15px] font-medium">{profile?.email ?? session?.user.email}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              To change the email you sign in with, contact us on {supportContact.phone}.
            </p>
          </div>

          {profileMutation.isError ? (
            <p className="text-[13px] text-destructive">
              {profileMutation.error instanceof Error
                ? profileMutation.error.message
                : "Couldn't save your details."}
            </p>
          ) : null}

          <PrimaryActionButton type="submit" loading={profileMutation.isPending}>
            {profileSaved && !profileForm.formState.isDirty ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.6} /> Saved
              </>
            ) : (
              "Save details"
            )}
          </PrimaryActionButton>
        </form>

        <form
          onSubmit={passwordForm.handleSubmit((v) => {
            setPasswordSaved(false);
            passwordMutation.mutate(v);
          })}
          className="mt-4 flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-5"
        >
          <p className="eyebrow text-muted-foreground">Change password</p>
          <Field
            id="password"
            label="New password"
            type="password"
            error={pwErrors.password?.message}
            inputProps={passwordForm.register("password", {
              minLength: { value: 6, message: "Use at least 6 characters." },
              required: "Enter a new password.",
            })}
          />
          <Field
            id="confirm"
            label="Confirm new password"
            type="password"
            error={pwErrors.confirm?.message}
            inputProps={passwordForm.register("confirm", {
              validate: (v) => v === passwordForm.getValues("password") || "Passwords don't match.",
            })}
          />
          {passwordMutation.isError ? (
            <p className="text-[13px] text-destructive">
              {passwordMutation.error instanceof Error
                ? passwordMutation.error.message
                : "Couldn't change your password."}
            </p>
          ) : null}
          {passwordSaved ? (
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-success">
              <Check className="h-4 w-4" strokeWidth={2.6} /> Password updated
            </p>
          ) : null}
          <PrimaryActionButton type="submit" variant="ink" loading={passwordMutation.isPending}>
            Update password
          </PrimaryActionButton>
        </form>
      </div>
    </main>
  );
}
