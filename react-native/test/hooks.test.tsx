import { createElement, type ReactNode } from "react";
import { render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NitropingDevice, NitropingProvider, useNitroping, useRegisterDevice } from "../src/index";

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

function wrapper(client: NitropingDevice) {
  return ({ children }: { children: ReactNode }) =>
    createElement(NitropingProvider, { client }, children);
}

describe("useNitroping", () => {
  it("throws outside a provider", () => {
    expect(() => renderHook(() => useNitroping())).toThrow(/within a <NitropingProvider>/);
  });

  it("returns the client inside a provider", () => {
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const { result } = renderHook(() => useNitroping(), { wrapper: wrapper(client) });
    expect(result.current).toBe(client);
  });
});

describe("useRegisterDevice", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stays idle while token is null", () => {
    const client = new NitropingDevice({ publicKey: "pk_x" });
    const { result } = renderHook(() => useRegisterDevice({ token: null, platform: "ios" }), {
      wrapper: wrapper(client),
    });
    expect(result.current.status).toBe("idle");
  });

  it("registers once when a token arrives", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: true }, 201));
    const client = new NitropingDevice({ publicKey: "pk_x" });

    const { result } = renderHook(() => useRegisterDevice({ token: "tok-1", platform: "ios" }), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.status).toBe("registered"));
    expect(result.current.device).toEqual({ id: "dev-1", created: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("re-registers when the token changes (refresh)", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", created: false }, 200));
    const client = new NitropingDevice({ publicKey: "pk_x" });

    const { result, rerender } = renderHook(
      ({ token }: { token: string }) => useRegisterDevice({ token, platform: "ios" }),
      { wrapper: wrapper(client), initialProps: { token: "tok-1" } },
    );
    await waitFor(() => expect(result.current.status).toBe("registered"));

    rerender({ token: "tok-2" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    const secondBody = JSON.parse(spy.mock.calls[1]![1]!.body as string);
    expect(secondBody.token).toBe("tok-2");
  });

  it("surfaces an error status on failure", async () => {
    mockFetch(() => json({ error: { code: "invalid_provider_token", message: "bad" } }, 422));
    const client = new NitropingDevice({ publicKey: "pk_x" });

    const { result } = renderHook(() => useRegisterDevice({ token: "tok-bad", platform: "ios" }), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeTruthy();
  });
});

describe("NitropingProvider with options", () => {
  it("builds a client from inline options", () => {
    const { result } = renderHook(() => useNitroping(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(NitropingProvider, { publicKey: "pk_x" }, children),
    });
    expect(result.current).toBeInstanceOf(NitropingDevice);
  });

  it("renders children", () => {
    const { container } = render(
      createElement(NitropingProvider, { publicKey: "pk_x" }, createElement("span", null, "hi")),
    );
    expect(container.textContent).toBe("hi");
  });
});
