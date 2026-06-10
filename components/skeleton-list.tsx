import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonList({
  count = 5,
  height = "h-14",
  rounded = "rounded-lg",
}: {
  count?: number;
  height?: string;
  rounded?: string;
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${height} ${rounded}`} />
      ))}
    </div>
  );
}
