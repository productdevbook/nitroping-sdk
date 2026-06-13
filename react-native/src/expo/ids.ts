import type { ExpoNotification } from "./notifications";

/** A `(notificationId, deviceId)` pair extracted from a push payload. */
export interface NitropingIds {
  notificationId: string;
  deviceId: string;
}

/**
 * Pull nitroping's `notification_id` + `device_id` out of an Expo
 * notification's content `data` map. Returns `null` if either is missing
 * (e.g. a non-nitroping push), so callers can safely skip engagement
 * reporting.
 *
 * nitroping echoes them under the `nitroping_*` namespace (matching the
 * FCM/APNs server output); the bare `notification_id` / `device_id`
 * spellings are also accepted for backward compatibility. The namespaced
 * keys win, so a customer's own `notification_id` isn't mistaken for ours.
 *
 * Send notifications with these ids in the `data` map for tap-tracking to
 * work end to end.
 */
export function nitropingIdsFromNotification(notification: ExpoNotification): NitropingIds | null {
  const data = notification.request.content.data;
  if (!data) return null;
  const notificationId = pick(data, "nitroping_notification_id", "notification_id");
  const deviceId = pick(data, "nitroping_device_id", "device_id");
  if (!notificationId || !deviceId) return null;
  return { notificationId, deviceId };
}

function pick(data: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
