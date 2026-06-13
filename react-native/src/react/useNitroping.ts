import { useContext } from "react";
import type { NitropingDevice } from "../client";
import { NitropingContext } from "./context";

/**
 * Access the {@link NitropingDevice} provided by {@link NitropingProvider}.
 * Throws a clear error if used outside a provider.
 */
export function useNitroping(): NitropingDevice {
  const client = useContext(NitropingContext);
  if (!client) {
    throw new Error("useNitroping must be used within a <NitropingProvider>.");
  }
  return client;
}
