package nitroping

import "encoding/json"

// Platform identifies a device's push platform. Mirrors the JS SDK's
// "ios" | "android" | "web" union.
type Platform string

const (
	PlatformIOS     Platform = "ios"
	PlatformAndroid Platform = "android"
	PlatformWeb     Platform = "web"
)

// Action is a button rendered on the notification (where the platform
// supports it). Serialized to JSON as the wire format expected by
// POST /api/v1/notifications.
type Action struct {
	// ID is the stable identifier reported back in
	// `notification.clicked` webhook events.
	ID string `json:"id"`
	// Title is the button label shown to the user.
	Title string `json:"title"`
	// Icon is an optional icon URL.
	Icon string `json:"icon,omitempty"`
}

// Target is the notification audience selector. Construct one with
// AllDevices, DeviceIDs, or UserIDs — exactly one must be set per send.
//
// Target implements json.Marshaler so the SDK can emit the exact
// snake_case wire shape the Phoenix controller expects:
// {"all":true} | {"device_ids":[...]} | {"user_ids":[...]}.
type Target struct {
	all       bool
	deviceIDs []string
	userIDs   []string
}

// AllDevices targets every active device in the app. Equivalent to the
// JS `{ all: true }` discriminant.
func AllDevices() Target {
	return Target{all: true}
}

// DeviceIDs targets a specific set of device rows by id.
func DeviceIDs(ids []string) Target {
	return Target{deviceIDs: ids}
}

// UserIDs targets every device row owned by the given user ids (fanout
// happens server-side).
func UserIDs(ids []string) Target {
	return Target{userIDs: ids}
}

// MarshalJSON renders the Target as the wire shape:
// {"all":true} | {"device_ids":[...]} | {"user_ids":[...]}.
func (t Target) MarshalJSON() ([]byte, error) {
	switch {
	case t.all:
		return json.Marshal(struct {
			All bool `json:"all"`
		}{All: true})
	case t.deviceIDs != nil:
		return json.Marshal(struct {
			DeviceIDs []string `json:"device_ids"`
		}{DeviceIDs: t.deviceIDs})
	case t.userIDs != nil:
		return json.Marshal(struct {
			UserIDs []string `json:"user_ids"`
		}{UserIDs: t.userIDs})
	default:
		// Empty target — caller forgot to set one. Surface as an empty
		// object so the server returns a clean validation error instead
		// of a confusing 500.
		return []byte(`{}`), nil
	}
}

// SendRequest is the input to Client.Notifications.Send. Either Title +
// Body (raw payload) or Template + Vars (Pro tier) — mixing the two
// returns a 422 from the server.
//
// Optional pointer fields (DeepLink, ClickAction, etc.) use *string so
// the empty string can be distinguished from "unset". Use the helpers
// String, Int from this package to construct them inline.
type SendRequest struct {
	// Title is the push notification title.
	Title string `json:"title,omitempty"`
	// Body is the push notification body / message.
	Body string `json:"body,omitempty"`
	// Template is a template slug — alternative to Title + Body.
	// Requires Pro tier.
	Template *string `json:"template,omitempty"`
	// Vars are variables interpolated into Template.
	Vars map[string]any `json:"vars,omitempty"`
	// Data is a custom payload delivered alongside the visible push.
	Data map[string]any `json:"data,omitempty"`
	// Icon is the notification icon URL.
	Icon *string `json:"icon,omitempty"`
	// Image is the notification image URL.
	Image *string `json:"image,omitempty"`
	// ClickAction is the legacy fallback URL opened on tap. Prefer
	// DeepLink for new code.
	ClickAction *string `json:"click_action,omitempty"`
	// DeepLink is the URL or app deep link opened when the user taps
	// the notification.
	DeepLink *string `json:"deep_link,omitempty"`
	// Actions are the action buttons (where supported).
	Actions []Action `json:"actions,omitempty"`
	// ScheduledAt is an ISO-8601 timestamp; the row is held until then
	// by the cron worker.
	ScheduledAt *string `json:"scheduled_at,omitempty"`
	// ExpiresAt is an ISO-8601 timestamp; after this the notification
	// is dropped.
	ExpiresAt *string `json:"expires_at,omitempty"`
	// Target is the notification audience selector. Required.
	Target Target `json:"target"`
}

// NotificationResult is the response from POST /api/v1/notifications.
type NotificationResult struct {
	// ID is the UUID of the queued notification row.
	ID string `json:"id"`
	// Status is the initial server-side status, usually "queued".
	Status string `json:"status"`
}

// DeviceRequest is the input to Client.Devices.Register. Idempotent on
// (app_id, token, user_id); existing rows are returned unchanged with
// Created=false.
type DeviceRequest struct {
	// Platform is the device's push platform.
	Platform Platform `json:"platform"`
	// Token is the APNs token, FCM token, or Web Push endpoint URL.
	Token string `json:"token"`
	// UserID is an opaque tenant-side user id.
	UserID *string `json:"user_id,omitempty"`
	// WebPushP256dh is required when Platform == PlatformWeb.
	WebPushP256dh *string `json:"web_push_p256dh,omitempty"`
	// WebPushAuth is required when Platform == PlatformWeb.
	WebPushAuth *string `json:"web_push_auth,omitempty"`
	// Metadata is an arbitrary key-value map stored alongside the
	// device row.
	Metadata map[string]any `json:"metadata,omitempty"`
}

// DeviceResult is the response from POST /api/v1/devices.
type DeviceResult struct {
	// ID is the UUID of the device row.
	ID string `json:"id"`
	// Created is true if the device was inserted by this request; false
	// when an existing row matched.
	Created bool `json:"created"`
}

// DeactivateResult is the response from DELETE /api/v1/devices/:id.
type DeactivateResult struct {
	// ID is the device id that was deactivated.
	ID string `json:"id"`
	// Status is always "inactive" on success.
	Status string `json:"status"`
}
