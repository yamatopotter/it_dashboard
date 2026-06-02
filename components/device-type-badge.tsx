import { Badge } from "@/components/ui/badge";
import { Router, Camera, Tv, HelpCircle } from "lucide-react";
import type { DeviceType } from "@prisma/client";

const config: Record<DeviceType, { label: string; icon: React.ElementType; color: string }> = {
  MIKROTIK: { label: "Mikrotik", icon: Router, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  DVR: { label: "DVR", icon: Tv, color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  CAMERA: { label: "Câmera", icon: Camera, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  OTHER: { label: "Outro", icon: HelpCircle, color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
};

export function DeviceTypeBadge({ type }: { type: DeviceType }) {
  const { label, icon: Icon, color } = config[type];
  return (
    <Badge variant="outline" className={`gap-1 border-0 ${color}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
