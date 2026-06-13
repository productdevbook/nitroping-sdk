import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NitropingDevice, NitropingProvider } from "../src/index";
import {
  nitropingIdsFromNotification,
  useExpoRegistration,
  type DevicePushToken,
  type ExpoNotificationResponse,
  type ExpoNotificationsModule,
} from "../src/expo";

function mockFetch(impl: (req: { url: string; init: RequestInit }) => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    return impl({ url, init: init ?? {} });
  });
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

// A controllable fake of the expo-notifications module.
function fakeNotifications(
  opts: {
    token?: DevicePushToken;
    granted?: boolean;
    canAskGrant?: boolean;
    lastResponse?: ExpoNotificationResponse | null;
  } = {},
): ExpoNotificationsModule & {
  emitRefresh(token: DevicePushToken): void;
  emitOpened(response: ExpoNotificationResponse): void;
} {
  let refreshCb: ((t: DevicePushToken) => void) | null = null;
  let openedCb: ((r: ExpoNotificationResponse) => void) | null = null;
  const granted = opts.granted ?? true;
  return {
    getPermissionsAsync: async () => ({ granted }),
    requestPermissionsAsync: async () => ({ granted: opts.canAskGrant ?? granted }),
    getDevicePushTokenAsync: async () => opts.token ?? { type: "ios", data: "apns-initial" },
    addPushTokenListener: (cb) => {
      refreshCb = cb;
      return { remove: () => (refreshCb = null) };
    },
    addNotificationResponseReceivedListener: (cb) => {
      openedCb = cb;
      return { remove: () => (openedCb = null) };
    },
    getLastNotificationResponseAsync: async () => opts.lastResponse ?? null,
    emitRefresh: (t) => refreshCb?.(t),
    emitOpened: (r) => openedCb?.(r),
  };
}

function responseWith(data: Record<string, unknown>): ExpoNotificationResponse {
  return { notification: { request: { content: { data } } } };
}

function wrapper(client: NitropingDevice) {
  return ({ children }: { children: ReactNode }) =>
    createElement(NitropingProvider, { client }, children);
}

describe("nitropingIdsFromNotification", () => {
  it("extracts the pair from content data (both spellings)", () => {
    expect(
      nitropingIdsFromNotification(
        responseWith({ notification_id: "n", device_id: "d" }).notification,
      ),
    ).toEqual({
      notificationId: "n",
      deviceId: "d",
    });
    expect(
      nitropingIdsFromNotification(
        responseWith({ nitroping_notification_id: "n2", nitroping_device_id: "d2" }).notification,
      ),
    ).toEqual({ notificationId: "n2", deviceId: "d2" });
  });

  it("returns null when ids are missing", () => {
    expect(nitropingIdsFromNotification(responseWith({}).notification)).toBeNull();
    expect(
      nitropingIdsFromNotification(responseWith({ notification_id: "n" }).notification),
    ).toBeNull();
  });
});

describe("useExpoRegistration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("registers the native token and infers platform + iOS sandbox env from __DEV__", async () => {
    const prevDev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    try {
      const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
      const client = new NitropingDevice({ publicKey: "pk_x" });
      const n = fakeNotifications({ token: { type: "ios", data: "apns-1" } });

      const { result } = renderHook(() => useExpoRegistration({ notifications: n }), {
        wrapper: wrapper(client),
      });

      await waitFor(() => expect(result.current.status).toBe("registered"));
      const regCall = spy.mock.calls.find(
        ([url]) => String(url) === "https://nitroping.dev/api/v1/public/devices",
      )!;
      const body = JSON.parse(regCall[1]!.body as string);
      expect(body.token).toBe("apns-1");
      expect(body.platform).toBe("ios");
      expect(body.environment).toBe("sandbox");
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = prevDev;
    }
  });

  it("does not send environment for an android token", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const n = fakeNotifications({ token: { type: "android", data: "fcm-1" } });

    const { result } = renderHook(() => useExpoRegistration({ notifications: n }), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.status).toBe("registered"));
    const regCall = spy.mock.calls.find(
      ([url]) => String(url) === "https://nitroping.dev/api/v1/public/devices",
    )!;
    const body = JSON.parse(regCall[1]!.body as string);
    expect(body.platform).toBe("android");
    expect("environment" in body).toBe(false);
  });

  it("requests permission and stays idle when denied", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const n = fakeNotifications({ granted: false, canAskGrant: false });

    const { result } = renderHook(() => useExpoRegistration({ notifications: n }), {
      wrapper: wrapper(client),
    });

    // No token → no register call; hook stays idle.
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(spy.mock.calls.some(([url]) => String(url).endsWith("/api/v1/public/devices"))).toBe(
      false,
    );
  });

  it("re-registers on token refresh", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: false }, 200));
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const n = fakeNotifications({ token: { type: "ios", data: "apns-1" } });

    const { result } = renderHook(() => useExpoRegistration({ notifications: n }), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe("registered"));

    n.emitRefresh({ type: "ios", data: "apns-2" });
    await waitFor(() => {
      const last = spy.mock.calls.at(-1)!;
      expect(JSON.parse(last[1]!.body as string).token).toBe("apns-2");
    });
  });

  it("reports an open from a cold-start notification response", async () => {
    const spy = mockFetch(({ url }) =>
      url.endsWith("/api/v1/events")
        ? json({ accepted: true }, 202)
        : json({ id: "dev-1", created: true }, 201),
    );
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const n = fakeNotifications({
      token: { type: "ios", data: "apns-1" },
      lastResponse: responseWith({ notification_id: "n-9", device_id: "d-9" }),
    });

    renderHook(() => useExpoRegistration({ notifications: n }), { wrapper: wrapper(client) });

    await waitFor(() => {
      const eventCall = spy.mock.calls.find(([url]) => String(url).endsWith("/api/v1/events"));
      expect(eventCall).toBeTruthy();
      expect(JSON.parse(eventCall![1]!.body as string)).toMatchObject({
        notification_id: "n-9",
        device_id: "d-9",
        type: "opened",
      });
    });
  });
});
