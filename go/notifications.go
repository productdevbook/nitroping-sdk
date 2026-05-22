package nitroping

import (
	"context"
	"errors"
	"net/url"
)

// NotificationsService wraps the /api/v1/notifications endpoints.
// Construct one via NewClient — there is no value in using this type
// directly.
type NotificationsService struct {
	transport *transport
}

// Send enqueues a notification. On success the result is decoded into
// a NotificationResult (typically {ID, Status: "queued"}).
//
// Per-call options (currently only WithIdempotencyKey, WithHeader) are
// passed as trailing variadic args. The Idempotency-Key + body
// combination is honoured server-side: same key + same body replays
// the cached response, same key + different body returns a 409 with
// code "idempotency_conflict".
//
//	res, err := client.Notifications.Send(ctx, nitroping.SendRequest{
//	    Title:  "Order #4129 shipped",
//	    Body:   "On its way",
//	    Target: nitroping.AllDevices(),
//	}, nitroping.WithIdempotencyKey("order-shipped-4129"))
func (s *NotificationsService) Send(
	ctx context.Context,
	req SendRequest,
	opts ...RequestOption,
) (*NotificationResult, error) {
	cfg := applyOptions(opts)
	var out NotificationResult
	if err := s.transport.do(ctx, "POST", "/api/v1/notifications", req, cfg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Get fetches a previously-enqueued notification by id. The full row
// (including the `counters` map) is returned as a generic map so the
// SDK doesn't have to track every server-side schema change.
//
// To read a typed field, key into the map:
//
//	row, err := client.Notifications.Get(ctx, "abc-123")
//	if err != nil { return err }
//	counters, _ := row["counters"].(map[string]any)
func (s *NotificationsService) Get(
	ctx context.Context,
	id string,
	opts ...RequestOption,
) (map[string]any, error) {
	if id == "" {
		return nil, errors.New("nitroping: notification id is required")
	}
	cfg := applyOptions(opts)
	var out map[string]any
	path := "/api/v1/notifications/" + url.PathEscape(id)
	if err := s.transport.do(ctx, "GET", path, nil, cfg, &out); err != nil {
		return nil, err
	}
	return out, nil
}
