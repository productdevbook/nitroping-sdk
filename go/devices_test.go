package nitroping_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
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
