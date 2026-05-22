// Package webhooks verifies outbound webhook signatures emitted by the
// nitroping server.
//
// Every outbound webhook is signed with HMAC-SHA256 and the result is
// shipped in the X-Nitroping-Signature header. The format mirrors
// Polar / Stripe:
//
//	X-Nitroping-Signature: t=<unix>, v1=<hex>
//
// where v1 = hex(HMAC_SHA256(secret, fmt.Sprintf("%d.%s", t, body))).
// The signed string is "<unix-timestamp>.<raw body>" — concatenated
// with a literal dot. Re-serialising parsed JSON before verifying will
// not match because whitespace and key order change the bytes.
//
// Verify is the canonical entry point. Sign exists primarily so tests
// in downstream code can produce deterministic fixtures; production
// code relies on the server.
package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// DefaultTolerance is the default maximum drift between the signed
// timestamp and the verifier's clock. Five minutes mirrors Polar /
// Stripe and is the value used by the Elixir server when computing
// the header.
const DefaultTolerance = 5 * time.Minute

// SignatureHeader is the canonical name of the HTTP header that
// carries the signature. Re-exported as a convenience so callers
// don't have to copy-paste the magic string.
const SignatureHeader = "X-Nitroping-Signature"

// Sentinel errors returned by Verify. Use errors.Is to match.
//
// These are the same values re-exported from the top-level nitroping
// package as ErrInvalidSignature, ErrTimestampOutOfRange,
// ErrMissingSignatureHeader; we keep two copies because Go's stdlib
// doesn't have a clean way to alias error sentinels across packages
// while preserving errors.Is identity. The top-level package wraps
// these via fmt.Errorf("%w", ...) at the call site if/when required.
var (
	// ErrInvalidSignature is returned when the computed HMAC does not
	// match the v1=<hex> value in the header, or when the header is
	// malformed (missing t=, non-hex v1, etc).
	ErrInvalidSignature = errors.New("nitroping/webhooks: invalid signature")

	// ErrTimestampOutOfRange is returned when the signature is
	// well-formed and the HMAC matches the body, but the t=<unix>
	// timestamp is outside the tolerance window.
	ErrTimestampOutOfRange = errors.New("nitroping/webhooks: timestamp out of tolerance")

	// ErrMissingSignatureHeader is returned when the
	// X-Nitroping-Signature header is absent or empty.
	ErrMissingSignatureHeader = errors.New("nitroping/webhooks: missing X-Nitroping-Signature header")
)

// Event is the parsed webhook payload. The fields mirror the JSON
// envelope built in `Nitroping.Webhooks.Outbound.dispatch/3` on the
// server.
type Event struct {
	// ID is the event id, prefixed with `evt_`.
	ID string `json:"id"`
	// Type is the event type, e.g. "notification.delivered",
	// "notification.failed", "webhook.test".
	Type string `json:"type"`
	// CreatedAt is the ISO-8601 timestamp set when the event was
	// queued for outbound delivery.
	CreatedAt string `json:"created_at"`
	// Data is the event-specific payload. Decode further by keying
	// into the map or by re-marshalling and unmarshalling into a typed
	// struct.
	Data map[string]any `json:"data"`
}

// VerifyOptions is the input to Verify. Body and Signature are
// required; Tolerance and Now have sensible defaults.
type VerifyOptions struct {
	// Body is the raw request body bytes, exactly as received. Do not
	// re-serialise a parsed JSON object — whitespace and key order
	// matter to the HMAC.
	Body []byte
	// Signature is the X-Nitroping-Signature header value. Empty
	// string is treated as ErrMissingSignatureHeader.
	Signature string
	// Secret is the webhook signing secret from the app panel.
	Secret string
	// Tolerance is the maximum allowed drift between the signed
	// timestamp and Now. Zero means use DefaultTolerance.
	Tolerance time.Duration
	// Now overrides the verifier's wall clock. Zero means time.Now().
	// Useful for tests and for replaying saved requests during
	// incident investigation.
	Now time.Time
}

