// Package nitroping is the official Go SDK for the nitroping push
// notification service at https://nitroping.dev.
//
// Errors returned by every public function in this package are either
// one of the exported sentinel values (see ErrInvalidSignature,
// ErrTimestampOutOfRange, ErrMissingSignatureHeader — all surfaced from
// the webhooks subpackage) or a *APIError carrying the server's
// structured error envelope. Use errors.Is for sentinel matching and
// errors.As to recover the typed API error:
//
//	var apiErr *nitroping.APIError
//	if errors.As(err, &apiErr) {
//	    log.Printf("status=%d code=%s: %s", apiErr.StatusCode, apiErr.Code, apiErr.Message)
//	}
package nitroping

import (
	"fmt"

	"github.com/productdevbook/nitroping-sdk/go/webhooks"
)

// APIError is returned by every Client method when the nitroping API
// responds with a non-2xx status. It mirrors the server's
// `{"error": {"code", "message", "details"}}` envelope, preserving the
// HTTP status code so callers can branch on it.
type APIError struct {
	// StatusCode is the HTTP status of the failed response.
	StatusCode int
	// Code is the server's stable, machine-readable error code, e.g.
	// "validation_failed", "not_found", "quota_exceeded". Falls back to
	// `http_<status>` when the server didn't supply one.
	Code string
	// Message is the human-readable message from the server envelope.
	Message string
	// Details carries per-field validation errors and other free-form
	// payloads from the server. Nil when the envelope had no details.
	Details map[string]any
}

// Error implements the error interface. It returns a compact one-line
// description suitable for logs; structured fields are still accessible
// via the exported fields.
func (e *APIError) Error() string {
	if e == nil {
		return "<nil *nitroping.APIError>"
	}
	if e.Code != "" {
		return fmt.Sprintf("nitroping: HTTP %d %s: %s", e.StatusCode, e.Code, e.Message)
	}
	return fmt.Sprintf("nitroping: HTTP %d: %s", e.StatusCode, e.Message)
}

// Sentinel errors re-exported from the webhooks subpackage.
//
// These are the same error values returned by webhooks.Verify — they
// are aliased here so callers that already import the top-level
// nitroping package can match on them with errors.Is without taking
// a second import on the webhooks subpackage.
var (
	// ErrInvalidSignature is returned by webhooks.Verify when the
	// computed HMAC does not match the v1=<hex> value in the
	// X-Nitroping-Signature header, or when the header is malformed.
	ErrInvalidSignature = webhooks.ErrInvalidSignature

	// ErrTimestampOutOfRange is returned by webhooks.Verify when the
	// signature is well-formed and matches the body, but the t=<unix>
	// timestamp is outside the tolerance window. Defends against
	// signature replay.
	ErrTimestampOutOfRange = webhooks.ErrTimestampOutOfRange

	// ErrMissingSignatureHeader is returned by webhooks.Verify when the
	// X-Nitroping-Signature header is absent or empty.
	ErrMissingSignatureHeader = webhooks.ErrMissingSignatureHeader
)
