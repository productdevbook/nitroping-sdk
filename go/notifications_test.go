package nitroping_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	nitroping "github.com/productdevbook/nitroping-sdk/go"
)

// newTestClient stands up an httptest.NewServer that runs `handler`,
// then constructs a Client pointed at it. The cleanup func closes the
// server.
func newTestClient(t *testing.T, handler http.HandlerFunc) *nitroping.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	client, err := nitroping.NewClient(nitroping.ClientOptions{
		APIKey:  "np_test_secret",
		BaseURL: srv.URL,
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	return client
}

func TestNotificationsSend_MethodPathHeadersBody(t *testing.T) {
	var captured struct {
		method string
		path   string
		auth   string
		accept string
		ctype  string
		ua     string
		body   map[string]any
	}

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		captured.auth = r.Header.Get("Authorization")
		captured.accept = r.Header.Get("Accept")
		captured.ctype = r.Header.Get("Content-Type")
		captured.ua = r.Header.Get("User-Agent")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured.body)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"abc-123","status":"queued"}`))
	})

	result, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:    "Order #4129 shipped",
		Body:     "On its way",
		DeepLink: nitroping.String("https://example.com/orders/4129"),
		Actions:  []nitroping.Action{{ID: "track", Title: "Track"}},
		Target:   nitroping.AllDevices(),
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if result.ID != "abc-123" || result.Status != "queued" {
		t.Errorf("got %+v, want {abc-123 queued}", result)
	}
	if captured.method != "POST" {
		t.Errorf("method = %q, want POST", captured.method)
	}
	if captured.path != "/api/v1/notifications" {
		t.Errorf("path = %q, want /api/v1/notifications", captured.path)
	}
	if captured.auth != "ApiKey np_test_secret" {
		t.Errorf("Authorization = %q", captured.auth)
	}
	if captured.accept != "application/json" {
		t.Errorf("Accept = %q", captured.accept)
	}
	if captured.ctype != "application/json" {
		t.Errorf("Content-Type = %q", captured.ctype)
	}
	if captured.ua == "" {
		t.Errorf("User-Agent unexpectedly empty")
	}

	// Wire-format checks: snake_case keys, deep_link present, target
	// serialised as {all:true}.
	if captured.body["title"] != "Order #4129 shipped" {
		t.Errorf("body.title = %v", captured.body["title"])
	}
	if captured.body["body"] != "On its way" {
		t.Errorf("body.body = %v", captured.body["body"])
	}
	if captured.body["deep_link"] != "https://example.com/orders/4129" {
		t.Errorf("body.deep_link = %v", captured.body["deep_link"])
	}
	target, _ := captured.body["target"].(map[string]any)
	if target == nil || target["all"] != true {
		t.Errorf("body.target = %v, want {all:true}", captured.body["target"])
	}
	actions, _ := captured.body["actions"].([]any)
	if len(actions) != 1 {
		t.Fatalf("body.actions len = %d, want 1", len(actions))
	}
	action0, _ := actions[0].(map[string]any)
	if action0["id"] != "track" || action0["title"] != "Track" {
		t.Errorf("body.actions[0] = %v", action0)
	}
	// `clickAction` was never set — the JSON encoder must omit it,
	// so the wire body must NOT contain a click_action key.
	if _, ok := captured.body["click_action"]; ok {
		t.Errorf("body should not include click_action when DeepLink-only")
	}
}

func TestNotificationsSend_IdempotencyKeyForwarded(t *testing.T) {
	var captured struct {
		idem string
		body map[string]any
	}

	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.idem = r.Header.Get("Idempotency-Key")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured.body)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"n1","status":"queued"}`))
	})

	_, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:  "Hi",
		Body:   "There",
		Target: nitroping.UserIDs([]string{"u1"}),
	}, nitroping.WithIdempotencyKey("order-shipped-4129"))
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if captured.idem != "order-shipped-4129" {
		t.Errorf("Idempotency-Key = %q", captured.idem)
	}
	// UserIDs target must serialise as user_ids.
	target, _ := captured.body["target"].(map[string]any)
	uids, _ := target["user_ids"].([]any)
	if len(uids) != 1 || uids[0] != "u1" {
		t.Errorf("body.target.user_ids = %v", target["user_ids"])
	}
}

