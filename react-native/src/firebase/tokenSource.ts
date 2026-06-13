import type { FirebaseMessaging, Unsubscribe } from "./messaging";

/**
 * A platform-agnostic push-token source: the current token plus a
 * subscription for refreshes. {@link useRegisterDevice} and
 * {@link useFirebaseRegistration} consume this.
 */
export interface TokenSource {
  /** Fetch the current push token. */
  getToken(): Promise<string>;
  /** Subscribe to token refreshes. Returns an unsubscribe function. */
  onRefresh(listener: (token: string) => void): Unsubscribe;
}

/**
 * Build a {@link TokenSource} from a Firebase messaging instance.
 *
 * ```ts
 * import messaging from "@react-native-firebase/messaging"
 * import { createFirebaseTokenSource } from "nitroping-react-native/firebase"
 *
 * const source = createFirebaseTokenSource(messaging())
 * ```
 */
export function createFirebaseTokenSource(messaging: FirebaseMessaging): TokenSource {
  return {
    getToken: () => messaging.getToken(),
    onRefresh: (listener) => messaging.onTokenRefresh(listener),
  };
}
