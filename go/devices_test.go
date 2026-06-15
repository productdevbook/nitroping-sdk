package nitroping_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"testing"

	nitroping "github.com/productdevbook/nitroping-sdk/go"
)

func TestDevicesRegister_PostsSnakeCaseBody(t *testing.T) {
	var captured struct {
		method string
		path   string
		auth   string
		body   map[string]any
	}

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		captured.auth = r.Header.Get("Authorization")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured.body)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"dev-1","created":true}`))
	})

	result, err := client.Devices.Register(context.Background(), nitroping.DeviceRequest{
		Platform: nitroping.PlatformIOS,
		Token:    "apns-token-abc",
		UserID:   nitroping.String("user-42"),
		Metadata: map[string]any{"source": "tests"},
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if result.ID != "dev-1" || !result.Created {
		t.Errorf("got %+v, want {dev-1 true}", result)
	}
	if captured.method != "POST" {
		t.Errorf("method = %q, want POST", captured.method)
	}
	if captured.path != "/api/v1/devices" {
		t.Errorf("path = %q, want /api/v1/devices", captured.path)
	}
	if captured.auth != "ApiKey np_test_secret" {
		t.Errorf("Authorization = %q", captured.auth)
	}
	if captured.body["platform"] != "ios" {
		t.Errorf("body.platform = %v", captured.body["platform"])
	}
	if captured.body["token"] != "apns-token-abc" {
		t.Errorf("body.token = %v", captured.body["token"])
	}
	if captured.body["user_id"] != "user-42" {
		t.Errorf("body.user_id = %v", captured.body["user_id"])
	}
	meta, _ := captured.body["metadata"].(map[string]any)
	if meta["source"] != "tests" {
		t.Errorf("body.metadata = %v", captured.body["metadata"])
	}
}

func TestDevicesRegister_WebPlatformIncludesKeys(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"dev-2","created":false}`))
	})

	result, err := client.Devices.Register(context.Background(), nitroping.DeviceRequest{
		Platform:      nitroping.PlatformWeb,
		Token:         "https://fcm.googleapis.com/abc",
		WebPushP256dh: nitroping.String("BPS_p256dh_value"),
		WebPushAuth:   nitroping.String("auth_secret_value"),
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if result.Created {
		t.Errorf("Created = true, want false")
	}
	if captured["web_push_p256dh"] != "BPS_p256dh_value" {
		t.Errorf("web_push_p256dh = %v", captured["web_push_p256dh"])
	}
	if captured["web_push_auth"] != "auth_secret_value" {
		t.Errorf("web_push_auth = %v", captured["web_push_auth"])
	}
}

func TestDevicesRegister_TagsForwarded(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"dev-3","created":true}`))
	})

	_, err := client.Devices.Register(context.Background(), nitroping.DeviceRequest{
		Platform: nitroping.PlatformAndroid,
		Token:    "fcm-token",
		Tags:     []string{"beta", "vip"},
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	tags, _ := captured["tags"].([]any)
	if len(tags) != 2 || tags[0] != "beta" || tags[1] != "vip" {
		t.Errorf("body.tags = %v, want [beta vip]", captured["tags"])
	}
}

func TestDevicesUpdate_PutsTags(t *testing.T) {
	var captured struct {
		method string
		path   string
		auth   string
		ctype  string
		body   map[string]any
	}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		captured.auth = r.Header.Get("Authorization")
		captured.ctype = r.Header.Get("Content-Type")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured.body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"dev-1","tags":["beta","vip"]}`))
	})

	result, err := client.Devices.Update(context.Background(), "dev-1", nitroping.UpdateDeviceRequest{
		Tags: []string{"beta", "vip"},
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if captured.method != "PUT" {
		t.Errorf("method = %q, want PUT", captured.method)
	}
	if captured.path != "/api/v1/devices/dev-1" {
		t.Errorf("path = %q", captured.path)
	}
	if captured.auth != "ApiKey np_test_secret" {
		t.Errorf("Authorization = %q", captured.auth)
	}
	if captured.ctype != "application/json" {
		t.Errorf("Content-Type = %q", captured.ctype)
	}
	tags, _ := captured.body["tags"].([]any)
	if len(tags) != 2 || tags[0] != "beta" || tags[1] != "vip" {
		t.Errorf("body.tags = %v, want [beta vip]", captured.body["tags"])
	}
	if result.ID != "dev-1" {
		t.Errorf("result.ID = %q, want dev-1", result.ID)
	}
	if len(result.Tags) != 2 || result.Tags[0] != "beta" || result.Tags[1] != "vip" {
		t.Errorf("result.Tags = %v, want [beta vip]", result.Tags)
	}
}

func TestDevicesUpdate_404APIError(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":"not_found","message":"Device not found"}}`))
	})

	_, err := client.Devices.Update(context.Background(), "missing", nitroping.UpdateDeviceRequest{
		Tags: []string{"x"},
	})
	if err == nil {
		t.Fatal("expected APIError")
	}
	var apiErr *nitroping.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 404 {
		t.Errorf("StatusCode = %d", apiErr.StatusCode)
	}
	if apiErr.Code != "not_found" {
		t.Errorf("Code = %q", apiErr.Code)
	}
}

