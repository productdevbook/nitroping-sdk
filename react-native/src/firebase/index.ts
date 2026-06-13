/**
 * `nitroping-react-native/firebase` — optional convenience adapter for
 * `@react-native-firebase/messaging`.
 *
 * This subpath is the only place that references Firebase, and even then
 * only structurally (see `./messaging`). `@react-native-firebase/messaging`
 * is an **optional** peer dependency: import this subpath and install the
 * peer only if you use Firebase. Apps on Expo / bare can keep using the
 * agnostic `useRegisterDevice` from the package root.
 *
 * @example
 * ```tsx
 * import messaging from "@react-native-firebase/messaging"
 * import { useFirebaseRegistration } from "nitroping-react-native/firebase"
 *
 * function App() {
 *   const { status } = useFirebaseRegistration({
 *     messaging: messaging(),
 *     platform: "android",
 *   })
 *   // device token registered + refreshes handled + opens reported
 * }
 * ```
 */

export { type FirebaseMessaging, type FirebaseRemoteMessage, type Unsubscribe } from "./messaging";
export { nitropingIdsFromMessage, type NitropingIds } from "./ids";
export { createFirebaseTokenSource, type TokenSource } from "./tokenSource";
export {
  useFirebaseRegistration,
  type UseFirebaseRegistrationArgs,
} from "./useFirebaseRegistration";
