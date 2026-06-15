import { afterEach, describe, expect, it, vi } from "vitest";
import { NitropingDevice } from "../src/index";

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
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("NitropingDevice", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requires a public key", () => {
    expect(() => new NitropingDevice({ publicKey: "" })).toThrow(/publicKey/);
  });

  it("registers via the public endpoint with a pk_ key", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
    const device = new NitropingDevice({ publicKey: "pk_test" });

    const res = await device.registerDevice({
      token: "fcm-token",
      platform: "android",
      userId: "u-1",
      tags: ["beta"],
      // Opt out of auto-timezone so this asserts the base wire shape.
      timezone: null,
    });
    expect(res).toEqual({ id: "dev-1", created: true });

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://nitroping.dev/api/v1/public/devices");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Public pk_test");
    expect(JSON.parse(init.body as string)).toEqual({
      token: "fcm-token",
      platform: "android",
      user_id: "u-1",
      tags: ["beta"],
    });
  });

  it("auto-reports the device timezone via Intl when not provided", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
    const device = new NitropingDevice({ publicKey: "pk_test" });

    await device.registerDevice({ token: "t", platform: "android" });

    const [, init] = spy.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    // Whatever the test runtime's zone is, it should be a non-empty IANA-ish string.
    expect(typeof body.timezone).toBe("string");
    expect(body.timezone.length).toBeGreaterThan(0);
  });

  it("omits timezone when explicitly set to null", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
    const device = new NitropingDevice({ publicKey: "pk_test" });

    await device.registerDevice({ token: "t", platform: "android", timezone: null });

    const [, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect("timezone" in JSON.parse(init.body as string)).toBe(false);
  });

  it("defaults the iOS environment from __DEV__ (sandbox when true)", async () => {
    const prev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    try {
      const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
      const device = new NitropingDevice({ publicKey: "pk_test" });

      await device.registerDevice({ token: "apns-token", platform: "ios" });

      const [, init] = spy.mock.calls[0]! as [string, RequestInit];
      expect(JSON.parse(init.body as string).environment).toBe("sandbox");
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = prev;
    }
  });

  it("defaults the iOS environment to production when __DEV__ is false", async () => {
    const prev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
      const device = new NitropingDevice({ publicKey: "pk_test" });

      await device.registerDevice({ token: "apns-token", platform: "ios" });

      const [, init] = spy.mock.calls[0]! as [string, RequestInit];
      expect(JSON.parse(init.body as string).environment).toBe("production");
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = prev;
    }
  });

  it("honours an explicit iOS environment over the __DEV__ default", async () => {
    const prev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    try {
      const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
      const device = new NitropingDevice({ publicKey: "pk_test" });

      await device.registerDevice({
        token: "apns-token",
        platform: "ios",
        environment: "production",
      });

      const [, init] = spy.mock.calls[0]! as [string, RequestInit];
      expect(JSON.parse(init.body as string).environment).toBe("production");
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = prev;
    }
  });

  it("does not send environment for android", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
    const device = new NitropingDevice({ publicKey: "pk_test" });

    await device.registerDevice({ token: "fcm-token", platform: "android" });

    const [, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect("environment" in JSON.parse(init.body as string)).toBe(false);
  });

  it("reports an engagement event to /api/v1/events", async () => {
    const spy = mockFetch(() => json({ accepted: true }, 202));
    const device = new NitropingDevice({ publicKey: "pk_test" });

    await device.reportEvent({
      notificationId: "n-1",
      deviceId: "d-1",
      type: "clicked",
      actionId: "reply",
      happenedAt: new Date("2026-06-13T00:00:00.000Z"),
    });

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://nitroping.dev/api/v1/events");
    expect(JSON.parse(init.body as string)).toEqual({
      notification_id: "n-1",
      device_id: "d-1",
      type: "clicked",
      action_id: "reply",
      happened_at: "2026-06-13T00:00:00.000Z",
    });
  });

  it("deactivates a device", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", status: "inactive" }));
    const device = new NitropingDevice({ publicKey: "pk_test" });

    const res = await device.deactivateDevice("dev-1");
    expect(res).toEqual({ id: "dev-1", status: "inactive" });
    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(url).toBe("https://nitroping.dev/api/v1/devices/dev-1");
  });

  it("deactivates a device by token via a { token } body", async () => {
    const spy = mockFetch(() => json({ id: "dev-9", status: "inactive" }));
    const device = new NitropingDevice({ publicKey: "pk_test" });

    const res = await device.deactivateDeviceByToken("apns-token-xyz");
    expect(res).toEqual({ id: "dev-9", status: "inactive" });
    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://nitroping.dev/api/v1/devices");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ token: "apns-token-xyz" });
  });

  it("throws not_found when deactivating by an unknown token", async () => {
    mockFetch(() => json({ error: { code: "not_found", message: "Device not found" } }, 404));
    const device = new NitropingDevice({ publicKey: "pk_test" });

    await expect(device.deactivateDeviceByToken("nope")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