func TestDevicesUpdate_EmptyIDReturnsError(t *testing.T) {
	client, err := nitroping.NewClient(nitroping.ClientOptions{APIKey: "np_x"})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	_, err = client.Devices.Update(context.Background(), "", nitroping.UpdateDeviceRequest{})
	if err == nil {
		t.Fatal("expected error on empty device id")
	}
}

func TestDevicesDeactivate_SendsDelete(t *testing.T) {
	var captured struct {
		method string
		path   string
	}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"dev-1","status":"inactive"}`))
	})

	result, err := client.Devices.Deactivate(context.Background(), "dev-1")
	if err != nil {
		t.Fatalf("Deactivate: %v", err)
	}
	if captured.method != "DELETE" {
		t.Errorf("method = %q, want DELETE", captured.method)
	}
	if captured.path != "/api/v1/devices/dev-1" {
		t.Errorf("path = %q", captured.path)
	}
	if result.ID != "dev-1" || result.Status != "inactive" {
		t.Errorf("got %+v", result)
	}
}

func TestDevicesDeactivate_404APIError(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":"not_found","message":"Device not found"}}`))
	})

	_, err := client.Devices.Deactivate(context.Background(), "missing")
	if err == nil {
		t.Fatal("expected APIError")
	}
	var apiErr *nitroping.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 404 {
		t.Errorf("StatusCode = %d", apiErr.StatusCode)
	}
	if apiErr.Code != "not_found" {
		t.Errorf("Code = %q", apiErr.Code)
	}
}

func TestDevicesDeactivate_EmptyIDReturnsError(t *testing.T) {
	client, err := nitroping.NewClient(nitroping.ClientOptions{APIKey: "np_x"})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	_, err = client.Devices.Deactivate(context.Background(), "")
	if err == nil {
		t.Fatal("expected error on empty device id")
	}
}

