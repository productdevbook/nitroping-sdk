package nitroping

import (
	"context"
	"errors"
	"net/url"
	"strconv"
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
	path := "/api/v1/devices"
	if s.transport.authScheme == "Public" {
		path = "/api/v1/public/devices"
	}
	var out DeviceResult
	if err := s.transport.do(ctx, "POST", path, req, cfg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// List lists devices via GET /api/v1/devices (secret key only). The
// optional query filters by user id, platform, status, and paginates.
// The push token is never returned — each row is a DeviceSummary with
// no token field. On success the result is {Data, Total}.
//
//	res, err := client.Devices.List(ctx, nitroping.ListDevicesQuery{
//	    UserID:   "user-42",
//	    Platform: nitroping.PlatformIOS,
//	})
func (s *DevicesService) List(
	ctx context.Context,
	query ListDevicesQuery,
	opts ...RequestOption,
) (*ListDevicesResult, error) {
	cfg := applyOptions(opts)

	q := url.Values{}
	if query.UserID != "" {
		q.Set("user_id", query.UserID)
	}
	if query.Platform != "" {
		q.Set("platform", string(query.Platform))
	}
	if query.Status != "" {
		q.Set("status", query.Status)
	}
	if query.Page != nil {
		q.Set("page", strconv.Itoa(*query.Page))
	}
	if query.PageSize != nil {
		q.Set("page_size", strconv.Itoa(*query.PageSize))
	}

	path := "/api/v1/devices"
	if encoded := q.Encode(); encoded != "" {
		path += "?" + encoded
	}

	var out ListDevicesResult
	if err := s.transport.do(ctx, "GET", path, nil, cfg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Update updates a device via PUT /api/v1/devices/:id. Currently the
// only updatable field is the tag set (req.Tags). On success the result
// is {ID, Tags} reflecting the device's tags after the update.
//
// Returns *APIError with Code="not_found" if the id doesn't belong to
// the caller's app.
//
//	res, err := client.Devices.Update(ctx, "dev-1", nitroping.UpdateDeviceRequest{
//	    Tags: []string{"beta", "vip"},
//	})
func (s *DevicesService) Update(
	ctx context.Context,
	id string,
	req UpdateDeviceRequest,
	opts ...RequestOption,
) (*UpdateDeviceResult, error) {
	if id == "" {
		return nil, errors.New("nitroping: device id is required")
	}
	cfg := applyOptions(opts)
	var out UpdateDeviceResult
	path := "/api/v1/devices/" + url.PathEscape(id)
	if err := s.transport.do(ctx, "PUT", path, req, cfg, &out); err != nil {
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

// DeactivateByToken soft-deletes a device by its provider token rather
// than its id (the logout flow: you hold the push token but not the
// device id). It sends DELETE /api/v1/devices with a {"token": ...}
// body. Returns *APIError with Code="not_found" if no device with that
// token belongs to the caller's app.
//
// This is the sibling of Deactivate, which deletes by id.
func (s *DevicesService) DeactivateByToken(
	ctx context.Context,
	token string,
	opts ...RequestOption,
) (*DeactivateResult, error) {
	if token == "" {
		return nil, errors.New("nitroping: device token is required")
	}
	cfg := applyOptions(opts)
	body := struct {
		Token string `json:"token"`
	}{Token: token}
	var out DeactivateResult
	if err := s.transport.do(ctx, "DELETE", "/api/v1/devices", body, cfg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
