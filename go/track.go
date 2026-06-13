package nitroping

import "context"

// TrackService wraps the /api/v1/track endpoint — the server SDK
// delivery / open / click callback. Construct one via NewClient.
type TrackService struct {
	transport *transport
}

// Record reports a delivery/open/click event against a delivery log.
// Identify the target either by a delivery log id (TrackByDeliveryLog)
// or by a notification id + the device's push token (TrackByToken). The
// event is one of TrackDelivered, TrackOpened, TrackClicked.
//
// The endpoint returns 202 immediately; the write is absorbed by a
// background worker. On success the result is {Accepted: true}.
//
//	res, err := client.Track.Record(ctx,
//	    nitroping.TrackByDeliveryLog("dl-1", nitroping.TrackDelivered))
func (s *TrackService) Record(
	ctx context.Context,
	req TrackRequest,
	opts ...RequestOption,
) (*TrackResult, error) {
	cfg := applyOptions(opts)
	var out TrackResult
	if err := s.transport.do(ctx, "POST", "/api/v1/track", req, cfg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
