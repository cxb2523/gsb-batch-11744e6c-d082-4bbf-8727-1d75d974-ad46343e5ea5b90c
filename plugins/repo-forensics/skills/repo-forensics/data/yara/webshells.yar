// webshells.yar - curated webshell signatures for repo-forensics.
// Hand-authored, multi-string conjunctive conditions + filesize bounds so a
// match is a confirmed family indicator, not a single-token guess. Each rule
// carries a YR-* id mirrored in data/yara/manifest.json (authoritative meta).
// Author: Alex Greenshpun. License: PolyForm-Noncommercial-1.0.0.

rule Webshell_PHP_Eval_Inflate
{
    meta:
        id = "YR-WEB-001"
        severity = "critical"
        category = "webshell"
        confidence = "0.95"
        title = "PHP webshell (eval/assert + gzinflate + base64 chain)"
    strings:
        $eval = "eval(" nocase
        $gzinflate = "gzinflate(" nocase
        $b64 = "base64_decode(" nocase
        $assert = "assert(" nocase
    condition:
        // v2.13.1: dropped the `not $assert` own-goal. The exclusion existed
        // to spare legit assert(decode(...)) unit-test code; the context gate
        // now demotes test-fixture carriers, so $assert is reclaimed as an
        // alternative executor alongside eval (design §4 add #3).
        filesize < 200KB and ($eval or $assert) and ($gzinflate or $b64)
}

rule Webshell_PHP_Exec_Passthru
{
    meta:
        id = "YR-WEB-002"
        severity = "critical"
        category = "webshell"
        confidence = "0.90"
        title = "PHP webshell (system/passthru/shell_exec/exec/popen exec chain)"
    strings:
        $system = "system(" nocase
        $passthru = "passthru(" nocase
        $shell_exec = "shell_exec(" nocase
        $proc_open = "proc_open(" nocase
        $execp = "exec(" nocase
        $popen = "popen(" nocase
        $request = "$_REQUEST" nocase
        $get = "$_GET" nocase
        $post = "$_POST" nocase
    condition:
        // v2.13.1: widened exec set (exec(/popen() and input set ($_POST);
        // $_POST in PHP-tutorials/tests is absorbed by the context gate
        // (prose-doc / test-fixture -> inferred) (design §4 add #2).
        filesize < 200KB and 2 of ($system, $passthru, $shell_exec, $proc_open, $execp, $popen) and (1 of ($request, $get, $post))
}

rule Webshell_JSP_Runtime_Exec
{
    meta:
        id = "YR-WEB-003"
        severity = "critical"
        category = "webshell"
        confidence = "0.92"
        title = "JSP webshell (Runtime.exec + request.getParameter chain)"
    strings:
        $runtime = "Runtime.getRuntime" nocase
        $exec = ".exec(" nocase
        $param = "request.getParameter" nocase
    condition:
        filesize < 200KB and $runtime and $exec and $param
}
