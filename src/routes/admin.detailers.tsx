import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus, UserRound } from "lucide-react";
import { AppShell } from "@/components/ttd/AppShell";
import { Avatar } from "@/components/ttd/Avatar";
import { EmptyState } from "@/components/ttd/EmptyState";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useRequireStaffSession } from "@/hooks/use-session";
import { listDetailers } from "@/lib/detailers";

export const Route = createFileRoute("/admin/detailers")({
  head: () => ({
    meta: [{ title: "Detailers | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: DetailersList,
});

function DetailersList() {
  useRequireStaffSession();
  const { data: detailers, isLoading } = useQuery({
    queryKey: ["admin-detailers"],
    queryFn: listDetailers,
  });

  return (
    <AppShell
      area="admin"
      width="wide"
      eyebrow="Your team"
      title={
        <>
          DETAILERS<span className="text-signal">.</span>
        </>
      }
      back={{ to: "/admin", label: "Today" }}
      actions={
        <Link
          to="/admin/detailers/new"
          className="press inline-flex min-h-11 items-center gap-2 bg-signal px-5 text-[12px] font-bold uppercase tracking-[0.12em] text-signal-foreground hover:bg-signal-deep"
        >
          <Plus className="h-4 w-4" strokeWidth={2.8} />
          Add detailer
        </Link>
      }
    >
      {isLoading ? (
        <BrandedLoading label="Loading detailers" className="mt-8" />
      ) : detailers && detailers.length > 0 ? (
        <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
          {detailers.map((d) => (
            <Link
              key={d.id}
              to="/admin/detailers/$id"
              params={{ id: d.id }}
              className="press flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3.5 hover:bg-surface-2"
            >
              <Avatar name={d.name} photoUrl={d.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{d.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {d.job_title || (d.active ? "Active" : "Inactive")}
                </p>
              </div>
              {!d.active ? (
                <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                  Inactive
                </span>
              ) : null}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState className="mt-6" icon={UserRound} title="No detailers yet" />
      )}
    </AppShell>
  );
}
