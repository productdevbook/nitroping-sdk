/**
 * Structural types for the slice of `expo-notifications` this adapter uses.
 * Declared locally so this package does NOT hard-depend on Expo — the
 * dependency is an *optional* peer. Consumers who don't use Expo never
 * import this subpath and never install the peer.
 *
 * The shapes match `expo-notifications`' public API (SDK 50+).
 */

/** Unsubscribe handle returned by the `add*Listener` functions. */
export interface ExpoSubscription {
  remove(): void;
}

/**
 * The native device push token, as returned by `getDevicePushTokenAsync`.
 *
 * IMPORTANT: this is the **native APNs/FCM token**, NOT an Expo push token.
 * nitroping talks to APNs/FCM directly, so it needs the native token — pass
 * `getDevicePushTokenAsync`, never `getExpoPushTokenAsync` (whose
 * `ExponentPushToken[...]` value only works with Expo's own push service).
 */
export interface DevicePushToken {
  /** Platform discriminator. */
  type: "ios" | "android" | string;
  /** The token string (iOS: APNs hex; Android: FCM token). */
  data: string;
}

/** A notification's content `data` map (only the field shape we read). */
export interface ExpoNotificationContent {
  data?: Record<string, unknown>;
}

/** A notification as surfaced by `expo-notifications`. */
export interface ExpoNotification {
  request: {
    content: ExpoNotificationContent;
  };
}

/** The response delivered when a user taps a notification. */
export interface ExpoNotificationResponse {
  notification: ExpoNotification;
}

/** Result of a permission request / query. */
export interface ExpoPermissionResponse {
  granted: boolean;
  /** iOS finer-grained status; present only on iOS. */
  status?: string;
  canAskAgain?: boolean;
}

/**
 * The subset of the `expo-notifications` module this adapter calls. Pass
 * the module itself: `import * as Notifications from "expo-notifications"`.
 */
export interface ExpoNotificationsModule {
  getPermissionsAsync(): Promise<ExpoPermissionResponse>;
  requestPermissionsAsync(): Promise<ExpoPermissionResponse>;
  /**
   * Returns the NATIVE device push token (APNs/FCM). This is what nitroping
   * needs — not `getExpoPushTokenAsync`.
   */
  getDevicePushTokenAsync(): Promise<DevicePushToken>;
  addPushTokenListener(listener: (token: DevicePushToken) => void): ExpoSubscription;
  addNotificationResponseReceivedListener(
    listener: (response: ExpoNotificationResponse) => void,
  ): ExpoSubscription;
  getLastNotificationResponseAsync(): Promise<ExpoNotificationResponse | null>;
}
