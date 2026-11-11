#!/usr/bin/env python3
"""
_ed25519_sign.py - DEV-ONLY pure-Python Ed25519 keygen + signing (RFC 8032).

THIS FILE IS NEVER SHIPPED OR IMPORTED BY THE SKILL AT SCAN TIME. It lives at
repo-root `scripts/` alongside the publish tooling (gen_rulepack_keys.py,
sign_rulepacks.py). The shipped skill contains only the verify-only counterpart
at skills/repo-forensics/scripts/_ed25519.py.

Derived from the public-domain RFC 8032 reference implementation.

API:
    keypair(seed: bytes | None) -> (private_seed: bytes[32], public_key: bytes[32])
    sign(message: bytes, private_seed: bytes[32], public_key: bytes[32]) -> bytes[64]
"""

import hashlib
import os

_q = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493
_d = -121665 * pow(121666, _q - 2, _q) % _q
_I = pow(2, (_q - 1) // 4, _q)


def _sha512(data):
    return hashlib.sha512(data).digest()


def _inv(x):
    return pow(x, _q - 2, _q)


def _xrecover(y):
    xx = (y * y - 1) * _inv(_d * y * y + 1)
    x = pow(xx, (_q + 3) // 8, _q)
    if (x * x - xx) % _q != 0:
        x = (x * _I) % _q
    if x % 2 != 0:
        x = _q - x
    return x


_By = 4 * _inv(5) % _q
_Bx = _xrecover(_By)
_B = (_Bx % _q, _By % _q, 1, (_Bx * _By) % _q)


def _edwards_add(P, Q):
    (x1, y1, z1, t1) = P
    (x2, y2, z2, t2) = Q
    a = (y1 - x1) * (y2 - x2) % _q
    b = (y1 + x1) * (y2 + x2) % _q
    c = t1 * 2 * _d * t2 % _q
    dd = z1 * 2 * z2 % _q
    e = b - a
    f = dd - c
    g = dd + c
    h = b + a
    return ((e * f) % _q, (g * h) % _q, (f * g) % _q, (e * h) % _q)


def _scalarmult(P, e):
    if e == 0:
        return (0, 1, 1, 0)
    Q = _scalarmult(P, e // 2)
    Q = _edwards_add(Q, Q)
    if e & 1:
        Q = _edwards_add(Q, P)
    return Q


def _encodepoint(P):
    (x, y, z, _t) = P
    zi = _inv(z)
    x = (x * zi) % _q
    y = (y * zi) % _q
    val = y | ((x & 1) << 255)
    return val.to_bytes(32, "little")


def _publickey_from_seed(seed):
    h = _sha512(seed)
    a = 2 ** 254 | (int.from_bytes(h[:32], "little") & ((1 << 254) - (1 << 3)))
    A = _scalarmult(_B, a)
    return _encodepoint(A), a, h


def keypair(seed=None):
    """Generate (private_seed, public_key). seed is 32 random bytes if None."""
    if seed is None:
        seed = os.urandom(32)
    if len(seed) != 32:
        raise ValueError("seed must be 32 bytes")
    pub, _a, _h = _publickey_from_seed(seed)
    return seed, pub


def sign(message, private_seed, public_key):
    """Return the 64-byte Ed25519 signature of `message`."""
    if len(private_seed) != 32 or len(public_key) != 32:
        raise ValueError("keys must be 32 bytes")
    pub, a, h = _publickey_from_seed(private_seed)
    if pub != public_key:
        raise ValueError("public_key does not match private_seed")
    r = int.from_bytes(_sha512(h[32:] + message), "little") % _L
    R = _scalarmult(_B, r)
    Rs = _encodepoint(R)
    k = int.from_bytes(_sha512(Rs + public_key + message), "little") % _L
    S = (r + k * a) % _L
    return Rs + S.to_bytes(32, "little")
