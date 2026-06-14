"use client";

import { useRef, useCallback } from "react";
import type { Device, DeviceStatus } from "@prisma/client";

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null };

const COOLDOWN_MS = 5 * 60 * 1000;

export function useDeviceNotifications() {
  const prevOnline = useRef<Map<string, boolean>>(new Map());
  const cooldowns = useRef<Map<string, number>>(new Map());

  const notify = useCallback((devices: DeviceWithStatus[]) => {
    if (typeof window === "undefined" || Notification.permission !== "granted") return;

    const now = Date.now();
    for (const device of devices) {
      const isOnline = device.currentStatus?.isOnline ?? false;
      const wasOnline = prevOnline.current.get(device.id);

      if (wasOnline !== undefined && wasOnline !== isOnline) {
        const lastFired = cooldowns.current.get(device.id) ?? 0;
        if (now - lastFired > COOLDOWN_MS) {
          new Notification(isOnline ? `✅ ${device.name} voltou` : `🔴 ${device.name} offline`, {
            body: `${device.ip}${device.location ? ` · ${device.location}` : ""}`,
            tag: device.id,
          });
          cooldowns.current.set(device.id, now);
        }
      }

      prevOnline.current.set(device.id, isOnline);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  return { notify, requestPermission };
}
