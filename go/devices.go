package nitroping

import (
	"context"
	"errors"
	"net/url"
)

// DevicesService wraps the /api/v1/devices endpoints. Construct one
// via NewClient.
type DevicesService struct {
	transport *transport
}

// Register registers (or updates) a device with the secret API key.
// Use this for iOS and Android where you control the server. For
// browser flows use the public-key web subscribe API instead (Go SDK
// is server-side only, so there's no equivalent here yet).
//
// The endpoint is idempotent on (app_id, token, user_id) — sending the
// same triple twice returns the existing row with Created=false.
//
//	res, err := client.Devices.Register(ctx, nitroping.DeviceRequest{
//	    Platform: nitroping.PlatformIOS,
//	    Token:    "apns-hex-token",
//	    UserID:   nitroping.String("user-42"),
//	})
func (s *DevicesService) Register(
	ctx context.Context,
	req DeviceRequest,
	opts ...RequestOption,
) (*DeviceResult, error) {
	cfg := applyOptions(opts)
	var out DeviceResult
	if err := s.transport.do(ctx, "POST", "/api/v1/devices", req, cfg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Deactivate soft-deletes a device (sets status=inactive). Future
// sends skip it. Returns *APIError with Code="not_found" if the id
// doesn't belong to the caller's app.
func (s *DevicesService) Deactivate(
	ctx context.Context,
	id string,
	opts ...RequestOption,
) (*DeactivateResult, error) {
	if id == "" {
		return nil, errors.New("nitroping: device id is required")
	}
	cfg := applyOptions(opts)
	var out DeactivateResult
	path := "/api/v1/devices/" + url.PathEscape(id)
	if err := s.transport.do(ctx, "DELETE", path, nil, cfg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
