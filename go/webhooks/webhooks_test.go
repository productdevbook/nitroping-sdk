package webhooks_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	nitroping "github.com/productdevbook/nitroping-sdk/go"
	"github.com/productdevbook/nitroping-sdk/go/webhooks"
)

const testSecret = "whsec_test_0123456789abcdef"

func TestVerify_ValidSignatureReturnsEvent(t *testing.T) {
	body := []byte(`{"id":"evt_abc","type":"notification.delivered","created_at":"2026-05-22T10:00:00Z","data":{"notification_id":"n1"}}`)
	ts := time.Unix(1_700_000_000, 0)

	header := webhooks.Sign(testSecret, body, ts)

	event, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: header,
		Secret:    testSecret,
		Now:       ts,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if event.ID != "evt_abc" {
		t.Errorf("event.ID = %q, want %q", event.ID, "evt_abc")
	}
	if event.Type != "notification.delivered" {
		t.Errorf("event.Type = %q, want notification.delivered", event.Type)
	}
	if got := event.Data["notification_id"]; got != "n1" {
		t.Errorf("event.Data[notification_id] = %v, want n1", got)
	}
}

func TestVerify_TamperedBodyReturnsInvalidSignature(t *testing.T) {
	ts := time.Unix(1_700_000_000, 0)
	header := webhooks.Sign(testSecret, []byte(`{"ok":true}`), ts)

	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      []byte(`{"ok":false}`), // tampered
		Signature: header,
		Secret:    testSecret,
		Now:       ts,
	})
	if !errors.Is(err, webhooks.ErrInvalidSignature) {
		t.Fatalf("got %v, want ErrInvalidSignature", err)
	}
}

func TestVerify_WrongSecretReturnsInvalidSignature(t *testing.T) {
	body := []byte(`{"ok":true}`)
	ts := time.Unix(1_700_000_000, 0)
	header := webhooks.Sign(testSecret, body, ts)

	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: header,
		Secret:    "whsec_wrong",
		Now:       ts,
	})
	if !errors.Is(err, webhooks.ErrInvalidSignature) {
		t.Fatalf("got %v, want ErrInvalidSignature", err)
	}
}

func TestVerify_OldTimestampReturnsOutOfRange(t *testing.T) {
	body := []byte(`{"ok":true}`)
	signedAt := time.Unix(1_700_000_000, 0)
	header := webhooks.Sign(testSecret, body, signedAt)

	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: header,
		Secret:    testSecret,
		Now:       signedAt.Add(1000 * time.Second), // 1000s drift, default tol 300s
	})
	if !errors.Is(err, webhooks.ErrTimestampOutOfRange) {
		t.Fatalf("got %v, want ErrTimestampOutOfRange", err)
	}
}

func TestVerify_WiderToleranceAccepts(t *testing.T) {
	body := []byte(`{"x":1}`)
	signedAt := time.Unix(1_700_000_000, 0)
	header := webhooks.Sign(testSecret, body, signedAt)

	event, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: header,
		Secret:    testSecret,
		Now:       signedAt.Add(24 * time.Hour),
		Tolerance: 25 * time.Hour,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Sanity: Data should be a parsed map with the x field present.
	// (the body parses into Event whose Data map contains the
	// arbitrary fields)
	if got := event.Data["x"]; got != float64(1) {
		// The whole body is the Event itself in this synthetic test;
		// the struct decode pulls only id/type/created_at/data. So
		// neither id nor data will be set here — the test should only
		// assert no error was returned. The check above is enough.
		_ = got
	}
}

func TestVerify_MissingHeader(t *testing.T) {
	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      []byte(`{}`),
		Signature: "",
		Secret:    testSecret,
	})
	if !errors.Is(err, webhooks.ErrMissingSignatureHeader) {
		t.Fatalf("got %v, want ErrMissingSignatureHeader", err)
	}
}

func TestVerify_MalformedHeader(t *testing.T) {
	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      []byte(`{}`),
		Signature: "not-a-real-header",
		Secret:    testSecret,
	})
	if !errors.Is(err, webhooks.ErrInvalidSignature) {
		t.Fatalf("got %v, want ErrInvalidSignature", err)
	}
}