func TestDevicesList_GetsWithSnakeCaseQueryAndMapsRows(t *testing.T) {
	var captured struct {
		method string
		path   string
		query  url.Values
		auth   string
	}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		captured.query = r.URL.Query()
		captured.auth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[{"id":"dev-1","user_id":"alice","platform":"ios","status":"active","tags":["vip"],"timezone":"Europe/Istanbul","apns_environment":"production","last_seen_at":"2026-06-15T00:00:00Z","inserted_at":"2026-06-14T00:00:00Z"}],"total":1}`))
	})

	res, err := client.Devices.List(context.Background(), nitroping.ListDevicesQuery{
		UserID:   "alice",
		Platform: nitroping.PlatformIOS,
		PageSize: nitroping.Int(10),
	})
	if err != nil {
		t.Fatalf("List: %v", err)
	}

	if captured.method != "GET" {
		t.Errorf("method = %q, want GET", captured.method)
	}
	if captured.path != "/api/v1/devices" {
		t.Errorf("path = %q, want /api/v1/devices", captured.path)
	}
	if captured.auth != "ApiKey np_test_secret" {
		t.Errorf("Authorization = %q", captured.auth)
	}
	if captured.query.Get("user_id") != "alice" {
		t.Errorf("query user_id = %q, want alice", captured.query.Get("user_id"))
	}
	if captured.query.Get("platform") != "ios" {
		t.Errorf("query platform = %q, want ios", captured.query.Get("platform"))
	}
	if captured.query.Get("page_size") != "10" {
		t.Errorf("query page_size = %q, want 10", captured.query.Get("page_size"))
	}

	if res.Total != 1 {
		t.Errorf("Total = %d, want 1", res.Total)
	}
	if len(res.Data) != 1 {
		t.Fatalf("len(Data) = %d, want 1", len(res.Data))
	}
	d := res.Data[0]
	if d.ID != "dev-1" {
		t.Errorf("Data[0].ID = %q, want dev-1", d.ID)
	}
	if d.UserID == nil || *d.UserID != "alice" {
		t.Errorf("Data[0].UserID = %v, want alice", d.UserID)
	}
	if d.Platform != nitroping.PlatformIOS {
		t.Errorf("Data[0].Platform = %q, want ios", d.Platform)
	}
	if d.Status != "active" {
		t.Errorf("Data[0].Status = %q, want active", d.Status)
	}
	if len(d.Tags) != 1 || d.Tags[0] != "vip" {
		t.Errorf("Data[0].Tags = %v, want [vip]", d.Tags)
	}
	if d.Timezone == nil || *d.Timezone != "Europe/Istanbul" {
		t.Errorf("Data[0].Timezone = %v, want Europe/Istanbul", d.Timezone)
	}
	if d.APNsEnvironment == nil || *d.APNsEnvironment != "production" {
		t.Errorf("Data[0].APNsEnvironment = %v, want production", d.APNsEnvironment)
	}
	if d.LastSeenAt == nil || *d.LastSeenAt != "2026-06-15T00:00:00Z" {
		t.Errorf("Data[0].LastSeenAt = %v", d.LastSeenAt)
	}
	if d.InsertedAt != "2026-06-14T00:00:00Z" {
		t.Errorf("Data[0].InsertedAt = %q", d.InsertedAt)
	}
}

func TestDevicesList_NeverExposesToken(t *testing.T) {
	// The list endpoint never returns the push token; assert the
	// DeviceSummary type has no field that could surface one, by
	// round-tripping a body that (hypothetically) included a token and
	// confirming it is dropped rather than decoded into the struct.
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[{"id":"dev-1","platform":"ios","status":"active","tags":[],"inserted_at":"2026-06-14T00:00:00Z","token":"SHOULD-NOT-APPEAR"}],"total":1}`))
	})

	res, err := client.Devices.List(context.Background(), nitroping.ListDevicesQuery{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(res.Data) != 1 {
		t.Fatalf("len(Data) = %d, want 1", len(res.Data))
	}

	// Re-marshal the decoded summary and confirm no token leaked through.
	raw, err := json.Marshal(res.Data[0])
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var roundTrip map[string]any
	if err := json.Unmarshal(raw, &roundTrip); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if _, ok := roundTrip["token"]; ok {
		t.Errorf("DeviceSummary unexpectedly carries a token field: %s", raw)
	}
}

func TestDevicesList_EmptyQueryHasNoQueryString(t *testing.T) {
	var rawQuery string
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		rawQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[],"total":0}`))
	})

	res, err := client.Devices.List(context.Background(), nitroping.ListDevicesQuery{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if rawQuery != "" {
		t.Errorf("RawQuery = %q, want empty", rawQuery)
	}
	if res.Total != 0 || len(res.Data) != 0 {
		t.Errorf("got %+v, want empty listing", res)
	}
}

func TestDevicesDeactivateByToken_SendsTokenBody(t *testing.T) {
	var captured struct {
		method string
		path   string
		ctype  string
		body   map[string]any
	}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		captured.ctype = r.Header.Get("Content-Type")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured.body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"dev-9","status":"inactive"}`))
	})

	result, err := client.Devices.DeactivateByToken(context.Background(), "apns-token-xyz")
	if err != nil {
		t.Fatalf("DeactivateByToken: %v", err)
	}
	if captured.method != "DELETE" {
		t.Errorf("method = %q, want DELETE", captured.method)
	}
	if captured.path != "/api/v1/devices" {
		t.Errorf("path = %q, want /api/v1/devices", captured.path)
	}
	if captured.ctype != "application/json" {
		t.Errorf("Content-Type = %q", captured.ctype)
	}
	if captured.body["token"] != "apns-token-xyz" {
		t.Errorf("body.token = %v, want apns-token-xyz", captured.body["token"])
	}
	if result.ID != "dev-9" || result.Status != "inactive" {
		t.Errorf("got %+v, want {dev-9 inactive}", result)
	}
}

func TestDevicesDeactivateByToken_404APIError(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":"not_found","message":"Device not found"}}`))
	})

	_, err := client.Devices.DeactivateByToken(context.Background(), "nope")
	if err == nil {
		t.Fatal("expected APIError")
	}
	var apiErr *nitroping.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 404 {
		t.Errorf("StatusCode = %d", apiErr.StatusCode)
	}
	if apiErr.Code != "not_found" {
		t.Errorf("Code = %q", apiErr.Code)
	}
}

func TestDevicesDeactivateByToken_EmptyTokenReturnsError(t *testing.T) {
	client, err := nitroping.NewClient(nitroping.ClientOptions{APIKey: "np_x"})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	_, err = client.Devices.DeactivateByToken(context.Background(), "")
	if err == nil {
		t.Fatal("expected error on empty token")
	}
}

func TestDevicesRegister_TimezoneForwarded(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"dev-4","created":true}`))
	})

	_, err := client.Devices.Register(context.Background(), nitroping.DeviceRequest{
		Platform: nitroping.PlatformIOS,
		Token:    "apns-token",
		Timezone: nitroping.String("Europe/Istanbul"),
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if captured["timezone"] != "Europe/Istanbul" {
		t.Errorf("body.timezone = %v, want Europe/Istanbul", captured["timezone"])
	}
}

func TestDevicesRegister_TimezoneOmittedWhenUnset(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"dev-5","created":true}`))
	})

	_, err := client.Devices.Register(context.Background(), nitroping.DeviceRequest{
		Platform: nitroping.PlatformAndroid,
		Token:    "fcm-token",
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if _, ok := captured["timezone"]; ok {
		t.Errorf("body should not include timezone when unset")
	}
}
