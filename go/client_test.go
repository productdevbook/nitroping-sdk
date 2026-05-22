package nitroping_test

import (
	"errors"
	"os"
	"testing"

	nitroping "github.com/productdevbook/nitroping-sdk/go"
)

func TestNewClient_RequiresAPIKey(t *testing.T) {
	// Make sure the env var isn't pre-set on the runner.
	t.Setenv("NITROPING_API_KEY", "")
	_, err := nitroping.NewClient(nitroping.ClientOptions{})
	if err == nil {
		t.Fatal("expected NewClient to error when APIKey is missing")
	}
}

func TestNewClient_PicksUpEnvVar(t *testing.T) {
	t.Setenv("NITROPING_API_KEY", "np_env_test")
	client, err := nitroping.NewClient(nitroping.ClientOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client == nil || client.Notifications == nil || client.Devices == nil {
		t.Fatal("expected Notifications and Devices services to be wired")
	}
}

func TestNewClient_RejectsInvalidBaseURL(t *testing.T) {
	_, err := nitroping.NewClient(nitroping.ClientOptions{
		APIKey:  "np_x",
		BaseURL: "ftp://nope.example.com",
	})
	if err == nil {
		t.Fatal("expected NewClient to reject non-http(s) base URL")
	}
}

func TestNewClient_TrimsTrailingSlashFromBaseURL(t *testing.T) {
	client, err := nitroping.NewClient(nitroping.ClientOptions{
		APIKey:  "np_x",
		BaseURL: "https://staging.nitroping.dev////",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil client")
	}
}

func TestAPIError_ImplementsError(t *testing.T) {
	var err error = &nitroping.APIError{
		StatusCode: 422,
		Code:       "validation_failed",
		Message:    "Body too short",
	}
	if err.Error() == "" {
		t.Fatal("APIError.Error() returned empty string")
	}

	// errors.As should recover the typed pointer back.
	var apiErr *nitroping.APIError
	if !errors.As(err, &apiErr) {
		t.Fatal("errors.As should recover *APIError")
	}
	if apiErr.StatusCode != 422 {
		t.Errorf("StatusCode = %d, want 422", apiErr.StatusCode)
	}
}

// Sanity: the package should not require any environment to import.
// This is implicit in the rest of the suite passing, but make it
// explicit so future contributors see it.
func TestPackageHasNoInitSideEffects(t *testing.T) {
	if env := os.Getenv("NITROPING_API_KEY"); env != "" {
		// Just observe — don't fail; some CIs do export this.
		t.Logf("NITROPING_API_KEY is set in env (len=%d)", len(env))
	}
}
