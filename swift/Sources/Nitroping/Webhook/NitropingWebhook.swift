//
//  NitropingWebhook.swift
//  Nitroping
//
//  Verify the `X-Nitroping-Signature` header on inbound webhooks.
//
//  Wire format (mirrors Stripe / Polar):
//
//      X-Nitroping-Signature: t=<unix>, v1=<hex>
//
//  Where `v1 = HMAC-SHA256(t + "." + raw_body, webhook_secret)`.
//

import Foundation

/// Wraps webhook verification + the decoded event envelope.
public enum NitropingWebhook {
    /// Default time tolerance for the `t=` value (in seconds). Matches the
    /// dashboard's documented default; widen if your handler runs behind a
    /// slow queue and the timestamp skew is legitimate.
    public static let defaultTolerance: TimeInterval = 300

    /// Verify a raw webhook body + signature header and return the decoded
    /// event. Throws `NitropingError` on any failure (missing header,
    /// signature mismatch, timestamp out of range, JSON decode error).
    ///
    /// - Parameters:
    ///   - body: raw request body bytes — must be the **exact** bytes the
    ///           sender signed (no JSON re-encoding).
    ///   - signature: contents of the `X-Nitroping-Signature` header.
    ///   - secret: app's webhook secret (from the Webhooks tab in the panel).
    ///   - tolerance: max acceptable skew between `t=` and now, in seconds.
    ///   - now: clock override; production callers leave this at `.init()`.
    public static func verify(
        body: Data,
        signature: String?,
        secret: String,
        tolerance: TimeInterval = defaultTolerance,
        now: Date = Date()
    ) throws -> NitropingEvent {
        guard let raw = signature, !raw.isEmpty else {
            throw NitropingError.missingSignature
        }
        let parsed = try parseSignatureHeader(raw)

        // Timestamp tolerance check first — cheap, and short-circuits the
        // HMAC computation on stale events.
        let skew = abs(now.timeIntervalSince1970 - TimeInterval(parsed.timestamp))
        if skew > tolerance {
            throw NitropingError.timestampOutOfRange(skew: skew, tolerance: tolerance)
        }

        guard let bodyString = String(data: body, encoding: .utf8) else {
            throw NitropingError.decoding("Webhook body is not valid UTF-8")
        }
        let signedPayload = "\(parsed.timestamp).\(bodyString)"
        let expected = SignatureUtil.hmacSHA256Hex(message: signedPayload, secret: secret)

        guard SignatureUtil.constantTimeEqual(expected, parsed.v1) else {
            throw NitropingError.invalidSignature
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            return try decoder.decode(NitropingEvent.self, from: body)
        } catch {
            throw NitropingError.decoding("Failed to decode webhook event: \(error)")
        }
    }

    // MARK: - Header parsing

    struct ParsedSignature {
        let timestamp: Int64
        let v1: String
    }

    static func parseSignatureHeader(_ header: String) throws -> ParsedSignature {
        // Tokens are comma-separated; whitespace around them is allowed.
        var timestamp: Int64?
        var v1: String?
        for rawToken in header.split(separator: ",") {
            let token = rawToken.trimmingCharacters(in: .whitespaces)
            guard let eq = token.firstIndex(of: "=") else { continue }
            let key = String(token[..<eq])
            let value = String(token[token.index(after: eq)...])
            switch key {
            case "t":
                timestamp = Int64(value)
            case "v1":
                v1 = value
            default:
                continue
            }
        }
        guard let timestamp, let v1, !v1.isEmpty else {
            throw NitropingError.missingSignature
        }
        return ParsedSignature(timestamp: timestamp, v1: v1)
    }
}

// MARK: - Event model

/// Decoded webhook event envelope.
///
/// The server's outbound webhook shape:
///
///     {
///       "id": "evt_...",
///       "type": "notification.delivered" | "notification.failed" |
///               "notification.opened" | "notification.clicked" |
///               "webhook.test",
///       "created_at": "2026-...",
///       "data": { ... }
///     }
public struct NitropingEvent: Decodable, Equatable, Sendable {
    /// Server-side event id (`evt_...`). Unique per delivery; safe to use
    /// as your idempotency key on the receiver side.
    public let id: String

    /// Event type. Stable string keys (see `Kind` for the enum form).
    public let type: String

    /// When the event happened, server-side.
    public let createdAt: Date

    /// Event-specific payload. Surface the common fields as typed
    /// accessors; everything else is reachable through `extras`.
    public let data: EventData

    public struct EventData: Decodable, Equatable, Sendable {
        public let notificationId: String?
        public let deviceId: String?
        public let platform: String?
        public let userId: String?
        public let actionId: String?
        /// Raw JSON-Object representation of everything else under `data`.
        public let extras: [String: AnyJSONValue]

        // Decode known keys + roll up everything else into `extras`.
        enum CodingKeys: String, CodingKey {
            case notificationId = "notification_id"
            case deviceId = "device_id"
            case platform
            case userId = "user_id"
            case actionId = "action_id"
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            self.notificationId = try container.decodeIfPresent(String.self, forKey: .notificationId)
            self.deviceId = try container.decodeIfPresent(String.self, forKey: .deviceId)
            self.platform = try container.decodeIfPresent(String.self, forKey: .platform)
            self.userId = try container.decodeIfPresent(String.self, forKey: .userId)
            self.actionId = try container.decodeIfPresent(String.self, forKey: .actionId)
            // Re-open the container with a flexible key type to pull out
            // anything not in CodingKeys.
            let dyn = try decoder.container(keyedBy: AnyKey.self)
            let known: Set<String> = ["notification_id", "device_id", "platform", "user_id", "action_id"]
            var extras: [String: AnyJSONValue] = [:]
            for key in dyn.allKeys where !known.contains(key.stringValue) {
                extras[key.stringValue] = try dyn.decode(AnyJSONValue.self, forKey: key)
            }
            self.extras = extras
        }
    }

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case createdAt = "created_at"
        case data
    }

    /// Convenience enum for the documented event types. Unknown event
    /// strings round-trip through `.unknown(String)` so a new server type
    /// doesn't break existing handlers.
    public enum Kind: Equatable, Sendable {
        case delivered
        case failed
        case opened
        case clicked
        case test
        case unknown(String)

        public init(rawValue: String) {
            switch rawValue {
            case "notification.delivered": self = .delivered
            case "notification.failed": self = .failed
            case "notification.opened": self = .opened
            case "notification.clicked": self = .clicked
            case "webhook.test": self = .test
            default: self = .unknown(rawValue)
            }
        }
    }

    /// Typed view of `type`.
    public var kind: Kind { Kind(rawValue: type) }
}

// MARK: - JSON helpers

/// Single-key dynamic CodingKey for "any string key" decoding.
struct AnyKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

/// Sum type for arbitrary JSON values. Useful for surfacing `extras` from
/// a webhook event without forcing the caller into `[String: Any]`.
public enum AnyJSONValue: Decodable, Equatable, Sendable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([AnyJSONValue])
    case object([String: AnyJSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null; return }
        if let v = try? container.decode(Bool.self) { self = .bool(v); return }
        if let v = try? container.decode(Int.self) { self = .int(v); return }
        if let v = try? container.decode(Double.self) { self = .double(v); return }
        if let v = try? container.decode(String.self) { self = .string(v); return }
        if let v = try? container.decode([AnyJSONValue].self) { self = .array(v); return }
        if let v = try? container.decode([String: AnyJSONValue].self) { self = .object(v); return }
        self = .null
    }
}
