import type { FirebaseRemoteMessage } from "./messaging";

/** A `(notificationId, deviceId)` pair extracted from a push payload. */
export interface NitropingIds {
  notificationId: string;
  deviceId: string;
}

/**
 * Pull nitroping's `notification_id` + `device_id` out of an FCM message's
 * `data` map. Returns `null` if either is missing (e.g. a non-nitroping
 * push), so callers can safely skip engagement reporting.
 *
 * Send notifications with these ids in the `data` map for tap-tracking to
 * work end to end.
 */
export function nitropingIdsFromMessage(message: FirebaseRemoteMessage): NitropingIds | null {
  const data = message.data;
  if (!data) return null;
  const notificationId = data["notification_id"];
  const deviceId = data["device_id"];
  if (!notificationId || !deviceId) return null;
  return { notificationId, deviceId };
}
