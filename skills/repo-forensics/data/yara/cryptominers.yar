// cryptominers.yar - curated cryptominer signatures for repo-forensics.
// Multi-string conjunctive conditions + filesize bounds. YR-* ids mirrored
// in data/yara/manifest.json. Author: Alex Greenshpun.
// License: PolyForm-Noncommercial-1.0.0.

rule Cryptominer_XMRig_Stratum
{
    meta:
        id = "YR-CRY-001"
        severity = "high"
        category = "cryptominer"
        confidence = "0.90"
        title = "XMRig / stratum cryptominer pool indicator"
    strings:
        $stratum = "stratum+tcp://" nocase
        $stratum_ssl = "stratum+ssl://" nocase
        $xmrig = "xmrig" nocase
        $cn = "cryptonight" nocase
        $pool = "pool.minexmr" nocase
        $rx = "randomx" nocase
        $rx0 = "\"rx/0\"" nocase
        $pool_sxmr = "pool.supportxmr.com" nocase
        $xmrpool = "xmrpool." nocase
        $nanopool = "nanopool." nocase
        $moneroocean = "moneroocean" nocase
        $hashvault = "hashvault" nocase
    condition:
        // v2.13.1: accept stratum+ssl://, the quoted "rx/0" config form, and
        // the common public Monero pool markers. Mining-ops docs (C-4 class)
        // demote via prose-doc; pool lists in blocklists demote via
        // is_blocklist (design §4 add #4).
        filesize < 500KB and (1 of ($stratum, $stratum_ssl)) and (1 of ($xmrig, $cn, $rx, $pool, $rx0, $pool_sxmr, $xmrpool, $nanopool, $moneroocean, $hashvault))
}

rule Cryptominer_Coinhive_Browser
{
    meta:
        id = "YR-CRY-002"
        severity = "medium"
        category = "cryptominer"
        confidence = "0.80"
        title = "In-browser cryptominer (CoinHive / WASM wrapper)"
    strings:
        $coinhive = "coinhive.min.js" nocase
        $ch = "CoinHive" nocase
        $wasm = "CryptonightWASMWrapper" nocase
        $worker = "cryptonight-worker" nocase
    condition:
        filesize < 500KB and 2 of ($coinhive, $ch, $wasm, $worker)
}
