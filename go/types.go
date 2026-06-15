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

// SegmentCondition is a single audience-segment predicate over device
// fields and metadata. Field is one of "platform", "user_id",
// "timezone", "tag", or "metadata.<key>"; Op is the comparison operator
// ("eq", "neq", "in", "exists", "contains", "gt", "lt"); Value is the
// operand (string, number, or slice depending on Op — omit for "exists").
type SegmentCondition struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value any    `json:"value,omitempty"`
}

// Target is the notification audience selector. Construct one with
// AllDevices, DeviceIDs, UserIDs, Tags, or Segment — exactly one must be
// set per send.
//
// Target implements json.Marshaler so the SDK can emit the exact
// snake_case wire shape the Phoenix controller expects:
// {"all":true} | {"device_ids":[...]} | {"user_ids":[...]} | {"tags":[...]} |
// {"segment":{"match":...,"conditions":[...]}}.
type Target struct {
	all               bool
	deviceIDs         []string
	userIDs           []string
	tags              []string
	segment           bool
	segmentMatch      string
	segmentConditions []SegmentCondition
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

// Tags targets every active device tagged with any of the given tags.
// Set tags on a device at registration time (DeviceRequest.Tags) or via
// DevicesService.Update.
func Tags(tags []string) Target {
	return Target{tags: tags}
}

// Segment targets every active device matching an audience segment — a
// set of conditions over device fields and metadata. match is "all" (AND,
// the default when empty) or "any" (OR) over the conditions.
//
//	nitroping.Segment("any", []nitroping.SegmentCondition{
//	    {Field: "platform", Op: "eq", Value: "ios"},
//	    {Field: "tag", Op: "contains", Value: "vip"},
//	})
func Segment(match string, conditions []SegmentCondition) Target {
	if match == "" {
		match = "all"
	}
	return Target{segment: true, segmentMatch: match, segmentConditions: conditions}
}

// MarshalJSON renders the Target as the wire shape:
// {"all":true} | {"device_ids":[...]} | {"user_ids":[...]} | {"tags":[...]}.
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
	case t.tags != nil:
		return json.Marshal(struct {
			Tags []string `json:"tags"`
		}{Tags: t.tags})
	case t.segment:
		conditions := t.segmentConditions
		if conditions == nil {
			conditions = []SegmentCondition{}
		}
		return json.Marshal(struct {
			Segment struct {
				Match      string             `json:"match"`
				Conditions []SegmentCondition `json:"conditions"`
			} `json:"segment"`
		}{Segment: struct {
			Match      string             `json:"match"`
			Conditions []SegmentCondition `json:"conditions"`
		}{Match: t.segmentMatch, Conditions: conditions}})
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
	// APNsCategory is iOS only. Sets aps.category verbatim so an app that
	// registered a matching UNNotificationCategory renders the action
	// buttons. Overrides the server-minted category for this message.
	// Omitted from the wire body when empty.
	APNsCategory *string `json:"apns_category,omitempty"`
	// ScheduledAt is an ISO-8601 timestamp; the row is held until then
	// by the cron worker.
	ScheduledAt *string `json:"scheduled_at,omitempty"`
	// ExpiresAt is an ISO-8601 timestamp; after this the notification
	// is dropped.
	ExpiresAt *string `json:"expires_at,omitempty"`
	// Recurrence is a 5-field cron expression that turns this into a
	// recurring send. The cron worker re-enqueues on each match.
	Recurrence *string `json:"recurrence,omitempty"`
	// RecurrenceTz is the IANA timezone the Recurrence cron is evaluated
	// in (defaults to Etc/UTC server-side).
	RecurrenceTz *string `json:"recurrence_tz,omitempty"`
	// RecurrenceUntil is an ISO-8601 timestamp after which the recurrence
	// stops firing.
	RecurrenceUntil *string `json:"recurrence_until,omitempty"`
	// EmailTo is an optional list of email recipients delivered alongside
	// (or instead of) the push.
	EmailTo []string `json:"email_to,omitempty"`
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

// CancelResult is the response from DELETE /api/v1/notifications/:id.
type CancelResult struct {
	// ID is the UUID of the cancelled notification row.
	ID string `json:"id"`
	// Status is "canceled" on success.
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
	// Tags are labels used for tag-based targeting (Tags target). Omitted
	// from the wire body when nil.
	Tags []string `json:"tags,omitempty"`
	// Environment is the iOS APNs environment ("sandbox" or "production").
	// The push host is environment-specific and a token can't reveal which,
	// so report it for iOS devices; ignored for other platforms. Omitted
	// from the wire body when nil.
	Environment *string `json:"environment,omitempty"`
	// Timezone is the device's IANA timezone (e.g. "Europe/Istanbul").
	// Used for timezone-aware delivery and segment matching. Omitted from
	// the wire body when nil.
	Timezone *string `json:"timezone,omitempty"`
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

// UpdateDeviceRequest is the input to Client.Devices.Update. Currently
// the only updatable field is the device's tag set.
type UpdateDeviceRequest struct {
	// Tags replaces the device's tags. A nil slice is omitted from the
	// wire body; pass an empty (non-nil) slice to clear all tags.
	Tags []string `json:"tags,omitempty"`
}

// UpdateDeviceResult is the response from PUT /api/v1/devices/:id.
type UpdateDeviceResult struct {
	// ID is the UUID of the device row.
	ID string `json:"id"`
	// Tags are the device's tags after the update.
	Tags []string `json:"tags"`
}

// ListDevicesQuery holds the optional filters for
// Client.Devices.List (GET /api/v1/devices). All fields are optional;
// the zero value lists every device. Pointer fields (Page, PageSize)
// distinguish "unset" from an explicit zero.
type ListDevicesQuery struct {
	// UserID, when non-empty, restricts the listing to one tenant-side
	// user's devices.
	UserID string
	// Platform, when non-empty, filters by push platform (ios|android|web).
	Platform Platform
	// Status, when non-empty, filters by status ("active" or "inactive").
	Status string
	// Page is the 1-based page number. Omitted from the query when nil.
	Page *int
	// PageSize is the number of rows per page (server caps at 100).
	// Omitted from the query when nil.
	PageSize *int
}

// DeviceSummary is one device row in a GET /api/v1/devices listing. The
// push token is never returned by this endpoint, so there is
// deliberately no token field here. Nullable server fields are modelled
// as *string so a JSON null is distinguishable from an empty string.
type DeviceSummary struct {
	// ID is the UUID of the device row.
	ID string `json:"id"`
	// UserID is the opaque tenant-side user id, or nil if unset.
	UserID *string `json:"user_id"`
	// Platform is the device's push platform.
	Platform Platform `json:"platform"`
	// Status is "active" or "inactive".
	Status string `json:"status"`
	// Tags are the device's tags.
	Tags []string `json:"tags"`
	// Timezone is the device's IANA timezone, or nil if unset.
	Timezone *string `json:"timezone"`
	// APNsEnvironment is the iOS APNs environment ("sandbox" or
	// "production"), or nil for non-iOS devices.
	APNsEnvironment *string `json:"apns_environment"`
	// LastSeenAt is the ISO-8601 timestamp the device was last seen, or
	// nil if never.
	LastSeenAt *string `json:"last_seen_at"`
	// InsertedAt is the ISO-8601 timestamp the device row was created.
	InsertedAt string `json:"inserted_at"`
}

// ListDevicesResult is the response from GET /api/v1/devices.
type ListDevicesResult struct {
	// Data is the page of device summaries.
	Data []DeviceSummary `json:"data"`
	// Total is the total number of devices matching the query (across all
	// pages).
	Total int `json:"total"`
}

// TrackEvent is the delivery-tracking event type for POST /api/v1/track.
// One of TrackDelivered, TrackOpened, TrackClicked.
type TrackEvent string

const (
	TrackDelivered TrackEvent = "delivered"
	TrackOpened    TrackEvent = "opened"
	TrackClicked   TrackEvent = "clicked"
)

// TrackRequest is the input to Client.Track.Record. Identify the
// delivery either by DeliveryLogID, or by NotificationID + DeviceToken.
// Construct one with TrackByDeliveryLog or TrackByToken.
//
// TrackRequest implements json.Marshaler so it emits the exact
// snake_case wire shape the Phoenix controller expects:
// {"delivery_log_id":...,"event":...} |
// {"notification_id":...,"device_token":...,"event":...}.
type TrackRequest struct {
	deliveryLogID  string
	notificationID string
	deviceToken    string
	event          TrackEvent
}

// TrackByDeliveryLog builds a TrackRequest keyed by a delivery log id.
func TrackByDeliveryLog(deliveryLogID string, event TrackEvent) TrackRequest {
	return TrackRequest{deliveryLogID: deliveryLogID, event: event}
}

// TrackByToken builds a TrackRequest keyed by a notification id + the
// device's push token.
func TrackByToken(notificationID, deviceToken string, event TrackEvent) TrackRequest {
	return TrackRequest{notificationID: notificationID, deviceToken: deviceToken, event: event}
}

// MarshalJSON renders the TrackRequest as one of the two accepted wire
// shapes. The DeliveryLogID form takes precedence when both are set.
func (r TrackRequest) MarshalJSON() ([]byte, error) {
	if r.deliveryLogID != "" {
		return json.Marshal(struct {
			DeliveryLogID string     `json:"delivery_log_id"`
			Event         TrackEvent `json:"event"`
		}{DeliveryLogID: r.deliveryLogID, Event: r.event})
	}
	return json.Marshal(struct {
		NotificationID string     `json:"notification_id"`
		DeviceToken    string     `json:"device_token"`
		Event          TrackEvent `json:"event"`
	}{NotificationID: r.notificationID, DeviceToken: r.deviceToken, Event: r.event})
}

// TrackResult is the response from POST /api/v1/track.
type TrackResult struct {
	// Accepted is true when the server queued the tracking event (202).
	Accepted bool `json:"accepted"`
}

// EngagementEvent is the engagement event type for POST /api/v1/events.
// One of EventOpened, EventClicked.
type EngagementEvent string

const (
	EventOpened  EngagementEvent = "opened"
	EventClicked EngagementEvent = "clicked"
)

// ReportEventRequest is the input to Client.Events.Report — the public,
// unauthenticated engagement endpoint. NotificationID and DeviceID are
// required; ActionID and HappenedAt are optional.
type ReportEventRequest struct {
	// NotificationID is the UUID of the notification. Required.
	NotificationID string `json:"notification_id"`
	// DeviceID is the UUID of the device. Required.
	DeviceID string `json:"device_id"`
	// Type is the engagement event type (opened or clicked). Required.
	Type EngagementEvent `json:"type"`
	// ActionID is the action button id, for a clicked event on an action.
	ActionID *string `json:"action_id,omitempty"`
	// HappenedAt is an optional ISO-8601 timestamp of when the event
	// occurred.
	HappenedAt *string `json:"happened_at,omitempty"`
}

// EventResult is the response from POST /api/v1/events.
type EventResult struct {
	// Accepted is true when the server queued the engagement event (202).
	Accepted bool `json:"accepted"`
}

// InboxItem is a single in-app notification-center entry returned by the
// /api/v1/public/inbox endpoints. The fields mirror the snake_case wire
// shape directly.
type InboxItem struct {
	// ID is the UUID of the inbox item.
	ID string `json:"id"`
	// NotificationID is the UUID of the notification this item came from.
	NotificationID string `json:"notification_id"`
	// Title is the notification title (may be empty).
	Title string `json:"title,omitempty"`
	// Body is the notification body (may be empty).
	Body string `json:"body,omitempty"`
	// Data is the custom payload delivered with the notification.
	Data map[string]any `json:"data,omitempty"`
	// DeepLink is the URL / app deep link opened on tap, if any.
	DeepLink *string `json:"deep_link,omitempty"`
	// Read is true once the item has been marked read.
	Read bool `json:"read"`
	// ReadAt is the ISO-8601 timestamp the item was marked read, if any.
	ReadAt *string `json:"read_at,omitempty"`
	// InsertedAt is the ISO-8601 timestamp the item was created.
	InsertedAt *string `json:"inserted_at,omitempty"`
}
