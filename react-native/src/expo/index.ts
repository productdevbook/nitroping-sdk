/**
 * `nitroping-react-native/expo` — optional convenience adapter for
 * `expo-notifications`.
 *
 * This subpath is the only place that references Expo, and even then only
 * structurally (see `./notifications`). `expo-notifications` is an
 * **optional** peer dependency: import this subpath and install the peer
 * only if you use Expo. Apps on bare RN / Firebase can keep using the
 * agnostic `useRegisterDevice` from the package root or the `/firebase`
 * subpath.
 *
 * ## Native token, not Expo push token
 *
 * nitroping delivers through APNs / FCM directly, so it needs the **native**
 * device push token (`getDevicePushTokenAsync`). Do NOT pass an Expo push
 * token (`getExpoPushTokenAsync`, `ExponentPushToken[...]`) — that only
 * works with Expo's own push service and will look "sent" but never arrive.
 *
 * @example
 * ```tsx
 * import * as Notifications from "expo-notifications"
 * import { NitropingProvider } from "nitroping-react-native"
 * import { useExpoRegistration } from "nitroping-react-native/expo"
 *
 * function Register() {
 *   const { status } = useExpoRegistration({ notifications: Notifications })
 *   // permission asked + native token registered + refresh + opens reported
 *   return null
 * }
 *
 * export default function App() {
 *   return (
 *     <NitropingProvider publicKey="pk_...">
 *       <Register />
 *     </NitropingProvider>
 *   )
 * }
 * ```
 */

export {
  type DevicePushToken,
  type ExpoNotification,
  type ExpoNotificationResponse,
  type ExpoNotificationsModule,
  type ExpoPermissionResponse,
  type ExpoSubscription,
} from "./notifications";
export { nitropingIdsFromNotification, type NitropingIds } from "./ids";
export { useExpoRegistration, type UseExpoRegistrationArgs } from "./useExpoRegistration";
