//
//  NitropingError.swift
//  Nitroping
//

import Foundation

/// All errors thrown from the Nitroping SDK funnel through this enum so
/// callers can pattern-match a single type at the call site.
public enum NitropingError: Error, Equatable, Sendable {
    /// Local validation failed before the request was sent (empty token,
    /// missing required field, etc.). Carries a human-readable reason.
    case validation(String)

    /// HTTP request never reached the server (DNS failure, connection
    /// refused, timeout). The wrapped value is the underlying URLError code
    /// or a free-form description.
    case transport(String)

    /// `Authorization` was rejected by the server (HTTP 401). Almost always
    /// a bad / revoked API key.
    case unauthorized(message: String)

    /// API key was valid but the key's plan / app doesn't permit the action
    /// (HTTP 402, 403). E.g. "templates require Pro plan".
    case forbidden(message: String, code: String?)

    /// Resource not found (HTTP 404). E.g. notification id from an old
    /// payload that's been hard-deleted.
    case notFound(message: String)

    /// Server-side validation failed (HTTP 422). `details` is the
    /// changeset/field-errors map the API returns.
    case validationFailed(message: String, details: [String: [String]]?)

    /// Quota exceeded (HTTP 429 with code `quota_exceeded`) or per-key /
    /// per-IP rate limited (429 without a quota envelope).
    case rateLimited(message: String, retryAfter: TimeInterval?)

    /// Catch-all for any other non-2xx response. Carries the raw status code
    /// + server-supplied envelope so callers can log it without losing info.
    case server(status: Int, code: String?, message: String)

    /// Response body wasn't valid JSON or didn't match the expected shape.
    /// Almost always a sign of an SDK / server-version mismatch.
    case decoding(String)

    // ── Webhook verification cases ──────────────────────────────────────

    /// `X-Nitroping-Signature` header was missing or malformed.
    case missingSignature

    /// Header had the right shape (`t=...,v1=...`) but the v1 HMAC didn't
    /// match a re-computation over the raw body. Treat as tampering.
    case invalidSignature

    /// Header's `t=` was older / newer than the `tolerance` window. Default
    /// tolerance is 5 minutes; widen on slow networks if needed.
    case timestampOutOfRange(skew: TimeInterval, tolerance: TimeInterval)
}

extension NitropingError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .validation(let m): return "Nitroping validation: \(m)"
        case .transport(let m): return "Nitroping transport: \(m)"
        case .unauthorized(let m): return "Nitroping unauthorized: \(m)"
        case .forbidden(let m, _): return "Nitroping forbidden: \(m)"
        case .notFound(let m): return "Nitroping not found: \(m)"
        case .validationFailed(let m, _): return "Nitroping validation failed: \(m)"
        case .rateLimited(let m, _): return "Nitroping rate limited: \(m)"
        case .server(let s, _, let m): return "Nitroping server \(s): \(m)"
        case .decoding(let m): return "Nitroping decoding: \(m)"
        case .missingSignature: return "Nitroping webhook signature missing or malformed"
        case .invalidSignature: return "Nitroping webhook signature mismatch"
        case .timestampOutOfRange(let skew, let tol):
            return "Nitroping webhook timestamp skew \(Int(skew))s exceeds tolerance \(Int(tol))s"
        }
    }
}
