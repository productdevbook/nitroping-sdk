import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NitropingDevice, NitropingProvider } from "../src/index";
import {
  createFirebaseTokenSource,
  nitropingIdsFromMessage,
  useFirebaseRegistration,
  type FirebaseMessaging,
  type FirebaseRemoteMessage,
} from "../src/firebase";

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

// A controllable fake of the Firebase messaging instance.
function fakeMessaging(
  opts: {
    token?: string;
    initial?: FirebaseRemoteMessage | null;
  } = {},
): FirebaseMessaging & {
  emitRefresh(token: string): void;
  emitOpened(msg: FirebaseRemoteMessage): void;
} {
  let refreshCb: ((t: string) => void) | null = null;
  let openedCb: ((m: FirebaseRemoteMessage) => void) | null = null;
  return {
    getToken: async () => opts.token ?? "fcm-initial",
    onTokenRefresh: (cb) => {
      refreshCb = cb;
      return () => {
        refreshCb = null;
      };
    },
    onMessage: () => () => {},
    onNotificationOpenedApp: (cb) => {
      openedCb = cb;
      return () => {
        openedCb = null;
      };
    },
    getInitialNotification: async () => opts.initial ?? null,
    emitRefresh: (t) => refreshCb?.(t),
    emitOpened: (m) => openedCb?.(m),
  };
}

function wrapper(client: NitropingDevice) {
  return ({ children }: { children: ReactNode }) =>
    createElement(NitropingProvider, { client }, children);
}

describe("nitropingIdsFromMessage", () => {
  it("extracts the pair from the nitroping_ namespace", () => {
    expect(
      nitropingIdsFromMessage({
        data: { nitroping_notification_id: "n", nitroping_device_id: "d" },
      }),
    ).toEqual({ notificationId: "n", deviceId: "d" });
  });

  it("accepts the bare keys for backward compatibility", () => {
    expect(nitropingIdsFromMessage({ data: { notification_id: "n", device_id: "d" } })).toEqual({
      notificationId: "n",
      deviceId: "d",
    });
  });

  it("prefers the namespaced key over a customer's bare notification_id", () => {
    expect(
      nitropingIdsFromMessage({
        data: {
          nitroping_notification_id: "nitro",
          notification_id: "customer",
          nitroping_device_id: "d",
        },
      }),
    ).toEqual({ notificationId: "nitro", deviceId: "d" });
  });

  it("returns null when ids are missing", () => {
    expect(nitropingIdsFromMessage({})).toBeNull();
    expect(nitropingIdsFromMessage({ data: { notification_id: "n" } })).toBeNull();
  });
});

describe("createFirebaseTokenSource", () => {
  it("delegates getToken/onRefresh to messaging", async () => {
    const m = fakeMessaging({ token: "tok-A" });
    const source = createFirebaseTokenSource(m);
    expect(await source.getToken()).toBe("tok-A");

    let seen: string | null = null;
    source.onRefresh((t) => (seen = t));
    m.emitRefresh("tok-B");
    expect(seen).toBe("tok-B");
  });
});

describe("useFirebaseRegistration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("registers the fetched token", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const m = fakeMessaging({ token: "fcm-1" });

    const { result } = renderHook(
      () => useFirebaseRegistration({ messaging: m, platform: "android" }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.status).toBe("registered"));
    const regCall = spy.mock.calls.find(
      ([url]) => String(url) === "https://nitroping.dev/api/v1/public/devices",
    )!;
    expect(JSON.parse(regCall[1]!.body as string).token).toBe("fcm-1");
  });

  it("re-registers on token refresh", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: false }, 200));
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const m = fakeMessaging({ token: "fcm-1" });

    const { result } = renderHook(
      () => useFirebaseRegistration({ messaging: m, platform: "android" }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.status).toBe("registered"));

    m.emitRefresh("fcm-2");
    await waitFor(() => {
      const last = spy.mock.calls.at(-1)!;
      expect(JSON.parse(last[1]!.body as string).token).toBe("fcm-2");
    });
  });

  it("reports an open from a cold-start notification", async () => {
    const spy = mockFetch(({ url }) =>
      url.endsWith("/api/v1/events")
        ? json({ accepted: true }, 202)
        : json({ id: "dev-1", created: true }, 201),
    );
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const m = fakeMessaging({
      token: "fcm-1",
      initial: { data: { notification_id: "n-9", device_id: "d-9" } },
    });

    renderHook(() => useFirebaseRegistration({ messaging: m, platform: "android" }), {
      wrapper: wrapper(client),
    });

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
