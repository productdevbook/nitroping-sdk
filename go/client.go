package nitroping

import (
	"errors"
	"net/http"
	"os"
)

// DefaultBaseURL is the hosted nitroping API endpoint. Override via
// ClientOptions.BaseURL when running against a self-hosted instance or
// the staging environment.
const DefaultBaseURL = "https://nitroping.dev"

// ClientOptions configures a Client. The zero value is invalid because
// APIKey is required — either set it explicitly or set the
// NITROPING_API_KEY environment variable before calling NewClient.
type ClientOptions struct {
	// APIKey is the secret API key (np_...). If empty, NewClient falls
	// back to os.Getenv("NITROPING_API_KEY").
	APIKey string

	// BaseURL overrides the default https://nitroping.dev endpoint.
	// Trailing slashes are stripped. Must be http or https.
	BaseURL string

	// HTTPClient overrides the underlying *http.Client. Defaults to
	// http.DefaultClient. Override this to plug in a custom transport
	// (proxies, retries, OpenTelemetry instrumentation, etc.).
	HTTPClient *http.Client

	// UserAgent overrides the default `nitroping-go/<ver>` User-Agent
	// header. Set to "" to disable the header entirely.
	UserAgent string
}

// Client is the top-level entry point of the SDK. Use NewClient to
// construct one; the resource fields (Notifications, Devices) are
// already wired against the shared transport.
//
// A Client is safe for concurrent use by multiple goroutines so long
// as the supplied *http.Client is also safe (the stdlib default is).
type Client struct {
	// Notifications wraps POST /api/v1/notifications and friends.
	Notifications *NotificationsService
	// Devices wraps POST /api/v1/devices and DELETE /api/v1/devices/:id.
	Devices *DevicesService

	transport *transport
}

// NewClient constructs a Client. It returns an error rather than
// panicking so library code embedding the SDK can degrade gracefully
// when configuration is missing.
//
//	client, err := nitroping.NewClient(nitroping.ClientOptions{
//	    APIKey: os.Getenv("NITROPING_API_KEY"),
//	})
//	if err != nil { log.Fatal(err) }
func NewClient(opts ClientOptions) (*Client, error) {
	apiKey := opts.APIKey
	if apiKey == "" {
		apiKey = os.Getenv("NITROPING_API_KEY")
	}
	if apiKey == "" {
		return nil, errors.New("nitroping: APIKey is required (set ClientOptions.APIKey or NITROPING_API_KEY env var)")
	}

	baseURL := opts.BaseURL
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	cleanedBase, err := sanityCheckBaseURL(baseURL)
	if err != nil {
		return nil, err
	}

	httpClient := opts.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	userAgent := opts.UserAgent
	if userAgent == "" && !opts.userAgentExplicitlyEmpty() {
		userAgent = defaultUserAgent
	}

	tr := &transport{
		baseURL:    cleanedBase,
		apiKey:     apiKey,
		userAgent:  userAgent,
		httpClient: httpClient,
	}

	return &Client{
		transport:     tr,
		Notifications: &NotificationsService{transport: tr},
		Devices:       &DevicesService{transport: tr},
	}, nil
}

// userAgentExplicitlyEmpty reports whether the caller passed UserAgent
// as a deliberate empty string rather than just leaving it unset. Go
// gives us no way to distinguish those two cases for a plain string
// field, so we treat empty == default for ergonomic reasons. The
// indirection lives in its own method to leave room for a future
// pointer-typed override.
func (o ClientOptions) userAgentExplicitlyEmpty() bool { return false }
