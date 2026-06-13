import { useEffect, useState } from "react";
import type { DevicePlatform } from "../client";
import { useNitroping } from "../react/useNitroping";
import { useRegisterDevice, type UseRegisterDeviceState } from "../react/useRegisterDevice";
import { nitropingIdsFromMessage } from "./ids";
import type { FirebaseMessaging, FirebaseRemoteMessage } from "./messaging";
import { createFirebaseTokenSource } from "./tokenSource";

/** Arguments for {@link useFirebaseRegistration}. */
export interface UseFirebaseRegistrationArgs {
  /** The Firebase messaging instance — `messaging()`. */
  messaging: FirebaseMessaging;
  /** Device platform. */
  platform: DevicePlatform;
  /** Opaque tenant-side user id, if signed in. */
  userId?: string;
  /** Tags for tag-based targeting. */
  tags?: string[];
  /** Arbitrary metadata stored with the device. */
  metadata?: Record<string, unknown>;
  /**
   * When `true` (default), automatically report an `opened` engagement
   * event when the app is launched/foregrounded from a notification tap
   * (via `onNotificationOpenedApp` + `getInitialNotification`). Requires the
   * push payload's `data` to carry `notification_id` + `device_id`.
   */
  autoReportOpens?: boolean;
}

/**
 * One-call Firebase wiring: fetches the FCM token, re-registers on refresh,
 * and (optionally) reports notification opens. Combines
 * {@link createFirebaseTokenSource} + {@link useRegisterDevice} so an app
 * doesn't hand-wire the token plumbing.
 *
 * ```tsx
 * import messaging from "@react-native-firebase/messaging"
 * const { status } = useFirebaseRegistration({ messaging: messaging(), platform: "android" })
 * ```
 *
 * Must be used within a {@link NitropingProvider}.
 */
export function useFirebaseRegistration(args: UseFirebaseRegistrationArgs): UseRegisterDeviceState {
  const { messaging, platform, userId, tags, metadata, autoReportOpens = true } = args;
  const client = useNitroping();
  const [token, setToken] = useState<string | null>(null);

  // Acquire the initial token and subscribe to refreshes.
  useEffect(() => {
    let active = true;
    const source = createFirebaseTokenSource(messaging);

    source.getToken().then(
      (t) => {
        if (active) setToken(t);
      },
      () => {
        /* token fetch failed — stay null; the app can retry */
      },
    );

    const unsubscribe = source.onRefresh((t) => {
      if (active) setToken(t);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [messaging]);

  // Report an `opened` event when the app is opened from a notification.
  useEffect(() => {
    if (!autoReportOpens) return;

    const report = (msg: FirebaseRemoteMessage) => {
      const ids = nitropingIdsFromMessage(msg);
      if (ids) {
        void client.reportEvent({ ...ids, type: "opened" }).catch(() => {
          /* engagement is best-effort */
        });
      }
    };

    // Cold start: app launched by tapping a notification.
    messaging.getInitialNotification().then(
      (msg) => {
        if (msg) report(msg);
      },
      () => {},
    );

    // Warm start: app in background, brought forward by a tap.
    const unsubscribe = messaging.onNotificationOpenedApp((msg) => report(msg));
    return () => unsubscribe();
  }, [messaging, client, autoReportOpens]);

  return useRegisterDevice({ token, platform, userId, tags, metadata });
}
