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
});
