"use client";

export function EmptyState({
  icon: Icon,
  iconClassName,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType;
  iconClassName?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-center py-16 text-muted-foreground ${className ?? ""}`}>
      {Icon && <Icon className={`h-10 w-10 mx-auto mb-3 ${iconClassName ?? "opacity-30"}`} />}
      <p className={Icon ? "" : "text-sm"}>{title}</p>
      {description && <p className="text-sm mt-1">{description}</p>}
      {action && <div className="mt-4 inline-flex">{action}</div>}
    </div>
  );
}
