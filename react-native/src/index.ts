/**
 * `nitroping-react-native` — device-side push SDK for React Native.
 *
 * @example
 * ```tsx
 * import { NitropingProvider, useRegisterDevice } from "nitroping-react-native"
 *
 * function Root() {
 *   return (
 *     <NitropingProvider publicKey="pk_live_...">
 *       <App />
 *     </NitropingProvider>
 *   )
 * }
 *
 * function App() {
 *   const token = useFcmToken() // your token source (Firebase/Expo/bare)
 *   const { status } = useRegisterDevice({ token, platform: "ios" })
 *   // ...
 * }
 * ```
 *
 * Bring your own token: this package does NOT talk to APNs/FCM. Acquire the
 * push token however your app already does (`@react-native-firebase/messaging`,
 * `expo-notifications`, or bare `PushNotificationIOS`) and pass it in.
 */

export {
  NitropingDevice,
  type DevicePlatform,
  type NitropingDeviceOptions,
  type RegisterInput,
  type ReportEventInput,
} from "./client";
export { NitropingContext } from "./react/context";
export { NitropingProvider, type NitropingProviderProps } from "./react/provider";
export {
  useNotificationEvents,
  type NotificationEventReporters,
} from "./react/useNotificationEvents";
export { useNitroping } from "./react/useNitroping";
export {
  useRegisterDevice,
  type UseRegisterDeviceArgs,
  type UseRegisterDeviceState,
} from "./react/useRegisterDevice";

// Re-export the core error/types so consumers don't also import `nitroping`.
export {
  NetworkError,
  NitropingError,
  type Platform,
  type RegisterDeviceResponse,
} from "nitroping";
