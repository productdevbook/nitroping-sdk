import { describe, expect, it } from "vitest"
import { InvalidSignatureError, NitropingError, TimestampOutOfRangeError } from "../src/index"
import { signWebhook, verifyWebhook } from "../src/webhooks"

const SECRET = "whsec_test_0123456789abcdef"

async function fixture(body: string, timestampSeconds: number) {
  const header = await signWebhook(SECRET, body, timestampSeconds)
  return { body, header }
}

describe("verifyWebhook", () => {
  it("accepts a valid signature and returns the parsed event", async () => {
    const event = {
      id: "evt_abc",
      type: "notification.delivered",
      created_at: "2026-05-22T10:00:00Z",
      data: { notification_id: "n1" },
    }
    const t = 1_700_000_000
    const { body, header } = await fixture(JSON.stringify(event), t)

    const result = await verifyWebhook({
      body,
      signature: header,
      secret: SECRET,
      now: t,
    })

    expect(result).toEqual(event)
  })

  it("matches the t=<unix>, v1=<hex> format from the server", async () => {
    const header = await signWebhook(SECRET, "{}", 1_700_000_000)
    expect(header).toMatch(/^t=\d+, v1=[0-9a-f]+$/)
    expect(header.startsWith("t=1700000000, v1=")).toBe(true)
  })

  it("throws InvalidSignatureError when the body has been tampered", async () => {
    const t = 1_700_000_000
    const { header } = await fixture(JSON.stringify({ ok: true }), t)

    const promise = verifyWebhook({
      body: JSON.stringify({ ok: false }), // tampered
      signature: header,
      secret: SECRET,
      now: t,
    })

    await expect(promise).rejects.toBeInstanceOf(InvalidSignatureError)
  })

  it("throws InvalidSignatureError when the secret is wrong", async () => {
    const t = 1_700_000_000
    const { body, header } = await fixture(JSON.stringify({ ok: true }), t)

    const promise = verifyWebhook({
      body,
      signature: header,
      secret: "whsec_wrong",
      now: t,
    })

    await expect(promise).rejects.toBeInstanceOf(InvalidSignatureError)
  })

  it("throws TimestampOutOfRangeError when timestamp is older than tolerance", async () => {
    const signedAt = 1_700_000_000
    const { body, header } = await fixture(JSON.stringify({ ok: true }), signedAt)

    const promise = verifyWebhook({
      body,
      signature: header,
      secret: SECRET,
      now: signedAt + 1000, // 1000s drift, default tolerance is 300
    })

    await expect(promise).rejects.toBeInstanceOf(TimestampOutOfRangeError)
  })

  it("accepts a wider tolerance to bypass timestamp check", async () => {
    const signedAt = 1_700_000_000
    const { body, header } = await fixture(JSON.stringify({ x: 1 }), signedAt)

    const result = await verifyWebhook({
      body,
      signature: header,
      secret: SECRET,
      now: signedAt + 86_400,
      tolerance: 90_000,
    })

    expect(result).toEqual({ x: 1 })
  })

  it("throws InvalidSignatureError on a missing header", async () => {
    const promise = verifyWebhook({
      body: "{}",
      signature: undefined,
      secret: SECRET,
    })
    await expect(promise).rejects.toBeInstanceOf(InvalidSignatureError)
  })

  it("throws InvalidSignatureError on a malformed header", async () => {
    const promise = verifyWebhook({
      body: "{}",
      signature: "not-a-real-header",
      secret: SECRET,
    })
    await expect(promise).rejects.toBeInstanceOf(InvalidSignatureError)
  })

  it("throws NitropingError invalid_body when payload is not JSON", async () => {
    const t = 1_700_000_000
    const { header } = await fixture("not-json", t)

    try {
      await verifyWebhook({ body: "not-json", signature: header, secret: SECRET, now: t })
      expect.fail("expected error")
    } catch (err) {
      const e = err as NitropingError
      expect(e).toBeInstanceOf(NitropingError)
      expect(e.code).toBe("invalid_body")
    }
  })

  it("matches the Elixir server's reference HMAC exactly", async () => {
    // Locked-in vector: secret="0123456789abcdef", t=1700000000, body='{"hello":"world"}'.
    // Computed via `iex> :crypto.mac(:hmac, :sha256, "0123456789abcdef", "1700000000.{\"hello\":\"world\"}") |> Base.encode16(case: :lower)`.
    const secret = "0123456789abcdef"
    const body = '{"hello":"world"}'
    const t = 1_700_000_000

    const header = await signWebhook(secret, body, t)

    // The HMAC is locked — if this breaks, the JS impl has drifted
    // from the Elixir server. Recompute via the IEx command above.
    expect(header).toBe(
      "t=1700000000, v1=66997eb7c1d13335f141deda66669e544a2c7f62745300308aec8f7042fb18be",
    )

    // And verifyWebhook accepts it.
    const result = await verifyWebhook({
      body,
      signature: header,
      secret,
      now: t,
    })
    expect(result).toEqual({ hello: "world" })
  })
})
