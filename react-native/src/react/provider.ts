import { createElement, type ReactElement, type ReactNode, useMemo } from "react";
import { NitropingDevice, type NitropingDeviceOptions } from "../client";
import { NitropingContext } from "./context";

/** Props for {@link NitropingProvider}. */
export type NitropingProviderProps = {
  children?: ReactNode;
} & (
  | {
      /** A pre-built client. */
      client: NitropingDevice;
    }
  | NitropingDeviceOptions
);

/**
 * Provides a {@link NitropingDevice} to the component tree. Pass either a
 * ready `client` or the same options you'd give the constructor
 * (`publicKey`, `baseUrl`, ...). The client is memoized so it isn't
 * rebuilt on every render.
 *
 * ```tsx
 * <NitropingProvider publicKey="pk_live_...">
 *   <App />
 * </NitropingProvider>
 * ```
 */
export function NitropingProvider(props: NitropingProviderProps): ReactElement {
  const { children } = props;

  const client = useMemo(() => {
    if ("client" in props) return props.client;
    return new NitropingDevice({
      publicKey: props.publicKey,
      baseUrl: props.baseUrl,
      timeoutMs: props.timeoutMs,
      fetch: props.fetch,
      debug: props.debug,
    });
    // Rebuild only when the connection-defining options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    "client" in props ? props.client : undefined,
    "publicKey" in props ? props.publicKey : undefined,
    "baseUrl" in props ? props.baseUrl : undefined,
    "debug" in props ? props.debug : undefined,
  ]);

  return createElement(NitropingContext.Provider, { value: client }, children);
}