func TestNotificationsSend_DeviceIDsTarget(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"n1","status":"queued"}`))
	})

	_, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:  "x",
		Body:   "y",
		Target: nitroping.DeviceIDs([]string{"d1", "d2"}),
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	target, _ := captured["target"].(map[string]any)
	ids, _ := target["device_ids"].([]any)
	if len(ids) != 2 || ids[0] != "d1" || ids[1] != "d2" {
		t.Errorf("body.target = %v", captured["target"])
	}
}

func TestNotificationsSend_TagsTarget(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"n1","status":"queued"}`))
	})

	_, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:  "x",
		Body:   "y",
		Target: nitroping.Tags([]string{"beta", "vip"}),
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	target, _ := captured["target"].(map[string]any)
	tags, _ := target["tags"].([]any)
	if len(tags) != 2 || tags[0] != "beta" || tags[1] != "vip" {
		t.Errorf("body.target = %v, want {tags:[beta vip]}", captured["target"])
	}
}

func TestNotificationsCancel_SendsDelete(t *testing.T) {
	var captured struct {
		method string
		path   string
		auth   string
	}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		captured.auth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"n1","status":"canceled"}`))
	})

	result, err := client.Notifications.Cancel(context.Background(), "n1")
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if captured.method != "DELETE" {
		t.Errorf("method = %q, want DELETE", captured.method)
	}
	if captured.path != "/api/v1/notifications/n1" {
		t.Errorf("path = %q", captured.path)
	}
	if captured.auth != "ApiKey np_test_secret" {
		t.Errorf("Authorization = %q", captured.auth)
	}
	if result.ID != "n1" || result.Status != "canceled" {
		t.Errorf("got %+v, want {n1 canceled}", result)
	}
}

func TestNotificationsCancel_409CannotCancel(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":{"code":"cannot_cancel","message":"Notification already in terminal state 'sent'"}}`))
	})

	_, err := client.Notifications.Cancel(context.Background(), "n1")
	if err == nil {
		t.Fatal("expected APIError")
	}
	var apiErr *nitroping.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T: %v", err, err)
	}
	if apiErr.StatusCode != 409 {
		t.Errorf("StatusCode = %d, want 409", apiErr.StatusCode)
	}
	if apiErr.Code != "cannot_cancel" {
		t.Errorf("Code = %q", apiErr.Code)
	}
}

func TestNotificationsCancel_EmptyIDReturnsError(t *testing.T) {
	client, err := nitroping.NewClient(nitroping.ClientOptions{APIKey: "np_x"})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	_, err = client.Notifications.Cancel(context.Background(), "")
	if err == nil {
		t.Fatal("expected error on empty notification id")
	}
}

