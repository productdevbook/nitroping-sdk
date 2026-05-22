//
//  Signature.swift
//  Nitroping
//
//  Internal HMAC-SHA256 helper. CryptoKit is a system framework on Apple
//  platforms; on Linux we depend on `Crypto` only when the package is
//  built there — but we keep nitroping-swift dependency-free, so the Linux
//  path uses `CommonCrypto` if available or falls back to a tiny pure-Swift
//  HMAC-SHA256. iOS/macOS users always get CryptoKit.
//

import Foundation
#if canImport(CryptoKit)
import CryptoKit
#endif

enum SignatureUtil {
    /// HMAC-SHA256 → lowercase hex.
    static func hmacSHA256Hex(message: String, secret: String) -> String {
        let messageData = Data(message.utf8)
        let secretData = Data(secret.utf8)
        let mac = hmac(message: messageData, secret: secretData)
        return mac.map { String(format: "%02x", $0) }.joined()
    }

    /// Constant-time comparison. Both strings must be the same length;
    /// returns false on length mismatch without short-circuiting on content.
    static func constantTimeEqual(_ a: String, _ b: String) -> Bool {
        let lhs = Array(a.utf8)
        let rhs = Array(b.utf8)
        guard lhs.count == rhs.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<lhs.count {
            diff |= lhs[i] ^ rhs[i]
        }
        return diff == 0
    }

    // MARK: - HMAC dispatch

    #if canImport(CryptoKit)
    private static func hmac(message: Data, secret: Data) -> Data {
        let key = SymmetricKey(data: secret)
        let mac = HMAC<SHA256>.authenticationCode(for: message, using: key)
        return Data(mac)
    }
    #else
    private static func hmac(message: Data, secret: Data) -> Data {
        // Pure-Swift HMAC-SHA256, used only on platforms where CryptoKit
        // isn't available (open-source Swift on a weird target).
        return HMACSHA256.compute(key: secret, message: message)
    }
    #endif
}

#if !canImport(CryptoKit)
/// Tiny pure-Swift HMAC-SHA256. Reference implementation, not optimised —
/// fine for webhook verification frequency (handful per second).
private enum HMACSHA256 {
    static func compute(key: Data, message: Data) -> Data {
        let blockSize = 64
        var k = [UInt8](key)
        if k.count > blockSize { k = [UInt8](SHA256.hash(Data(k))) }
        if k.count < blockSize { k.append(contentsOf: [UInt8](repeating: 0, count: blockSize - k.count)) }
        let oKeyPad = k.map { $0 ^ 0x5c }
        let iKeyPad = k.map { $0 ^ 0x36 }
        var inner = Data(iKeyPad); inner.append(message)
        let innerHash = SHA256.hash(inner)
        var outer = Data(oKeyPad); outer.append(Data(innerHash))
        return Data(SHA256.hash(outer))
    }
}

private enum SHA256 {
    static func hash(_ data: Data) -> [UInt8] {
        var m = [UInt8](data)
        let bitLen = UInt64(m.count) * 8
        m.append(0x80)
        while m.count % 64 != 56 { m.append(0) }
        for i in (0..<8).reversed() { m.append(UInt8((bitLen >> (UInt64(i) * 8)) & 0xff)) }
        var h: [UInt32] = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ]
        let k: [UInt32] = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ]
        var i = 0
        while i < m.count {
            var w = [UInt32](repeating: 0, count: 64)
            for j in 0..<16 {
                let o = i + j * 4
                w[j] = (UInt32(m[o]) << 24) | (UInt32(m[o+1]) << 16) | (UInt32(m[o+2]) << 8) | UInt32(m[o+3])
            }
            for j in 16..<64 {
                let s0 = rotr(w[j-15], 7) ^ rotr(w[j-15], 18) ^ (w[j-15] >> 3)
                let s1 = rotr(w[j-2], 17) ^ rotr(w[j-2], 19) ^ (w[j-2] >> 10)
                w[j] = w[j-16] &+ s0 &+ w[j-7] &+ s1
            }
            var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
            for j in 0..<64 {
                let S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
                let ch = (e & f) ^ (~e & g)
                let t1 = hh &+ S1 &+ ch &+ k[j] &+ w[j]
                let S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
                let mj = (a & b) ^ (a & c) ^ (b & c)
                let t2 = S0 &+ mj
                hh = g; g = f; f = e; e = d &+ t1
                d = c; c = b; b = a; a = t1 &+ t2
            }
            h[0] &+= a; h[1] &+= b; h[2] &+= c; h[3] &+= d
            h[4] &+= e; h[5] &+= f; h[6] &+= g; h[7] &+= hh
            i += 64
        }
        var out = [UInt8]()
        for v in h {
            out.append(UInt8((v >> 24) & 0xff))
            out.append(UInt8((v >> 16) & 0xff))
            out.append(UInt8((v >> 8) & 0xff))
            out.append(UInt8(v & 0xff))
        }
        return out
    }
    private static func rotr(_ x: UInt32, _ n: UInt32) -> UInt32 {
        return (x >> n) | (x << (32 - n))
    }
}
#endif
