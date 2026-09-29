import { createFileRoute } from "@tanstack/react-router";
import { Car, MapPin, UserRound } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import {
  AppearanceSection,
  HelpSection,
  PasswordSection,
  SettingsCard,
  SettingsLink,
  SignOutSection,
} from "@/components/ttd/SettingsSections";
import { useRequireCustomerSession } from "@/hooks/use-session";

export const Route = createFileRoute("/account/settings")({
  head: () => ({
    meta: [{ title: "Settings | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AccountSettings,
});

function AccountSettings() {
  const { session, loading } = useRequireCustomerSession();
  if (loading || !session) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Loading settings" />
      </div>
    );
  }
  return (
    <AppShell
      area="customer"
      width="medium"
      eyebrow="Your account"
      title={
        <>
          SETTINGS<span className="text-signal">.</span>
        </>
      }
      back={{ to: "/account", label: "My Account" }}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SettingsCard title="Your details">
            <div className="flex flex-col gap-2">
              <SettingsLink
                to="/account/details"
                icon={UserRound}
                title="Name and phone"
                hint="How we address you and reach you"
              />
              <SettingsLink
                to="/account/addresses"
                icon={MapPin}
                title="Addresses"
                hint="Where we come to you"
              />
              <SettingsLink
                to="/account/vehicles"
                icon={Car}
                title="Your garage"
                hint="Cars saved for quick booking"
              />
            </div>
          </SettingsCard>
          <AppearanceSection />
          <HelpSection />
        </div>
        <div className="flex flex-col gap-4">
          <PasswordSection />
          <SignOutSection email={session.user.email} />
        </div>
      </div>
    </AppShell>
  );
}
