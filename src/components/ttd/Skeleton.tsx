import { cn } from "@/lib/utils";

/** A shimmering placeholder in the shape of the thing that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/** The customer dashboard's shape while bookings load: the "now" band, then a short rail. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading your bookings" className="flex flex-col gap-8">
      <div className="border-l-4 border-hairline pl-5 sm:pl-7">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-16 w-3/4" />
        <Skeleton className="mt-4 h-7 w-1/2" />
        <div className="mt-5 flex gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="ml-auto h-11 w-36" />
        </div>
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
