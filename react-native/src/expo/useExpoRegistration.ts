import { useEffect, useState } from "react";
import type { DevicePlatform } from "../client";
import { useNitroping } from "../react/useNitroping";
import { useRegisterDevice, type UseRegisterDeviceState } from "../react/useRegisterDevice";
import { nitropingIdsFromNotification } from "./ids";
import type { DevicePushToken, ExpoNotificationsModule } from "./notifications";

/** Arguments for {@link useExpoRegistration}. */
export interface UseExpoRegistrationArgs {
  /**
   * The `expo-notifications` module:
   * `import * as Notifications from "expo-notifications"`.
   */
  notifications: ExpoNotificationsModule;
  /**
   * Device platform. Optional — when omitted it's inferred from the native
   * token's `type` (`"ios"` / `"android"`). Pass it explicitly only if you
   * need to override the inference.
   */
  platform?: DevicePlatform;
  /** Opaque tenant-side user id, if signed in. */
  userId?: string;
  /** Tags for tag-based targeting. */
  tags?: string[];
  /** Arbitrary metadata stored with the device. */
  metadata?: Record<string, unknown>;
  /**
   * When `true` (default), ask for notification permission on mount before
   * fetching the token. Set `false` if your app requests permission itself
   * (e.g. behind a pre-permission UI) and you only want registration here.
   */
  requestPermission?: boolean;
  /**
   * When `true` (default), automatically report an `opened` engagement event
   * when the app is launched/foregrounded from a notification tap. Requires
   * the push payload's `data` to carry `notification_id` + `device_id`.
   */
  autoReportOpens?: boolean;
}

/**
 * One-call Expo wiring: requests permission, fetches the **native** device
 * push token via `getDevicePushTokenAsync`, re-registers on refresh, and
 * (optionally) reports notification opens. Combines `expo-notifications`
 * with {@link useRegisterDevice} so an app doesn't hand-wire the plumbing.
 *
 * IMPORTANT: this uses the native APNs/FCM token, NOT an Expo push token —
 * nitroping delivers through APNs/FCM directly. Do not feed it
 * `getExpoPushTokenAsync()` output.
 *
 * On iOS the APNs environment (sandbox vs production) is reported
 * automatically: development builds (Expo Dev Client / `expo run:ios`)
 * register as sandbox, release / TestFlight / App Store as production —
 * derived from the React Native `__DEV__` global by {@link useRegisterDevice}.
 *
 * ```tsx
 * import * as Notifications from "expo-notifications"
 * const { status } = useExpoRegistration({ notifications: Notifications })
 * ```
 *
 * Must be used within a {@link NitropingProvider}.
 */
export function useExpoRegistration(args: UseExpoRegistrationArgs): UseRegisterDeviceState {
  const {
    notifications,
    platform: platformOverride,
    userId,
    tags,
    metadata,
    requestPermission = true,
    autoReportOpens = true,
  } = args;
  const client = useNitroping();
  const [token, setToken] = useState<string | null>(null);
  const [platform, setPlatform] = useState<DevicePlatform | null>(platformOverride ?? null);

  // Acquire the initial native token (after permission) and subscribe to
  // refreshes.
  useEffect(() => {
    let active = true;

    const apply = (t: DevicePushToken) => {
      if (!active) return;
      setToken(t.data);
      if (!platformOverride && (t.type === "ios" || t.type === "android")) {
        setPlatform(t.type);
      }
    };

    const start = async () => {
      if (requestPermission) {
        const current = await notifications.getPermissionsAsync();
        if (!current.granted) {
          const asked = await notifications.requestPermissionsAsync();
          if (!asked.granted) return; // denied — stay idle, no token
        }
      }
      const t = await notifications.getDevicePushTokenAsync();
      apply(t);
    };

    start().catch(() => {
      /* permission denied or token fetch failed — stay idle, app can retry */
    });

    const subscription = notifications.addPushTokenListener(apply);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [notifications, requestPermission, platformOverride]);

  // Report an `opened` event when the app is opened from a notification.
  useEffect(() => {
    if (!autoReportOpens) return;
    let active = true;

    const report = (notification: Parameters<typeof nitropingIdsFromNotification>[0]) => {
      const ids = nitropingIdsFromNotification(notification);
      if (ids) {
        void client.reportEvent({ ...ids, type: "opened" }).catch(() => {
          /* engagement is best-effort */
        });
      }
    };

    // Cold start: app launched by tapping a notification.
    notifications.getLastNotificationResponseAsync().then(
      (response) => {
        if (active && response) report(response.notification);
      },
      () => {},
    );

    // Warm start: app in background, brought forward by a tap.
    const subscription = notifications.addNotificationResponseReceivedListener((response) => {
      report(response.notification);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [notifications, client, autoReportOpens]);

  return useRegisterDevice({
    token,
    platform: platform ?? "ios",
    userId,
    tags,
    metadata,
  });
}
