import { useEffect, useRef, useState } from "react";
import type { RegisterDeviceResponse } from "nitroping";
import type { DevicePlatform } from "../client";
import { useNitroping } from "./useNitroping";

/** Arguments for {@link useRegisterDevice}. */
export interface UseRegisterDeviceArgs {
  /**
   * The push token from your platform layer (Firebase / Expo / bare).
   * Pass `null` until you've acquired it — the hook stays idle until then.
   * When the value changes (token refresh), the device is re-registered.
   */
  token: string | null;
  /** Device platform. */
  platform: DevicePlatform;
  /** Opaque tenant-side user id, if signed in. */
  userId?: string;
  /** Tags for tag-based targeting. */
  tags?: string[];
  /** Arbitrary metadata stored with the device. */
  metadata?: Record<string, unknown>;
  /**
   * APNs environment for iOS: `"sandbox"` or `"production"`. Omit to let
   * the SDK infer it from the React Native `__DEV__` global. Ignored for
   * Android.
   */
  environment?: "sandbox" | "production";
  /**
   * IANA timezone for quiet-hours delivery. Omit to auto-detect via `Intl`;
   * pass `null` to not report one.
   */
  timezone?: string | null;
}

/** State returned by {@link useRegisterDevice}. */
export interface UseRegisterDeviceState {
  device: RegisterDeviceResponse | null;
  status: "idle" | "registering" | "registered" | "error";
  error: Error | null;
}

/**
 * Register the device on mount and re-register whenever `token` changes.
 * Safe across token refreshes (server registration is idempotent).
 *
 * ```tsx
 * const { device, status } = useRegisterDevice({ token, platform: "ios" })
 * ```
 */
export function useRegisterDevice(args: UseRegisterDeviceArgs): UseRegisterDeviceState {
  const client = useNitroping();
  const [state, setState] = useState<UseRegisterDeviceState>({
    device: null,
    status: "idle",
    error: null,
  });

  const { token, platform, userId, tags, metadata, environment, timezone } = args;
  // Serialize the non-token inputs so the effect re-runs when they change
  // without depending on unstable object identities.
  const extraKey = JSON.stringify({ platform, userId, tags, metadata, environment, timezone });

  // Track the latest request so a stale refresh can't overwrite a newer one.
  const reqId = useRef(0);

  useEffect(() => {
    if (!token) {
      setState({ device: null, status: "idle", error: null });
      return;
    }

    const id = ++reqId.current;
    setState((s) => ({ ...s, status: "registering", error: null }));

    client
      .registerDevice({ token, platform, userId, tags, metadata, environment, timezone })
      .then((device) => {
        if (id === reqId.current) {
          setState({ device, status: "registered", error: null });
        }
      })
      .catch((error: unknown) => {
        if (id === reqId.current) {
          setState({
            device: null,
            status: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, token, extraKey]);

  return state;
}