// Verify checks the signature header against the body + secret and
// returns the decoded Event on success.
//
// Failure modes (use errors.Is):
//
//   - ErrMissingSignatureHeader: Signature was empty
//   - ErrInvalidSignature:       header malformed OR HMAC mismatch
//   - ErrTimestampOutOfRange:    HMAC matches but t= is outside tolerance
//
// A body that isn't valid JSON returns a generic wrapping error (still
// a hard failure — don't trust a signed-but-unparseable payload).
func Verify(opts VerifyOptions) (*Event, error) {
	if opts.Signature == "" {
		return nil, ErrMissingSignatureHeader
	}

	parsed, ok := parseSignatureHeader(opts.Signature)
	if !ok {
		return nil, ErrInvalidSignature
	}

	expected := computeHMAC(opts.Secret, parsed.t, opts.Body)
	provided, err := hex.DecodeString(parsed.v1)
	if err != nil {
		return nil, ErrInvalidSignature
	}
	if subtle.ConstantTimeCompare(expected, provided) != 1 {
		return nil, ErrInvalidSignature
	}

	tolerance := opts.Tolerance
	if tolerance == 0 {
		tolerance = DefaultTolerance
	}
	now := opts.Now
	if now.IsZero() {
		now = time.Now()
	}
	drift := now.Unix() - parsed.t
	if drift < 0 {
		drift = -drift
	}
	if time.Duration(drift)*time.Second > tolerance {
		return nil, ErrTimestampOutOfRange
	}

	var event Event
	if err := json.Unmarshal(opts.Body, &event); err != nil {
		return nil, fmt.Errorf("nitroping/webhooks: body is not valid JSON: %w", err)
	}
	return &event, nil
}

// Sign computes the canonical "t=<unix>, v1=<hex>" header value for
// the given body. Exposed primarily for tests and reproduction of
// signed payloads. timestamp.IsZero() falls back to time.Now().
func Sign(secret string, body []byte, timestamp time.Time) string {
	if timestamp.IsZero() {
		timestamp = time.Now()
	}
	t := timestamp.Unix()
	mac := computeHMAC(secret, t, body)
	return fmt.Sprintf("t=%d, v1=%s", t, hex.EncodeToString(mac))
}

// signatureParts captures the parsed `t=<unix>, v1=<hex>` pair.
type signatureParts struct {
	t  int64
	v1 string // lowercase hex
}

// parseSignatureHeader is tolerant: it splits on "," and matches by
// key, so extra whitespace and field reordering are both accepted.
// Returns (zero, false) when either field is missing or syntactically
// invalid.
func parseSignatureHeader(header string) (signatureParts, bool) {
	var out signatureParts
	var sawT, sawV1 bool

	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		eq := strings.IndexByte(part, '=')
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(part[:eq])
		value := strings.TrimSpace(part[eq+1:])
		switch key {
		case "t":
			n, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				return signatureParts{}, false
			}
			out.t = n
			sawT = true
		case "v1":
			if !isLowerHex(value) {
				// The JS SDK lowercases before comparing. Accept upper
				// case here for forward compat by normalising.
				if !isHex(value) {
					return signatureParts{}, false
				}
				value = strings.ToLower(value)
			}
			out.v1 = value
			sawV1 = true
		}
	}

	if !sawT || !sawV1 {
		return signatureParts{}, false
	}
	return out, true
}

// computeHMAC builds the signed-string ("<t>.<body>") and returns the
// raw HMAC-SHA256 output. Working with raw bytes (rather than the hex
// string) keeps the constant-time comparison straightforward.
func computeHMAC(secret string, t int64, body []byte) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	// Pre-allocate the prefix to avoid one-byte allocs on tiny bodies.
	prefix := strconv.FormatInt(t, 10) + "."
	mac.Write([]byte(prefix))
	mac.Write(body)
	return mac.Sum(nil)
}

func isLowerHex(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if !(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

func isHex(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
		default:
			return false
		}
	}
	return true
}
