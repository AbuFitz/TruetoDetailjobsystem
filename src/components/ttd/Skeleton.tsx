import { cn } from "@/lib/utils";

/** A shimmering placeholder in the shape of the thing that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/** The customer dashboard's shape while bookings load: hero card, then a short list. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading your bookings" className="flex flex-col gap-8">
      <div className="rounded-2xl bg-ink p-5 sm:p-7">
        <Skeleton className="h-3 w-24 !bg-white/10" />
        <Skeleton className="mt-5 h-16 w-3/4 !bg-white/10" />
        <Skeleton className="mt-4 h-7 w-1/2 !bg-white/10" />
        <div className="mt-6 flex gap-3 border-t border-white/10 pt-5">
          <Skeleton className="h-8 w-28 !bg-white/10" />
          <Skeleton className="ml-auto h-11 w-36 !bg-white/10" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-[88px] w-full" />
        <Skeleton className="h-[88px] w-full" />
      </div>
      <span className="sr-only">Loading your bookings</span>
    </div>
  );
}

/** Rows for admin and detailer lists. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-[132px] w-full" />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}
