# nitroping-react-native (React Native SDK)

[![npm version](https://img.shields.io/npm/v/nitroping-react-native?logo=npm&color=cb3837)](https://www.npmjs.com/package/nitroping-react-native)
[![npm downloads](https://img.shields.io/npm/dm/nitroping-react-native?logo=npm)](https://www.npmjs.com/package/nitroping-react-native)
[![license MIT](https://img.shields.io/npm/l/nitroping-react-native)](https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/nitroping-react-native?logo=typescript)](https://github.com/productdevbook/nitroping-sdk/tree/main/react-native)

> React Native SDK for [nitroping](https://nitroping.dev) push notifications.
> Register device tokens (APNs/FCM) and report engagement — with a provider +
> hooks. **Bring your own token source** (Firebase, Expo, or bare).

> 📦 Part of the [**nitroping-sdk**](https://github.com/productdevbook/nitroping-sdk) monorepo. Built on the core [`nitroping`](https://www.npmjs.com/package/nitroping) package. See the [root README](https://github.com/productdevbook/nitroping-sdk#readme) for SDKs in other languages.

## What this does (and doesn't)

This package is the **device-side** half of nitroping:

- ✅ Register / refresh a device's push token with nitroping
- ✅ Deactivate a device (e.g. on logout)
- ✅ Report engagement (opened / clicked) when a notification is tapped
- ✅ React `Provider` + hooks for ergonomics

It does **not** acquire the APNs/FCM token for you, and it does **not** send
notifications (that's a server concern, done with a secret `np_` key). You
acquire the push token however your app already does — then pass it in.

Use a **public** `pk_` key here. Never embed a secret `np_` key in an app.

## Install

```sh
npm install nitroping-react-native
# or
pnpm add nitroping-react-native
# or
yarn add nitroping-react-native
```

Peer deps: `react >= 18`, `react-native >= 0.74`. If you target older RN where
`URL` is incomplete, also add [`react-native-url-polyfill`](https://github.com/charpeni/react-native-url-polyfill)
and import it at your app entry.

## Quick Start

Wrap your app in a provider with your public key:

```tsx
import { NitropingProvider } from "nitroping-react-native";

export default function Root() {
  return (
    <NitropingProvider publicKey="pk_live_...">
      <App />
    </NitropingProvider>
  );
}
```

Register the device token and report taps:

```tsx
import { useRegisterDevice, useNotificationEvents } from "nitroping-react-native";

function App() {
  const token = useFcmToken(); // your token source — see below
  const { device, status } = useRegisterDevice({ token, platform: "ios" });

  const { reportOpened } = useNotificationEvents();
  // in your notification-open handler, once you know the notificationId:
  // await reportOpened(notificationId, device!.id)

  return; /* ... */
}
```

## Token sources (bring your own)

The SDK is agnostic about how you get the push token — pass `null` until you
have it, then pass the string. The hook re-registers automatically when the
token changes (refresh-safe).

### `@react-native-firebase/messaging`

```ts
import messaging from "@react-native-firebase/messaging";
import { useEffect, useState } from "react";

function useFcmToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    messaging().getToken().then(setToken);
    return messaging().onTokenRefresh(setToken);
  }, []);
  return token;
}
```

### `expo-notifications`

Use the **native** device token — `getDevicePushTokenAsync()` — not
`getExpoPushTokenAsync()`. nitroping delivers through APNs / FCM directly, so
an Expo push token (`ExponentPushToken[...]`) will look "sent" but never
arrive.

```ts
import * as Notifications from "expo-notifications";
const { data: token } = await Notifications.getDevicePushTokenAsync(); // native APNs/FCM token
```

Prefer the one-liner below — it handles permission, token, refresh, and
opens for you.

### Bare `PushNotificationIOS`

Grab the token from the `register` event and feed it into `useRegisterDevice`.

## Firebase one-liner (optional)

If you use `@react-native-firebase/messaging`, the `nitroping-react-native/firebase`
subpath wires the token fetch, refresh, **and** notification-open reporting
for you. `@react-native-firebase/messaging` is an **optional** peer — install
it only if you use this path.

```tsx
import messaging from "@react-native-firebase/messaging";
import { useFirebaseRegistration } from "nitroping-react-native/firebase";

function App() {
  // Fetches the FCM token, re-registers on refresh, and reports an `opened`
  // event when the app is launched from a notification tap.
  const { status } = useFirebaseRegistration({
    messaging: messaging(),
    platform: "android",
  });
  return; /* ... */
}
```

For tap-tracking to work, send notifications with `notification_id` +
`device_id` in the `data` map. To report opens manually instead, set
`autoReportOpens: false` and use `useNotificationEvents()`.

### Background data messages

Firebase delivers data-only messages to a headless handler registered at the
app entry (outside React). Report engagement from there with the plain client:

```ts
import messaging from "@react-native-firebase/messaging";
import { NitropingDevice } from "nitroping-react-native";
import { nitropingIdsFromMessage } from "nitroping-react-native/firebase";

const device = new NitropingDevice({ publicKey: "pk_live_..." });

messaging().setBackgroundMessageHandler(async (msg) => {
  const ids = nitropingIdsFromMessage(msg);
  if (ids) await device.reportEvent({ ...ids, type: "opened" });
});
```

## Expo one-liner (optional)

If you use Expo, the `nitroping-react-native/expo` subpath asks for permission,
fetches the **native** device token (`getDevicePushTokenAsync`), re-registers
on refresh, **and** reports notification opens. `expo-notifications` is an
**optional** peer — install it only if you use this path.

```tsx
import * as Notifications from "expo-notifications";
import { NitropingProvider } from "nitroping-react-native";
import { useExpoRegistration } from "nitroping-react-native/expo";

function Register() {
  // Permission → native token → register → refresh → opens. Platform is
  // inferred from the token; on iOS the APNs environment (sandbox vs
  // production) is set automatically from `__DEV__`.
  const { status } = useExpoRegistration({ notifications: Notifications });
  return null;
}

export default function App() {
  return (
    <NitropingProvider publicKey="pk_live_...">
      <Register />
      {/* ...rest of your app */}
    </NitropingProvider>
  );
}
```

> **Native token, not Expo push token.** This path uses
> `getDevicePushTokenAsync` on purpose. Do **not** pass `getExpoPushTokenAsync`
> output — that `ExponentPushToken[...]` only works with Expo's own push
> service, and a push to it will look "sent" but never reach the device.

For tap-tracking, send notifications with `notification_id` + `device_id` in
the `data` map (nitroping also echoes `nitroping_notification_id` /
`nitroping_device_id`; both are recognised). To report opens manually instead,
pass `autoReportOpens: false`. If your app requests notification permission
itself, pass `requestPermission: false`.

## API

### `<NitropingProvider>`

Provide a client. Either inline options or a pre-built `client`:

```tsx
<NitropingProvider publicKey="pk_..." baseUrl="https://nitroping.dev">
  …
</NitropingProvider>
```

### `useRegisterDevice({ token, platform, userId?, tags?, metadata?, environment? })`

Registers on mount and re-registers when `token` changes. Returns
`{ device, status, error }` where `status` is
`"idle" | "registering" | "registered" | "error"`. Stays idle while `token` is
`null`. On iOS, `environment` (`"sandbox" | "production"`) defaults from
`__DEV__` when omitted.

### `useExpoRegistration({ notifications, platform?, userId?, tags?, metadata?, requestPermission?, autoReportOpens? })`

From `nitroping-react-native/expo`. Permission + native token + register +
refresh + opens, in one hook. Returns the same shape as `useRegisterDevice`.

### `useFirebaseRegistration({ messaging, platform, ... })`

From `nitroping-react-native/firebase`. FCM token + register + refresh +
opens, in one hook.

### `useNotificationEvents()`

Returns `{ reportOpened(notificationId, deviceId), reportClicked(notificationId, deviceId, actionId?) }`.

### `useNitroping()`

Returns the underlying `NitropingDevice` for imperative use
(`registerDevice`, `deactivateDevice`, `reportEvent`). Throws if used outside a
provider.

### `new NitropingDevice({ publicKey, baseUrl?, timeoutMs?, fetch? })`

The non-React client, if you don't want hooks.

## License

MIT © productdevbook
