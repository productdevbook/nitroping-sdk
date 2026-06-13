package nitroping_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"time"

	nitroping "github.com/productdevbook/nitroping-sdk/go"
	"github.com/productdevbook/nitroping-sdk/go/webhooks"
)

// ExampleClient_send is a runnable godoc example showing the
// minimum-viable Send call. The actual nitroping.dev endpoint is
// stubbed out with httptest so this example runs offline.
func ExampleClient_send() {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"abc-123","status":"queued"}`))
	}))
	defer srv.Close()

	client, _ := nitroping.NewClient(nitroping.ClientOptions{
		APIKey:  "np_test",
		BaseURL: srv.URL,
	})

	res, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
		Title:    "Order #4129 shipped",
		Body:     "On its way",
		DeepLink: nitroping.String("https://example.com/orders/4129"),
		Target:   nitroping.AllDevices(),
	}, nitroping.WithIdempotencyKey("order-shipped-4129"))
	if err != nil {
		fmt.Println("send error:", err)
		return
	}
	fmt.Println(res.ID, res.Status)
	// Output: abc-123 queued
}

// ExampleTrackService_Record shows reporting a delivery event against a
// delivery log id. The endpoint is stubbed with httptest so the example
// runs offline.
func ExampleTrackService_Record() {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":true}`))
	}))
	defer srv.Close()

	client, _ := nitroping.NewClient(nitroping.ClientOptions{
		APIKey:  "np_test",
		BaseURL: srv.URL,
	})

	res, err := client.Track.Record(context.Background(),
		nitroping.TrackByDeliveryLog("dl-1", nitroping.TrackDelivered))
	if err != nil {
		fmt.Println("track error:", err)
		return
	}
	fmt.Println(res.Accepted)
	// Output: true
}

// ExampleEventsService_Report shows reporting an engagement event from a
// client app. The endpoint is stubbed with httptest so the example runs
// offline.
func ExampleEventsService_Report() {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":true}`))
	}))
	defer srv.Close()

	client, _ := nitroping.NewClient(nitroping.ClientOptions{
		APIKey:  "pk_test",
		BaseURL: srv.URL,
	})

	res, err := client.Events.Report(context.Background(), nitroping.ReportEventRequest{
		NotificationID: "n1",
		DeviceID:       "d1",
		Type:           nitroping.EventOpened,
	})
	if err != nil {
		fmt.Println("report error:", err)
		return
	}
	fmt.Println(res.Accepted)
	// Output: true
}

// ExampleVerify shows the canonical webhook verification flow: read
// the raw body, pull the signature header, hand both to webhooks.Verify.
func ExampleVerify() {
	secret := "whsec_example"
	event := map[string]any{
		"id":         "evt_1",
		"type":       "notification.delivered",
		"created_at": "2026-05-22T10:00:00Z",
		"data":       map[string]any{"notification_id": "n1"},
	}
	body, _ := json.Marshal(event)
	signedAt := time.Unix(1_700_000_000, 0)
	header := webhooks.Sign(secret, body, signedAt)

	got, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: header,
		Secret:    secret,
		Now:       signedAt,
	})
	if err != nil {
		fmt.Println("verify error:", err)
		return
	}
	fmt.Println(got.Type)
	// Output: notification.delivered
}
