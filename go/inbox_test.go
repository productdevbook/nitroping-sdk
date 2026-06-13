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

func mustParseQuery(t *testing.T, raw string) url.Values {
	t.Helper()
	v, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatalf("ParseQuery(%q): %v", raw, err)
	}
	return v
}

func unmarshalJSON(data []byte, out any) error {
	return json.Unmarshal(data, out)
}

func TestInboxList_QueryAndDecode(t *testing.T) {
	var captured struct {
		method string
		path   string
		query  string
	}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		captured.query = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"items":[
			{"id":"i1","notification_id":"n1","title":"Hi","body":"There","read":false,"deep_link":"https://x","inserted_at":"2026-06-13T10:00:00Z"},
			{"id":"i2","notification_id":"n2","read":true,"read_at":"2026-06-13T11:00:00Z"}
		]}`))
	})

	items, err := client.Inbox.List(context.Background(), "user-42",
		nitroping.WithUnreadOnly(true), nitroping.WithLimit(20))
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if captured.method != "GET" {
		t.Errorf("method = %q, want GET", captured.method)
	}
	if captured.path != "/api/v1/public/inbox" {
		t.Errorf("path = %q", captured.path)
	}
	q := mustParseQuery(t, captured.query)
	if q.Get("user_id") != "user-42" {
		t.Errorf("query user_id = %q", q.Get("user_id"))
	}
	if q.Get("unread_only") != "true" {
		t.Errorf("query unread_only = %q, want true", q.Get("unread_only"))
	}
	if q.Get("limit") != "20" {
		t.Errorf("query limit = %q, want 20", q.Get("limit"))
	}
	if len(items) != 2 {
		t.Fatalf("len(items) = %d, want 2", len(items))
	}
	if items[0].ID != "i1" || items[0].NotificationID != "n1" || items[0].Title != "Hi" || items[0].Read {
		t.Errorf("items[0] = %+v", items[0])
	}
	if items[0].DeepLink == nil || *items[0].DeepLink != "https://x" {
		t.Errorf("items[0].DeepLink = %v", items[0].DeepLink)
	}
	if !items[1].Read || items[1].ReadAt == nil || *items[1].ReadAt != "2026-06-13T11:00:00Z" {
		t.Errorf("items[1] = %+v", items[1])
	}
}

func TestInboxList_OmitsOptionalQuery(t *testing.T) {
	var rawQuery string
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		rawQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[]}`))
	})

	_, err := client.Inbox.List(context.Background(), "u1")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	q := mustParseQuery(t, rawQuery)
	if _, ok := q["unread_only"]; ok {
		t.Errorf("unread_only should be absent when not set")
	}
	if _, ok := q["limit"]; ok {
		t.Errorf("limit should be absent when not set")
	}
}

func TestInboxList_RequiresUserID(t *testing.T) {
	client, err := nitroping.NewClient(nitroping.ClientOptions{APIKey: "pk_x"})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	if _, err := client.Inbox.List(context.Background(), ""); err == nil {
		t.Fatal("expected error on empty user id")
	}
}

func TestInboxUnreadCount(t *testing.T) {
	var path, query string
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		query = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"unread_count":7}`))
	})

	n, err := client.Inbox.UnreadCount(context.Background(), "user-42")
	if err != nil {
		t.Fatalf("UnreadCount: %v", err)
	}
	if path != "/api/v1/public/inbox/unread_count" {
		t.Errorf("path = %q", path)
	}
	if mustParseQuery(t, query).Get("user_id") != "user-42" {
		t.Errorf("query user_id = %q", query)
	}
	if n != 7 {
		t.Errorf("UnreadCount = %d, want 7", n)
	}
}

func TestInboxMarkRead(t *testing.T) {
	var captured struct {
		method string
		path   string
		body   map[string]any
	}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		_ = unmarshalJSON(raw, &captured.body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"i1","notification_id":"n1","read":true,"read_at":"2026-06-13T12:00:00Z"}`))
	})

	item, err := client.Inbox.MarkRead(context.Background(), "user-42", "i1")
	if err != nil {
		t.Fatalf("MarkRead: %v", err)
	}
	if captured.method != "POST" {
		t.Errorf("method = %q, want POST", captured.method)
	}
	if captured.path != "/api/v1/public/inbox/i1/read" {
		t.Errorf("path = %q", captured.path)
	}
	if captured.body["user_id"] != "user-42" {
		t.Errorf("body.user_id = %v", captured.body["user_id"])
	}
	if !item.Read || item.ReadAt == nil {
		t.Errorf("item = %+v", item)
	}
}

func TestInboxMarkRead_RequiresIDs(t *testing.T) {
	client, err := nitroping.NewClient(nitroping.ClientOptions{APIKey: "pk_x"})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	if _, err := client.Inbox.MarkRead(context.Background(), "", "i1"); err == nil {
		t.Fatal("expected error on empty user id")
	}
	if _, err := client.Inbox.MarkRead(context.Background(), "u1", ""); err == nil {
		t.Fatal("expected error on empty item id")
	}
}

func TestInboxMarkAllRead(t *testing.T) {
	var captured struct {
		method string
		path   string
		body   map[string]any
	}
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		_ = unmarshalJSON(raw, &captured.body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"marked_read":3}`))
	})

	n, err := client.Inbox.MarkAllRead(context.Background(), "user-42")
	if err != nil {
		t.Fatalf("MarkAllRead: %v", err)
	}
	if captured.method != "POST" || captured.path != "/api/v1/public/inbox/read_all" {
		t.Errorf("method/path = %q %q", captured.method, captured.path)
	}
	if captured.body["user_id"] != "user-42" {
		t.Errorf("body.user_id = %v", captured.body["user_id"])
	}
	if n != 3 {
		t.Errorf("MarkAllRead = %d, want 3", n)
	}
}

func TestInbox_404APIError(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":"not_found","message":"Inbox item not found"}}`))
	})

	_, err := client.Inbox.MarkRead(context.Background(), "u1", "missing")
	if err == nil {
		t.Fatal("expected APIError")
	}
	var apiErr *nitroping.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *APIError, got %T: %v", err, err)
	}
	if apiErr.Code != "not_found" {
		t.Errorf("Code = %q", apiErr.Code)
	}
}
