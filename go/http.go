package nitroping

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Version is the SDK's released version string. The Go module is
// versioned via git tags (there is no manifest file to read at build
// time), so this constant is the single source of truth for the
// User-Agent. Bump it in lockstep with each tagged release.
const Version = "0.2.8"

// defaultUserAgent is appended to every outbound request so server-side
// logs can distinguish SDK traffic from raw curl/Postman. Tracks
// `userAgent` in the JS SDK's http.ts.
const defaultUserAgent = "nitroping-go/" + Version

// transport is the package-internal HTTP layer shared by the
// notifications and devices resources. It owns the base URL, the API
// key, the http.Client implementation and the User-Agent. All resource
// methods route through transport.do so behaviour (auth, content-type,
// error envelope parsing) lives in one place.
type transport struct {
	baseURL    string
	apiKey     string
	authScheme string
	userAgent  string
	httpClient *http.Client
}

// do issues an HTTP request to the nitroping API and decodes the JSON
// response into `out`. Non-2xx responses with a recognisable
// `{"error": {...}}` envelope are decoded into *APIError; transport-
// level failures (DNS, TLS, timeout, request cancellation) are wrapped
// with %w so callers can errors.Is them against context.Canceled etc.
//
// `out` may be nil if the caller doesn't care about the body (e.g.
// success-only 200 OK ack). When out is non-nil the response body must
// be valid JSON or a wrapping error is returned.
func (t *transport) do(
	ctx context.Context,
	method, path string,
	body any,
	cfg requestConfig,
	out any,
) error {
	endpoint, err := t.buildURL(path)
	if err != nil {
		return fmt.Errorf("nitroping: invalid URL %q: %w", path, err)
	}

	var reqBody io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("nitroping: marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, reqBody)
	if err != nil {
		return fmt.Errorf("nitroping: build request: %w", err)
	}

	req.Header.Set("Authorization", t.authScheme+" "+t.apiKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if t.userAgent != "" {
		req.Header.Set("User-Agent", t.userAgent)
	}
	if cfg.idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", cfg.idempotencyKey)
	}
	for k, v := range cfg.extraHeaders {
		// Don't let WithHeader override the auth / content-type /
		// accept headers we just set — those are integral to the
		// protocol.
		switch http.CanonicalHeaderKey(k) {
		case "Authorization", "Content-Type", "Accept", "User-Agent":
			continue
		}
		req.Header.Set(k, v)
	}

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("nitroping: %s %s: %w", method, endpoint, err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("nitroping: read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return decodeAPIError(resp.StatusCode, respBytes)
	}

	if out == nil || len(respBytes) == 0 {
		return nil
	}
	if err := json.Unmarshal(respBytes, out); err != nil {
		return fmt.Errorf("nitroping: decode response body: %w", err)
	}
	return nil
}

// buildURL resolves `path` against the configured base URL. The base
// URL has had any trailing slashes stripped at client construction so
// we just glue with "/".
func (t *transport) buildURL(path string) (string, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	full := t.baseURL + path
	// Validate the result; this catches stray spaces and bogus base
	// URLs early with a clear error.
	if _, err := url.Parse(full); err != nil {
		return "", err
	}
	return full, nil
}

// errorEnvelope mirrors the server's JSON error shape:
//
//	{"error": {"code": "...", "message": "...", "details": {...}}}
//
// `Details` is decoded into a generic map so callers can introspect
// per-field validation errors without a typed struct per error code.
type errorEnvelope struct {
	Error struct {
		Code    string         `json:"code"`
		Message string         `json:"message"`
		Details map[string]any `json:"details"`
	} `json:"error"`
}

// decodeAPIError turns a non-2xx response into a *APIError. It is
// tolerant: a missing envelope, bad JSON, or empty body all fall back
// to a synthetic message + a code of `http_<status>` so callers always
// get structured information they can branch on.
func decodeAPIError(status int, body []byte) error {
	apiErr := &APIError{StatusCode: status}

	if len(body) > 0 {
		var env errorEnvelope
		if err := json.Unmarshal(body, &env); err == nil && (env.Error.Code != "" || env.Error.Message != "") {
			apiErr.Code = env.Error.Code
			apiErr.Message = env.Error.Message
			apiErr.Details = env.Error.Details
		} else {
			// No structured envelope — include the raw body (truncated)
			// in the message so debugging isn't impossible.
			trimmed := body
			if len(trimmed) > 256 {
				trimmed = trimmed[:256]
			}
			apiErr.Message = strings.TrimSpace(string(trimmed))
		}
	}

	if apiErr.Code == "" {
		apiErr.Code = fmt.Sprintf("http_%d", status)
	}
	if apiErr.Message == "" {
		apiErr.Message = http.StatusText(status)
	}
	return apiErr
}

// sanityCheckBaseURL guards against the most common config mistake:
// passing a non-http(s) URL. Returns the trimmed URL or an error.
func sanityCheckBaseURL(raw string) (string, error) {
	trimmed := strings.TrimRight(raw, "/")
	if trimmed == "" {
		return "", errors.New("baseURL cannot be empty")
	}
	u, err := url.Parse(trimmed)
	if err != nil {
		return "", err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("baseURL scheme must be http or https, got %q", u.Scheme)
	}
	if u.Host == "" {
		return "", errors.New("baseURL must include a host")
	}
	return trimmed, nil
}