func TestNotificationsSend_422APIError(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{
            "error": {
              "code": "validation_failed",
              "message": "Request body failed validation",
              "details": {"title": ["can't be blank"]}
            }
          }`))
	})

	_, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		// Intentionally invalid: no title, blank body, target empty.
		Body:   "",
		Target: nitroping.AllDevices(),
	})
	if err == nil {
		t.Fatal("expected APIError, got nil")
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
	if apiErr.Message != "Request body failed validation" {
		t.Errorf("Message = %q", apiErr.Message)
	}
	titleErr, _ := apiErr.Details["title"].([]any)
	if len(titleErr) != 1 || titleErr[0] != "can't be blank" {
		t.Errorf("Details.title = %v", apiErr.Details["title"])
	}
}

func TestNotificationsSend_NetworkErrorWrapped(t *testing.T) {
	// Point the client at a closed server — Send must return a
	// non-APIError that wraps the underlying *url.Error.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close() // close immediately; subsequent requests fail.

	client, err := nitroping.NewClient(nitroping.ClientOptions{
		APIKey:  "np_x",
		BaseURL: srv.URL,
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	_, err = client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:  "x",
		Body:   "y",
		Target: nitroping.AllDevices(),
	})
	if err == nil {
		t.Fatal("expected network error")
	}
	var apiErr *nitroping.APIError
	if errors.As(err, &apiErr) {
		t.Errorf("network error should not be an *APIError, got %v", apiErr)
	}
}

func TestNotificationsSend_ContextCancelled(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		// never write — request will be cancelled by the client.
		<-r.Context().Done()
	})
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	_, err := client.Notifications.Send(ctx, nitroping.SendRequest{
		Title:  "x",
		Body:   "y",
		Target: nitroping.AllDevices(),
	})
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
	if !errors.Is(err, context.Canceled) {
		t.Errorf("error should wrap context.Canceled, got %v", err)
	}
}

func TestNotificationsSend_SegmentTarget(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"n1","status":"queued"}`))
	})

	_, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title: "x",
		Body:  "y",
		Target: nitroping.Segment("any", []nitroping.SegmentCondition{
			{Field: "platform", Op: "eq", Value: "ios"},
			{Field: "tag", Op: "contains", Value: "vip"},
		}),
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	target, _ := captured["target"].(map[string]any)
	seg, _ := target["segment"].(map[string]any)
	if seg == nil {
		t.Fatalf("body.target.segment missing: %v", captured["target"])
	}
	if seg["match"] != "any" {
		t.Errorf("segment.match = %v, want any", seg["match"])
	}
	conds, _ := seg["conditions"].([]any)
	if len(conds) != 2 {
		t.Fatalf("segment.conditions len = %d, want 2", len(conds))
	}
	c0, _ := conds[0].(map[string]any)
	if c0["field"] != "platform" || c0["op"] != "eq" || c0["value"] != "ios" {
		t.Errorf("segment.conditions[0] = %v", c0)
	}
}

func TestNotificationsSend_SegmentTargetDefaultMatch(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"n1","status":"queued"}`))
	})

	// match == "" should default to "all".
	_, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:  "x",
		Body:   "y",
		Target: nitroping.Segment("", []nitroping.SegmentCondition{{Field: "user_id", Op: "exists"}}),
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	target, _ := captured["target"].(map[string]any)
	seg, _ := target["segment"].(map[string]any)
	if seg == nil || seg["match"] != "all" {
		t.Errorf("segment.match = %v, want all (default)", seg)
	}
	conds, _ := seg["conditions"].([]any)
	c0, _ := conds[0].(map[string]any)
	// `exists` op omits value entirely.
	if _, ok := c0["value"]; ok {
		t.Errorf("condition value should be omitted for exists op: %v", c0)
	}
}

func TestNotificationsSend_RecurrenceAndEmailFields(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"n1","status":"queued"}`))
	})

	_, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:           "x",
		Body:            "y",
		Recurrence:      nitroping.String("0 9 * * *"),
		RecurrenceTz:    nitroping.String("Europe/Istanbul"),
		RecurrenceUntil: nitroping.String("2026-12-31T00:00:00Z"),
		EmailTo:         []string{"a@example.com", "b@example.com"},
		Target:          nitroping.AllDevices(),
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if captured["recurrence"] != "0 9 * * *" {
		t.Errorf("body.recurrence = %v", captured["recurrence"])
	}
	if captured["recurrence_tz"] != "Europe/Istanbul" {
		t.Errorf("body.recurrence_tz = %v", captured["recurrence_tz"])
	}
	if captured["recurrence_until"] != "2026-12-31T00:00:00Z" {
		t.Errorf("body.recurrence_until = %v", captured["recurrence_until"])
	}
	emails, _ := captured["email_to"].([]any)
	if len(emails) != 2 || emails[0] != "a@example.com" {
		t.Errorf("body.email_to = %v", captured["email_to"])
	}
}

func TestNotificationsSend_RecurrenceFieldsOmittedWhenUnset(t *testing.T) {
	var captured map[string]any
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &captured)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"n1","status":"queued"}`))
	})

	_, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:  "x",
		Body:   "y",
		Target: nitroping.AllDevices(),
	})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	for _, k := range []string{"recurrence", "recurrence_tz", "recurrence_until", "email_to"} {
		if _, ok := captured[k]; ok {
			t.Errorf("body should not include %q when unset", k)
		}
	}
}
