/**
 * Server SDK entry point — `import { Nitroping } from "nitroping"`.
 *
 * Re-exports the main class, both resource clients (so you can type
 * helper functions against them), the error hierarchy, and every
 * public type.
 */

export { DevicesClient } from "./devices"
export {
  InvalidSignatureError,
  NetworkError,
  NitropingError,
  PermissionDeniedError,
  TimestampOutOfRangeError,
  WebPushUnsupportedError,
} from "./errors"
export { EventsClient } from "./events"
export { DEFAULT_BASE_URL, HttpClient, type HttpClientOptions, SDK_VERSION } from "./http"
export { Nitroping, type NitropingOptions } from "./nitroping"
export { NotificationsClient, type SendOptions } from "./notifications"
export { TrackClient } from "./track"
export type {
  EngagementEvent,
  NotificationAction,
  NotificationResponse,
  NotificationTarget,
  Platform,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  ReportEventRequest,
  SendNotificationRequest,
  TrackEvent,
  TrackRequest,
  UpdateDeviceRequest,
  UpdateDeviceResponse,
  WebhookEvent,
} from "./types"
