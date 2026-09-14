import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto w-full space-y-8 pb-6">
      {/* Greeting + hero number */}
      <div className="pt-2 space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-12 w-48 mt-1" />
        <Skeleton className="h-4 w-32 mt-1" />
      </div>

      {/* Progress bar */}
      <Skeleton className="h-2 w-full rounded-full" />

      {/* Coming up section */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/60">
          <div className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-16" />
        <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/60">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24 rounded-xl" />
        <Skeleton className="h-10 w-24 rounded-xl" />
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>

      {/* Financial snapshot */}
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
