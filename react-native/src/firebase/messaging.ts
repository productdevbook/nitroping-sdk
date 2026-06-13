/**
 * Structural types for the slice of `@react-native-firebase/messaging` we
 * use. Declared locally so this package does NOT hard-depend on Firebase —
 * the dependency is an *optional* peer. Consumers who don't use Firebase
 * never import this subpath and never install the peer.
 *
 * The shapes match `@react-native-firebase/messaging`'s public API.
 */

/** A remote message as delivered by FCM (only the fields we read). */
export interface FirebaseRemoteMessage {
  /** FCM message id. */
  messageId?: string;
  /**
   * Custom data payload. nitroping puts its ids here when you send with a
   * `data` map — typically `notification_id` and `device_id`.
   */
  data?: Record<string, string | undefined>;
}

/** Unsubscribe handle returned by the `on*` listeners. */
export type Unsubscribe = () => void;

/**
 * The subset of the Firebase messaging instance this adapter calls. Pass
 * `messaging()` from `@react-native-firebase/messaging`.
 */
export interface FirebaseMessaging {
  getToken(): Promise<string>;
  onTokenRefresh(listener: (token: string) => void): Unsubscribe;
  onMessage(listener: (message: FirebaseRemoteMessage) => void | Promise<void>): Unsubscribe;
  onNotificationOpenedApp(
    listener: (message: FirebaseRemoteMessage) => void | Promise<void>,
  ): Unsubscribe;
  getInitialNotification(): Promise<FirebaseRemoteMessage | null>;
}
