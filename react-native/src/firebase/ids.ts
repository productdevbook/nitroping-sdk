import type { FirebaseRemoteMessage } from "./messaging";

/** A `(notificationId, deviceId)` pair extracted from a push payload. */
export interface NitropingIds {
  notificationId: string;
  deviceId: string;
}

/**
 * Pull nitroping's notification + device id out of an FCM message's `data`
 * map. Returns `null` if either is missing (e.g. a non-nitroping push), so
 * callers can safely skip engagement reporting.
 *
 * nitroping sends these under the `nitroping_*` namespace (matching APNs);
 * the bare `notification_id` / `device_id` spellings are also accepted for
 * backward compatibility with older server builds and so a customer's own
 * `notification_id` isn't mistaken for ours. The namespaced keys win.
 *
 * Send notifications with these ids in the `data` map for tap-tracking to
 * work end to end.
 */
export function nitropingIdsFromMessage(message: FirebaseRemoteMessage): NitropingIds | null {
  const data = message.data;
  if (!data) return null;
  const notificationId = pick(data, "nitroping_notification_id", "notification_id");
  const deviceId = pick(data, "nitroping_device_id", "device_id");
  if (!notificationId || !deviceId) return null;
  return { notificationId, deviceId };
}

function pick(data: Record<string, string | undefined>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
