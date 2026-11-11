#!/usr/bin/env python3
"""
gen_rulepack_keys.py - DEV-ONLY Ed25519 keypair generator for the signed feeds.

NEVER shipped or loaded by the skill at scan time. Run once at repo-root to mint
the signing key for the rule-pack bundle + IOC feed.

    python3 scripts/gen_rulepack_keys.py [--seed-hex HEX]

Prints:
    PUBLIC KEY  (hex, 32 bytes) -> pin this as RULEPACK_FEED_PUBKEY_HEX in
                rulepack_feed.py and IOC_FEED_PUBKEY_HEX in ioc_manager.py.
    PRIVATE SEED (hex, 32 bytes) -> move OFFLINE immediately
                (~/.claude/_backups/ + password manager). NEVER commit.

The private seed is the signing secret. Treat it like a root key.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ed25519_sign  # noqa: E402  (dev-only sibling)


def main():
    ap = argparse.ArgumentParser(description="Generate Ed25519 feed keypair (dev-only).")
    ap.add_argument("--seed-hex", default=None,
                    help="Optional 64-char hex seed (deterministic; for tests only).")
    args = ap.parse_args()

    seed = bytes.fromhex(args.seed_hex) if args.seed_hex else None
    priv, pub = _ed25519_sign.keypair(seed)

    print("# Ed25519 feed keypair (repo-forensics signed feeds)")
    print(f"PUBLIC_KEY_HEX  = {pub.hex()}")
    print(f"PRIVATE_SEED_HEX= {priv.hex()}")
    print()
    print("# Pin PUBLIC_KEY_HEX in rulepack_feed.py + ioc_manager.py.")
    print("# Move PRIVATE_SEED_HEX OFFLINE (never commit).")


if __name__ == "__main__":
    main()
