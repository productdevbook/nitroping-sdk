import { useCallback } from "react";
import { useNitroping } from "./useNitroping";

/** Imperative engagement reporters returned by {@link useNotificationEvents}. */
export interface NotificationEventReporters {
  /** Report that a notification was opened. */
  reportOpened(notificationId: string, deviceId: string): Promise<void>;
  /** Report that a notification action was clicked. */
  reportClicked(notificationId: string, deviceId: string, actionId?: string): Promise<void>;
}

/**
 * Returns stable callbacks for reporting engagement from a notification-tap
 * handler.
 *
 * ```tsx
 * const { reportOpened } = useNotificationEvents()
 * // in your notification-open handler:
 * await reportOpened(notificationId, deviceId)
 * ```
 */
export function useNotificationEvents(): NotificationEventReporters {
  const client = useNitroping();

  const reportOpened = useCallback(
    (notificationId: string, deviceId: string) =>
      client.reportEvent({ notificationId, deviceId, type: "opened" }),
    [client],
  );

  const reportClicked = useCallback(
    (notificationId: string, deviceId: string, actionId?: string) =>
      client.reportEvent({ notificationId, deviceId, type: "clicked", actionId }),
    [client],
  );

  return { reportOpened, reportClicked };
}
