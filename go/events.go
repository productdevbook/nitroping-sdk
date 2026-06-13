package nitroping

import (
	"context"
	"errors"
)

// EventsService wraps the /api/v1/events endpoint — the public,
// unauthenticated engagement endpoint. The (NotificationID, DeviceID)
// pair is the bearer secret, so no Authorization header is strictly
// required (a pk_ public key is also fine). This is what a client app
// calls when a notification is opened or an action is clicked.
//
// Construct one via NewClient.
type EventsService struct {
	transport *transport
}

// Report reports an engagement event (EventOpened or EventClicked).
// NotificationID, DeviceID and Type are required; ActionID and
// HappenedAt are optional. On success the result is {Accepted: true}.
//
// Returns *APIError with Code="not_found" (404) if the notification /
// device pair is unknown.
//
//	res, err := client.Events.Report(ctx, nitroping.ReportEventRequest{
//	    NotificationID: "n1",
//	    DeviceID:       "d1",
//	    Type:           nitroping.EventOpened,
//	})
func (s *EventsService) Report(
	ctx context.Context,
	req ReportEventRequest,
	opts ...RequestOption,
) (*EventResult, error) {
	if req.NotificationID == "" {
		return nil, errors.New("nitroping: notification id is required")
	}
	if req.DeviceID == "" {
		return nil, errors.New("nitroping: device id is required")
	}
	cfg := applyOptions(opts)
	var out EventResult
	if err := s.transport.do(ctx, "POST", "/api/v1/events", req, cfg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
