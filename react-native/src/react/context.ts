import { type Context, createContext } from "react";
import type { NitropingDevice } from "../client";

/**
 * React context carrying the configured {@link NitropingDevice}. `null`
 * until a {@link NitropingProvider} mounts above the consumer.
 */
export const NitropingContext: Context<NitropingDevice | null> =
  createContext<NitropingDevice | null>(null);
