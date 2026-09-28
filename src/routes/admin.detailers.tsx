import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Plus, UserRound } from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
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
    <main className="min-h-screen bg-background pb-16">
      <TtdHeader eyebrow="Detailers" containerClassName="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        <Link
          to="/admin"
          className="press inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        <div className="mt-4 flex items-center justify-between">
          <h1 className="font-display text-[28px] leading-none">Detailers</h1>
          <Link
            to="/admin/detailers/new"
            className="press inline-flex min-h-10 items-center gap-1.5 bg-signal px-3.5 font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-signal-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Link>
        </div>

        {isLoading ? (
          <BrandedLoading label="Loading detailers" className="mt-8" />
        ) : detailers && detailers.length > 0 ? (
          <div className="mt-5 flex flex-col gap-2.5">
            {detailers.map((d) => (
              <Link
                key={d.id}
                to="/admin/detailers/$id"
                params={{ id: d.id }}
                className="press flex items-center gap-3 border border-hairline bg-surface p-3.5 hover:bg-surface-2"
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
      </div>
    </main>
  );
}
