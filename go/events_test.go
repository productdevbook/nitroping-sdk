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

func TestEventsReport_PostsSnakeCaseBody(t *testing.T) {
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
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":true}`))
	})

	result, err := client.Events.Report(context.Background(), nitroping.ReportEventRequest{
		NotificationID: "n1",
		DeviceID:       "d1",
		Type:           nitroping.EventOpened,
	})
	if err != nil {
		t.Fatalf("Report: %v", err)
	}
	if !result.Accepted {
		t.Errorf("result.Accepted = false, want true")
	}
	if captured.method != "POST" {
		t.Errorf("method = %q, want POST", captured.method)
	}
	if captured.path != "/api/v1/events" {
		t.Errorf("path = %q, want /api/v1/events", captured.path)
	}
	if captured.ctype != "application/json" {
		t.Errorf("Content-Type = %q", captured.ctype)
	}
	if captured.body["notification_id"] != "n1" {
		t.Errorf("body.notification_id = %v", captured.body["notification_id"])
	}
	if captured.body["device_id"] != "d1" {
		t.Errorf("body.device_id = %v", captured.body["device_id"])
	}
	if captured.body["type"] != "opened" {
		t.Errorf("body.type = %v, want opened", captured.body["type"])
	}
	// Optional fields unset — must be omitted from the wire body.
	if _, ok := captured.body["action_id"]; ok {
		t.Errorf("body should not include action_id when unset")
	}
	if _, ok := captured.body["happened_at"]; ok {
		t.Errorf("body should not include happened_at when unset")
	}
}

func TestEventsReport_OptionalFieldsForwarded(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":true}`))
	})

	_, err := client.Events.Report(context.Background(), nitroping.ReportEventRequest{
		NotificationID: "n1",
		DeviceID:       "d1",
		Type:           nitroping.EventClicked,
		ActionID:       nitroping.String("track"),
		HappenedAt:     nitroping.String("2026-06-13T10:00:00Z"),
	})
	if err != nil {
		t.Fatalf("Report: %v", err)
	}
	if captured["type"] != "clicked" {
		t.Errorf("body.type = %v, want clicked", captured["type"])
	}
	if captured["action_id"] != "track" {
		t.Errorf("body.action_id = %v, want track", captured["action_id"])
	}
	if captured["happened_at"] != "2026-06-13T10:00:00Z" {
		t.Errorf("body.happened_at = %v", captured["happened_at"])
	}
}

func TestEventsReport_404APIError(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":"not_found","message":"Notification or device not found"}}`))
	})

	_, err := client.Events.Report(context.Background(), nitroping.ReportEventRequest{
		NotificationID: "n1",
		DeviceID:       "d1",
		Type:           nitroping.EventOpened,
	})
	if err == nil {
		t.Fatal("expected APIError")
	}
	var apiErr *nitroping.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 404 {
		t.Errorf("StatusCode = %d, want 404", apiErr.StatusCode)
	}
	if apiErr.Code != "not_found" {
		t.Errorf("Code = %q", apiErr.Code)
	}
}

func TestEventsReport_RequiredIDsValidatedLocally(t *testing.T) {
	client, err := nitroping.NewClient(nitroping.ClientOptions{APIKey: "np_x"})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	if _, err := client.Events.Report(context.Background(), nitroping.ReportEventRequest{
		DeviceID: "d1",
		Type:     nitroping.EventOpened,
	}); err == nil {
		t.Fatal("expected error on empty notification id")
	}
	if _, err := client.Events.Report(context.Background(), nitroping.ReportEventRequest{
		NotificationID: "n1",
		Type:           nitroping.EventOpened,
	}); err == nil {
		t.Fatal("expected error on empty device id")
	}
}
