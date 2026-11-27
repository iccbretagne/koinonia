import Skeleton from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement de la galerie">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 sm:gap-2">
        {Array.from({ length: 18 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}
