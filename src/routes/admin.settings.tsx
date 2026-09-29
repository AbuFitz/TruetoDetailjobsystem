import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Globe } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import {
  AppearanceSection,
  PasswordSection,
  SettingsCard,
  SignOutSection,
} from "@/components/ttd/SettingsSections";
import { useRequireStaffSession } from "@/hooks/use-session";
import { ttdSiteLinks } from "@/lib/constants";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminSettings,
});

function AdminSettings() {
  const { session, loading, isStaff } = useRequireStaffSession();
  if (loading || !session || isStaff === null) {
    return (
      <div className="min-h-screen bg-background">
        <BrandedLoading label="Loading settings" />
      </div>
    );
  }
  return (
    <AppShell
      area="admin"
      width="medium"
      eyebrow="Staff console"
      title={
        <>
          SETTINGS<span className="text-signal">.</span>
        </>
      }
      back={{ to: "/admin", label: "Today" }}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <AppearanceSection />
          <SettingsCard title="Links" description="Handy places outside the console.">
            <a
              href={ttdSiteLinks.website}
              target="_blank"
              rel="noopener noreferrer"
              className="press flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 p-3.5 hover:bg-surface"
            >
              <Globe className="h-5 w-5 text-signal" strokeWidth={2.1} />
              <span className="flex-1 text-[15px] font-medium">The website</span>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </SettingsCard>
        </div>
        <div className="flex flex-col gap-4">
          <PasswordSection />
          <SignOutSection email={session.user.email} />
        </div>
      </div>
    </AppShell>
  );
}
