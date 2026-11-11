// hacktools.yar - curated hack-tool / cred-dumper signatures for repo-forensics.
// Hacktool family starts at MEDIUM (design R4: conservative initial severities;
// only webshell/stager chains are CRITICAL). Multi-string conjunctive
// conditions + filesize bounds. YR-* ids mirrored in data/yara/manifest.json.
// Author: Alex Greenshpun. License: PolyForm-Noncommercial-1.0.0.

rule Hacktool_Mimikatz
{
    meta:
        id = "YR-HCK-001"
        severity = "medium"
        category = "hacktool"
        confidence = "0.80"
        title = "Mimikatz credential-dumper indicator"
    strings:
        $sekurlsa = "sekurlsa" nocase
        $logonpw = "logonpasswords" nocase
        $mimi = "mimikatz" nocase
        $gentil = "gentilkiwi" nocase
    condition:
        filesize < 500KB and 2 of ($sekurlsa, $logonpw, $mimi, $gentil)
}

rule Hacktool_Metasploit
{
    meta:
        id = "YR-HCK-002"
        severity = "medium"
        category = "hacktool"
        confidence = "0.75"
        title = "Metasploit framework indicator"
    strings:
        $msf = "metasploit" nocase
        $console = "msfconsole" nocase
        $handler = "exploit/multi/handler" nocase
        $payload = "msfvenom" nocase
        $meterpreter = "meterpreter" nocase
    condition:
        // v2.13.1: a meterpreter payload alongside msfvenom is a confirmed
        // framework indicator on its own. Pentest cheatsheets (C-1 class)
        // demote via prose-doc (design §4 add #5).
        filesize < 500KB and ((2 of ($msf, $console, $handler, $payload)) or ($payload and $meterpreter))
}

rule Hacktool_LSASS_Dump
{
    meta:
        id = "YR-HCK-003"
        severity = "medium"
        category = "hacktool"
        confidence = "0.80"
        title = "LSASS credential-dump indicator"
    strings:
        $lsass = "lsass.exe" nocase
        $minidump = "MiniDump" nocase
        $openproc = "OpenProcess" nocase
        $comsvcs = "comsvcs.dll" nocase
        $procdump = "procdump" nocase
    condition:
        // v2.13.1: procdump is a common LSASS dump primitive. Pentest
        // cheatsheets (C-1 class) demote via prose-doc (design §4 add #6).
        filesize < 500KB and $lsass and (1 of ($minidump, $openproc, $comsvcs, $procdump))
}