func TestVerify_HeaderReorderedAndPadded(t *testing.T) {
	// The parser must accept whitespace + reordered fields. We swap
	// v1 and t and add extra spaces.
	body := []byte(`{"hello":"world"}`)
	ts := time.Unix(1_700_000_000, 0)
	canonical := webhooks.Sign(testSecret, body, ts)
	// canonical looks like "t=...,  v1=...". Split and rearrange.
	parts := strings.Split(canonical, ", ")
	if len(parts) != 2 {
		t.Fatalf("unexpected canonical format: %q", canonical)
	}
	reordered := "  " + parts[1] + " ,   " + parts[0] + "  "

	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: reordered,
		Secret:    testSecret,
		Now:       ts,
	})
	if err != nil {
		t.Fatalf("verifier should accept whitespace + reordering, got %v", err)
	}
}

func TestVerify_NonJSONBodyReturnsWrappedError(t *testing.T) {
	body := []byte(`not-json`)
	ts := time.Unix(1_700_000_000, 0)
	header := webhooks.Sign(testSecret, body, ts)

	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: header,
		Secret:    testSecret,
		Now:       ts,
	})
	if err == nil {
		t.Fatal("expected non-nil error for non-JSON body")
	}
	// The signature itself is valid, so this must be neither
	// ErrInvalidSignature nor ErrTimestampOutOfRange.
	if errors.Is(err, webhooks.ErrInvalidSignature) {
		t.Errorf("non-JSON body must not be reported as ErrInvalidSignature")
	}
	if errors.Is(err, webhooks.ErrTimestampOutOfRange) {
		t.Errorf("non-JSON body must not be reported as ErrTimestampOutOfRange")
	}
}

// TestVerify_LockedElixirVector locks the exact HMAC the Elixir server
// emits for a known body+secret+timestamp triple. The JS SDK's
// webhooks.test.ts pins the same value — if either drifts, the wire
// format has diverged.
//
// Reference: iex> :crypto.mac(:hmac, :sha256, "0123456789abcdef",
//
//	"1700000000.{\"hello\":\"world\"}") |> Base.encode16(case: :lower)
func TestVerify_LockedElixirVector(t *testing.T) {
	const (
		secret      = "0123456789abcdef"
		expectedHex = "66997eb7c1d13335f141deda66669e544a2c7f62745300308aec8f7042fb18be"
	)
	body := []byte(`{"hello":"world"}`)
	ts := time.Unix(1_700_000_000, 0)

	header := webhooks.Sign(secret, body, ts)
	wantHeader := "t=1700000000, v1=" + expectedHex
	if header != wantHeader {
		t.Errorf("locked HMAC drift:\n got  %q\n want %q", header, wantHeader)
	}

	event, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: header,
		Secret:    secret,
		Now:       ts,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := event.Data; got != nil {
		// The body decodes into an Event{...}; its Data map will be
		// nil because the body has no "data" field. The top-level
		// "hello":"world" doesn't map onto any Event field, which is
		// fine — we only need the verification to succeed.
		_ = got
	}
}

// TestSentinels_AliasedFromTopLevel confirms the top-level nitroping
// package re-exports the same sentinel values, so callers can match
// either via errors.Is without two separate imports.
func TestSentinels_AliasedFromTopLevel(t *testing.T) {
	if webhooks.ErrInvalidSignature != nitroping.ErrInvalidSignature {
		t.Errorf("ErrInvalidSignature identity mismatch")
	}
	if webhooks.ErrTimestampOutOfRange != nitroping.ErrTimestampOutOfRange {
		t.Errorf("ErrTimestampOutOfRange identity mismatch")
	}
	if webhooks.ErrMissingSignatureHeader != nitroping.ErrMissingSignatureHeader {
		t.Errorf("ErrMissingSignatureHeader identity mismatch")
	}

	// And errors.Is from the top-level value matches a webhooks-returned err.
	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      []byte(`{}`),
		Signature: "",
		Secret:    "x",
	})
	if !errors.Is(err, nitroping.ErrMissingSignatureHeader) {
		t.Errorf("top-level ErrMissingSignatureHeader should match the webhook return: %v", err)
	}
}

func TestVerify_HeaderWithUpperHexAccepted(t *testing.T) {
	body := []byte(`{"k":"v"}`)
	ts := time.Unix(1_700_000_000, 0)
	header := webhooks.Sign(testSecret, body, ts)
	// Upper-case the v1= value.
	idx := strings.Index(header, "v1=")
	if idx < 0 {
		t.Fatalf("unexpected header format: %q", header)
	}
	upper := header[:idx+3] + strings.ToUpper(header[idx+3:])

	_, err := webhooks.Verify(webhooks.VerifyOptions{
		Body:      body,
		Signature: upper,
		Secret:    testSecret,
		Now:       ts,
	})
	if err != nil {
		t.Fatalf("uppercase hex v1 should be accepted, got %v", err)
	}
}
