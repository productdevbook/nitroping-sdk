package nitroping

import (
	"encoding/json"
	"log"
)

// WithDebug returns a debug logger that simply forwards each event map
// to logger. Assign the result to ClientOptions.Debug to enable opt-in
// request/response/error logging. The Authorization header and API key
// are always redacted before the event reaches logger.
//
//	client, _ := nitroping.NewClient(nitroping.ClientOptions{
//	    APIKey: key,
//	    Debug:  nitroping.WithDebug(func(e map[string]any) { fmt.Println(e) }),
//	})
func WithDebug(logger func(event map[string]any)) func(event map[string]any) {
	return logger
}

// WithDebugLogging returns a debug logger backed by the standard
// library's log package: each event is JSON-encoded and written with
// log.Printf under a "nitroping debug:" prefix. Assign the result to
// ClientOptions.Debug.
func WithDebugLogging() func(event map[string]any) {
	return func(event map[string]any) {
		buf, err := json.Marshal(event)
		if err != nil {
			log.Printf("nitroping debug: %v", event)
			return
		}
		log.Printf("nitroping debug: %s", buf)
	}
}

// RequestOption customises a single API call. Returned by helpers like
// WithIdempotencyKey and passed as a trailing variadic argument to the
// resource methods.
//
// The option pattern keeps the common-case method signature (input,
// ctx) clean while still allowing per-call overrides such as the
// Idempotency-Key header or future per-call request modifiers.
type RequestOption func(*requestConfig)

// requestConfig is the internal aggregate of per-call overrides. It is
// not exposed; callers compose it indirectly through RequestOption
// constructors.
type requestConfig struct {
	idempotencyKey string
	extraHeaders   map[string]string
}

// apply runs every option against a fresh requestConfig and returns
// the result. Used by resource methods just before they hand off to
// the HTTP transport.
func applyOptions(opts []RequestOption) requestConfig {
	cfg := requestConfig{}
	for _, opt := range opts {
		if opt == nil {
			continue
		}
		opt(&cfg)
	}
	return cfg
}

// WithIdempotencyKey attaches an `Idempotency-Key` header to the
// request. If the same key + the same body is sent again the server
// replays the cached response; same key + different body returns 409
// with code "idempotency_conflict".
//
// Pick something stable + unique for the logical operation, e.g.
// "order-shipped-4129". Max 255 characters.
func WithIdempotencyKey(key string) RequestOption {
	return func(c *requestConfig) {
		c.idempotencyKey = key
	}
}

// WithHeader appends an arbitrary HTTP header to the request. Last
// writer wins for duplicates within a single call; client-level
// headers (Authorization, User-Agent, Content-Type, Accept) cannot be
// overridden via this option.
func WithHeader(name, value string) RequestOption {
	return func(c *requestConfig) {
		if c.extraHeaders == nil {
			c.extraHeaders = map[string]string{}
		}
		c.extraHeaders[name] = value
	}
}
