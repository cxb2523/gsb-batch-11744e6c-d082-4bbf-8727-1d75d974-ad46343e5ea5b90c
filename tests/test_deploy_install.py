"""deploy/install.sh: the release signing keys it trusts."""
import re
from pathlib import Path

INSTALL = Path(__file__).resolve().parent.parent / "deploy" / "install.sh"
_SIGNER = re.compile(r'[^\s]+ namespaces="git" ssh-(ed25519|rsa) [A-Za-z0-9+/]+=*')


def test_release_signers_lists_real_keys():
    match = re.search(r"^RELEASE_SIGNERS='([^']*)'$", INSTALL.read_text(), re.M)
    assert match, "RELEASE_SIGNERS='...' must stay a single-quoted line"
    keys = [line for line in match.group(1).splitlines() if line.strip()]
    assert keys, "list at least one release key"
    for key in keys:
        assert _SIGNER.fullmatch(key.strip()), f"not an allowed-signers line: {key[:40]}"
