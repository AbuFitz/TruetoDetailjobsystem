import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search, Users, X } from "lucide-react";
import { TtdHeader } from "@/components/ttd/Header";
import { EmptyState } from "@/components/ttd/EmptyState";
import { BrandedLoading } from "@/components/ttd/BrandedLoading";
import { useRequireStaffSession } from "@/hooks/use-session";
import { listCustomers } from "@/lib/customers";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({
    meta: [{ title: "Customers | True To Detail" }, { name: "robots", content: "noindex" }],
  }),
  component: CustomersList,
});

function CustomersList() {
  useRequireStaffSession();
  const [query, setQuery] = useState("");
  const { data: customers, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: listCustomers,
  });

  const filtered = useMemo(() => {
    const all = customers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) =>
      [c.first_name, c.last_name, c.email, c.phone]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [customers, query]);

  return (
    <main className="min-h-screen bg-background pb-16">
      <TtdHeader eyebrow="Customers" containerClassName="max-w-2xl" />

      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-6">
        <Link
          to="/admin"
          className="press inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>

        <h1 className="mt-4 font-display text-[28px] leading-none">Customers</h1>

        <div className="relative mt-5">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2.2}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or phone"
            className="min-h-11 w-full rounded-xl border border-hairline bg-surface-2 pl-10 pr-9 text-base outline-none transition-colors focus:border-signal focus:bg-surface focus:ring-2 focus:ring-signal/30"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="press absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <BrandedLoading label="Loading customers" className="mt-8" />
        ) : filtered.length > 0 ? (
          <div className="mt-5 flex flex-col gap-2">
            {filtered.map((c) => (
              <Link
                key={c.id}
                to="/admin/customers/$id"
                params={{ id: c.id }}
                className="press flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">
                    {c.first_name} {c.last_name}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    c.auth_user_id
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-hairline bg-surface-2 text-muted-foreground"
                  }`}
                >
                  {c.auth_user_id ? "Signed up" : "Walk-in"}
                </span>
              </Link>
            ))}
          </div>
        ) : query ? (
          <EmptyState className="mt-6" icon={Search} title="No matches" />
        ) : (
          <EmptyState className="mt-6" icon={Users} title="No customers yet" />
        )}
      </div>
    </main>
  );
}
