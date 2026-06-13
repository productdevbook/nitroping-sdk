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

func TestTrackRecord_DeliveryLogShape(t *testing.T) {
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
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":true}`))
	})

	result, err := client.Track.Record(context.Background(),
		nitroping.TrackByDeliveryLog("dl-1", nitroping.TrackDelivered))
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if !result.Accepted {
		t.Errorf("result.Accepted = false, want true")
	}
	if captured.method != "POST" {
		t.Errorf("method = %q, want POST", captured.method)
	}
	if captured.path != "/api/v1/track" {
		t.Errorf("path = %q, want /api/v1/track", captured.path)
	}
	if captured.auth != "ApiKey np_test_secret" {
		t.Errorf("Authorization = %q", captured.auth)
	}
	if captured.ctype != "application/json" {
		t.Errorf("Content-Type = %q", captured.ctype)
	}
	if captured.body["delivery_log_id"] != "dl-1" {
		t.Errorf("body.delivery_log_id = %v, want dl-1", captured.body["delivery_log_id"])
	}
	if captured.body["event"] != "delivered" {
		t.Errorf("body.event = %v, want delivered", captured.body["event"])
	}
	// Token-shape keys must be absent when keyed by delivery log.
	if _, ok := captured.body["notification_id"]; ok {
		t.Errorf("body should not include notification_id for delivery-log shape")
	}
	if _, ok := captured.body["device_token"]; ok {
		t.Errorf("body should not include device_token for delivery-log shape")
	}
}

func TestTrackRecord_TokenShape(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":true}`))
	})

	result, err := client.Track.Record(context.Background(),
		nitroping.TrackByToken("n1", "apns-token", nitroping.TrackClicked))
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if !result.Accepted {
		t.Errorf("result.Accepted = false, want true")
	}
	if captured["notification_id"] != "n1" {
		t.Errorf("body.notification_id = %v, want n1", captured["notification_id"])
	}
	if captured["device_token"] != "apns-token" {
		t.Errorf("body.device_token = %v, want apns-token", captured["device_token"])
	}
	if captured["event"] != "clicked" {
		t.Errorf("body.event = %v, want clicked", captured["event"])
	}
	if _, ok := captured["delivery_log_id"]; ok {
		t.Errorf("body should not include delivery_log_id for token shape")
	}
}

func TestTrackRecord_422APIError(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"error":{"code":"validation_failed","message":"event must be one of: delivered, opened, clicked"}}`))
	})

	_, err := client.Track.Record(context.Background(),
		nitroping.TrackByDeliveryLog("dl-1", nitroping.TrackEvent("bogus")))
	if err == nil {
		t.Fatal("expected APIError")
	}
	var apiErr *nitroping.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 422 {
		t.Errorf("StatusCode = %d, want 422", apiErr.StatusCode)
	}
	if apiErr.Code != "validation_failed" {
		t.Errorf("Code = %q", apiErr.Code)
	}
}
