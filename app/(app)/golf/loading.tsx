import { Skeleton } from "@/components/ui/skeleton";

export default function GolfLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-8" aria-hidden>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-12 w-80 max-w-full" />
      <Skeleton className="mt-4 h-5 w-full max-w-xl" />
      <div className="mt-6 flex gap-3">
        <Skeleton className="h-12 w-44 rounded-full" />
        <Skeleton className="h-12 w-32 rounded-full" />
      </div>
      <Skeleton className="mt-12 h-8 w-40" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
