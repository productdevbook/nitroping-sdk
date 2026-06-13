/**
 * Device-side client for React Native.
 *
 * Thin wrapper over the core `nitroping` SDK that exposes only the calls a
 * mobile app makes: register/refresh the push token, deactivate it, and
 * report engagement (opened/clicked). It deliberately does NOT expose
 * `notifications.send` — pushes are sent from your server with a secret
 * `np_` key, never from a device.
 *
 * Use a **public** `pk_` key here. With a `pk_` key the core SDK routes
 * device registration to the public endpoint (`POST /api/v1/public/devices`)
 * and you avoid shipping a secret in your app bundle.
 */

import { DevicesClient, EventsClient, HttpClient } from "nitroping";
import type { RegisterDeviceResponse } from "nitroping";

/** Platforms a React Native app registers (no `web`). */
export type DevicePlatform = "ios" | "android";

/** Options for {@link NitropingDevice}. */
export interface NitropingDeviceOptions {
  /**
   * Public key (`pk_...`). Safe to ship in an app bundle. A secret `np_`
   * key also works but should never be embedded in a client.
   */
  publicKey: string;
  /** Base URL. Defaults to `https://nitroping.dev`. */
  baseUrl?: string;
  /** Per-request timeout in ms (default 30_000). */
  timeoutMs?: number;
  /** Custom `fetch` (mainly for tests). */
  fetch?: typeof fetch;
}

/** Input for {@link NitropingDevice.registerDevice}. */
export interface RegisterInput {
  /** The APNs/FCM token obtained from the platform. */
  token: string;
  /** Device platform. */
  platform: DevicePlatform;
  /** Opaque tenant-side user id, if the user is signed in. */
  userId?: string;
  /** Tags for tag-based targeting. */
  tags?: string[];
  /** Arbitrary metadata stored with the device. */
  metadata?: Record<string, unknown>;
  /**
   * APNs environment for an iOS token: `"sandbox"` (debug / dev build,
   * `react-native run-ios`) or `"production"` (App Store / TestFlight).
   * The push host is environment-specific and a token can't reveal which,
   * so this must be reported. If omitted on iOS we default it from the
   * React Native `__DEV__` global (`true` → sandbox, else production).
   * Ignored for Android.
   */
  environment?: "sandbox" | "production";
  /**
   * IANA timezone for quiet-hours delivery (e.g. `"Europe/Istanbul"`). Omit
   * to let the SDK infer it from the device via `Intl`. Pass `null` to opt
   * out of reporting a timezone entirely.
   */
  timezone?: string | null;
}

/** Input for {@link NitropingDevice.reportEvent}. */
export interface ReportEventInput {
  /** UUID of the notification (from the push payload). */
  notificationId: string;
  /** UUID of the device (returned by `registerDevice`). */
  deviceId: string;
  /** Engagement type. */
  type: "opened" | "clicked";
  /** Action button id, for a clicked action. */
  actionId?: string;
  /** When it happened. Defaults to now (server-side). */
  happenedAt?: Date;
}

export class NitropingDevice {
  private readonly devices: DevicesClient;
  private readonly events: EventsClient;

  constructor(options: NitropingDeviceOptions) {
    if (!options.publicKey) {
      throw new Error("NitropingDevice: `publicKey` is required (use a pk_ key).");
    }
    // Use the `Public` auth scheme so device registration routes to the
    // public endpoint (`/api/v1/public/devices`). Building the HttpClient
    // directly (rather than the server `Nitroping` class, which forces
    // `ApiKey`) is what enables the public-key flow.
    const http = new HttpClient({
      apiKey: options.publicKey,
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
      fetch: options.fetch,
      authScheme: options.publicKey.startsWith("pk_") ? "Public" : "ApiKey",
    });
    this.devices = new DevicesClient(http);
    this.events = new EventsClient(http);
  }

  /**
   * Register (or refresh) this device's push token. Idempotent on
   * `(app, token, user)`, so calling it again on token refresh is safe.
   */
  async registerDevice(input: RegisterInput): Promise<RegisterDeviceResponse> {
    // timezone: explicit value wins; `null` opts out; omitted → infer via Intl.
    const timezone =
      input.timezone === undefined ? defaultTimezone() : (input.timezone ?? undefined);

    return await this.devices.register({
      token: input.token,
      platform: input.platform,
      userId: input.userId,
      tags: input.tags,
      metadata: input.metadata,
      environment:
        input.platform === "ios" ? (input.environment ?? defaultIosEnvironment()) : undefined,
      timezone,
    });
  }

  /** Deactivate a device (e.g. on logout). */
  async deactivateDevice(id: string): Promise<{ id: string; status: string }> {
    return await this.devices.deactivate(id);
  }

  /**
   * Report an engagement event when a notification is opened or an action
   * is clicked. Backed by the public `POST /api/v1/events` endpoint.
   */
  async reportEvent(input: ReportEventInput): Promise<void> {
    await this.events.report({
      notificationId: input.notificationId,
      deviceId: input.deviceId,
      type: input.type,
      actionId: input.actionId,
      happenedAt: input.happenedAt?.toISOString(),
    });
  }
}

/**
 * Infer the iOS APNs environment from the React Native `__DEV__` global:
 * `true` in a development/debug build (Metro / `run-ios`) → sandbox, and
 * anything else (release build, or `__DEV__` undefined) → production.
 * Callers can always override by passing `environment` explicitly.
 */
function defaultIosEnvironment(): "sandbox" | "production" {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  return dev === true ? "sandbox" : "production";
}

/**
 * Best-effort device timezone via the standard `Intl` API (available in
 * Hermes / modern RN). Returns `undefined` if it can't be resolved, so a
 * missing `Intl` never blocks registration.
 */
function defaultTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
