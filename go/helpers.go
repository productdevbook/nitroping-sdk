package nitroping

// String returns a pointer to v. Convenience for filling optional
// *string fields on SendRequest, DeviceRequest, etc. inline without a
// named temporary.
//
//	req := nitroping.SendRequest{
//	    Title:    "Hi",
//	    DeepLink: nitroping.String("https://example.com"),
//	    Target:   nitroping.AllDevices(),
//	}
func String(v string) *string { return &v }

// Int returns a pointer to v. Counterpart to String for optional *int
// fields. Nothing in the current API surface uses *int yet, but the
// helper is exposed for forward-compat with future fields and is a
// common idiom in Go SDKs.
func Int(v int) *int { return &v }

// Bool returns a pointer to v. Same idiom as String/Int for *bool
// fields.
func Bool(v bool) *bool { return &v }
