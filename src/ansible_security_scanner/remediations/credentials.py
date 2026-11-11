#!/usr/bin/env python3
"""
Credentials remediation generator for Ansible Security Scanner
"""

from __future__ import annotations

import re

from .base import BaseRemediationGenerator, _key_is_credential

# Sentinels the variable extractors emit when no real name could be derived.
# The generator replaces them with the key it extracts from the snippet
# itself so a shipped fix never references a placeholder variable.
_NAME_SENTINELS = frozenset({"", "variable_name", "var_name", "credential", "secret", "value"})
_ENV_SENTINELS = frozenset(
    {"", "VARIABLE_NAME", "VAR_NAME", "ENV_VAR", "ENV_VAR_NAME", "CREDENTIAL", "SECRET", "VALUE"}
)

# A ``key: value`` / ``key=value`` / ``KEY=value`` line, capturing indent,
# key, and the raw remainder. Used to locate the credential-bearing line in
# a (possibly multi-line) task snippet.
_CRED_LINE_RE = re.compile(
    r"^(?P<indent>\s*)(?:-\s*)?(?P<key>[A-Za-z_][\w.-]*)\s*[:=]\s*(?P<value>.*?)\s*$"
)


class CredentialsRemediationGenerator(BaseRemediationGenerator):
    """Generates remediation for hardcoded credentials"""

    def generate_hardcoded_credentials_fix(
        self, code_snippet: str, var_name: str, env_var: str, rule_id: str = ""
    ) -> str:
        """Generate fix for hardcoded credentials using actual code context"""
        return self._generate_contextual_credential_fix(code_snippet, var_name, env_var, rule_id)

    # -- extraction helpers -------------------------------------------------

    @staticmethod
    def _extract_credential_line(code_snippet: str):
        """Return ``(indent, key, value)`` for the credential-bearing line.

        Scans every ``key: value`` line and keeps the first whose key reads
        like a credential (``token``, ``password``, ``api_key``, ...), so a
        multi-line task grounds on the flagged secret rather than an
        incidental ``url:`` or ``name:`` line above it.
        """
        for line in (code_snippet or "").splitlines():
            if not line.strip():
                continue
            m = _CRED_LINE_RE.match(line)
            if not m:
                continue
            key = m.group("key")
            if not _key_is_credential(key):
                continue
            value = m.group("value").strip().strip("'\"")
            return m.group("indent"), key, value
        return None

    def _resolve_names(self, code_snippet: str, var_name: str, env_var: str):
        """Resolve ``(indent, key, value, env_name, vault_var)`` for a fix.

        The flagged line's own key wins; the extractor-provided names are
        used only when they are real (not extractor sentinels); the env var
        falls back to the uppercased key so the alternative fix always names
        a concrete variable.
        """
        indent, key, value = "  ", "", ""
        found = self._extract_credential_line(code_snippet)
        if found:
            indent, key, value = found
        if not key and var_name and var_name.strip().lower() not in _NAME_SENTINELS:
            key = var_name.strip()
        if not key:
            key = "credential"
        env_name = (env_var or "").strip()
        if env_name.upper() in _ENV_SENTINELS:
            env_name = ""
        if not env_name:
            env_name = key.upper().replace("-", "_").replace(" ", "_")
        if not value:
            value = "rotated-secret-value"
        return indent, key, value, env_name, self._get_vault_var_name(key)

    @staticmethod
    def _render_advice(advice: list[str]) -> str:
        return "\n".join(f"- {item}" for item in advice)

    # -- main contextual fix ------------------------------------------------

    def _generate_contextual_credential_fix(
        self, code_snippet: str, var_name: str, env_var: str, rule_id: str = ""
    ) -> str:
        """Generate a vault/env fix grounded in the finding's own key+value."""
        credential_type = self._detect_credential_type(code_snippet, rule_id)
        info = self._get_credential_type_info(
            credential_type, rule_id=rule_id, code_snippet=code_snippet
        )
        indent, key, value, env_name, vault_var = self._resolve_names(
            code_snippet, var_name, env_var
        )

        return f"""
**❌ Vulnerable Code:**
```yaml
{code_snippet}
```

**🚨 {info["name"]} Detected:**
{info["description"]}

**✅ Secure Fix - Move the secret into Ansible Vault:**
```yaml
# In your playbook, reference the vaulted variable:
{indent}{key}: "{{{{ {vault_var} }}}}"

# In group_vars/all/vault.yml (encrypted with ansible-vault):
{vault_var}: "{value}"
```

**✅ Alternative Fix (environment variable lookup):**
```yaml
{indent}{key}: "{{{{ lookup('env', '{env_name}') }}}}"
```

**🔐 {info["name"]} Security Best Practices:**
{self._render_advice(info["security_advice"])}
"""

    # -- category entry points ----------------------------------------------

    def generate_webhook_exposure_fix(self, code_snippet: str, var_name: str, env_var: str) -> str:
        """Generate fix for a webhook URL with an embedded secret token"""
        info = self._get_credential_type_info(
            "webhook", rule_id="", code_snippet=code_snippet
        )
        indent, key, value, env_name, vault_var = self._resolve_names(
            code_snippet, var_name, env_var
        )

        return f"""
**❌ Vulnerable Code:**
```yaml
{code_snippet}
```

**🚨 Webhook URL With Embedded Credentials Detected:**
{info["description"]}

**✅ Secure Fix - Move the webhook token into Ansible Vault:**
```yaml
# In your playbook, reference the vaulted token instead of the full URL:
{indent}url: "https://hooks.example.com/services/{{{{ {vault_var} }}}}"

# In group_vars/all/vault.yml (encrypted with ansible-vault):
{vault_var}: "{value}"
```

**✅ Alternative Fix (environment variable lookup):**
```yaml
{indent}url: "https://hooks.example.com/services/{{{{ lookup('env', '{env_name}') }}}}"
```

**🔐 Webhook Security Best Practices:**
{self._render_advice(info["security_advice"])}
"""

    def generate_command_line_auth_fix(
        self, code_snippet: str, var_name: str, env_var: str
    ) -> str:
        """Generate fix for credentials passed on a CLI command line"""
        indent, key, value, env_name, vault_var = self._resolve_names(
            code_snippet, var_name, env_var
        )

        return f"""
**❌ Vulnerable Code:**
```yaml
{code_snippet}
```

**🚨 Hardcoded Credentials in Command-Line Invocation:**
This command passes credentials as command-line arguments, where they are
visible in process listings, shell history, and Ansible task output.

**✅ Secure Fix - Move the credential into Ansible Vault:**
```yaml
# In your playbook, reference the vaulted variable:
{indent}{key}: "{{{{ {vault_var} }}}}"

# In group_vars/all/vault.yml (encrypted with ansible-vault):
{vault_var}: "{value}"
```

**✅ Alternative Fix (environment variable lookup):**
```yaml
{indent}{key}: "{{{{ lookup('env', '{env_name}') }}}}"
```

**🔐 Command-Line Security Best Practices:**
- Use proper Ansible modules instead of shell commands where possible
- Use SSH keys instead of passwords for remote authentication
- Mark the task ``no_log: true`` so the value is not logged
- Rotate credentials regularly and use strong passwords
- Enable audit logging for all database and system access
"""

    def generate_form_data_fix(self, code_snippet: str, var_name: str, env_var: str) -> str:
        """Generate fix for credentials embedded in form-encoded body data"""
        info = self._get_credential_type_info(
            "form_data", rule_id="", code_snippet=code_snippet
        )
        indent, key, value, env_name, vault_var = self._resolve_names(
            code_snippet, var_name, env_var
        )

        return f"""
**❌ Vulnerable Code:**
```yaml
{code_snippet}
```

**🚨 Hardcoded Credentials in Form Data:**
{info["description"]}

**✅ Secure Fix - Move the credential into Ansible Vault:**
```yaml
# In your playbook, reference the vaulted variable:
{indent}body:
{indent}  {key}: "{{{{ {vault_var} }}}}"

# In group_vars/all/vault.yml (encrypted with ansible-vault):
{vault_var}: "{value}"
```

**✅ Alternative Fix (environment variable lookup):**
```yaml
{indent}body:
{indent}  {key}: "{{{{ lookup('env', '{env_name}') }}}}"
```

**🔐 Form Data Security Best Practices:**
{self._render_advice(info["security_advice"])}
"""

    # -- tailored per-rule fixes --------------------------------------------

    def _generate_gitlab_ci_job_token_leak_fix(self, code_snippet: str) -> str:
        """Generate fix for a leaked GitLab CI job token"""
        return f"""
**❌ Vulnerable Code:**
```yaml
{code_snippet}
```

**🚨 GitLab CI Job Token Leak:**
The CI job token authenticates as the job's user against the GitLab API,
container registry, and other projects. Printed to job logs or committed to
source, it stays usable until the job finishes and the token expires.

**✅ Secure Fix - Use masked CI/CD variables:**
```yaml
# Register the token as a masked, protected CI/CD variable and reference it:
- name: Authenticate with the GitLab API
  ansible.builtin.uri:
    url: "https://gitlab.example.com/api/v4/projects"
    headers:
      JOB-TOKEN: "{{{{ lookup('env', 'CI_JOB_TOKEN') }}}}"
    status_code: 200
  no_log: true
```

**🔐 GitLab CI Token Best Practices:**
- Mark token variables as masked so they never print in job logs
- Prefer ``CI_JOB_TOKEN`` scoping over personal access tokens
- Rotate any token that has appeared in a log or commit immediately
- Restrict the token's allowed projects to the minimum required
"""

    def _generate_npm_pypi_publish_token_fix(self, code_snippet: str) -> str:
        """Generate fix for a hardcoded npm/PyPI publish token"""
        return f"""
**❌ Vulnerable Code:**
```yaml
{code_snippet}
```

**🚨 npm/PyPI Publish Token Detected:**
A publish token can push new package versions under your name - a classic
supply-chain compromise vector. Committed to source, it must be treated as
live until rotated at the registry.

**✅ Secure Fix - Reference the token from the environment:**
```yaml
# Keep the token in a masked CI variable or vault, never inline:
- name: Publish package
  ansible.builtin.command: npm publish
  environment:
    NODE_AUTH_TOKEN: "{{{{ lookup('env', 'NODE_AUTH_TOKEN') }}}}"
  no_log: true
```

**🔐 Publish Token Best Practices:**
- Rotate the token at the registry immediately
- Use granular, per-package tokens with publish-only scope
- Store tokens in a secrets manager or masked CI variables
- Enable 2FA on the registry account for publishes
"""

    def _generate_ci_secret_exfil_via_printenv_fix(self, code_snippet: str) -> str:
        """Generate fix for printenv-based CI secret exfiltration"""
        return f"""
**❌ Vulnerable Code:**
```yaml
{code_snippet}
```

**🚨 CI Secret Exfiltration via printenv Detected:**
Dumping the process environment (``printenv``/``env``) exposes every CI
secret injected into the job - tokens, passwords, and signing keys - to
whatever receives the output.

**✅ Secure Fix - Never dump the CI environment:**
```yaml
# Remove the exfiltration command. Reference only the specific variables
# the task actually needs, and keep them out of logs:
- name: Use a specific CI variable safely
  ansible.builtin.debug:
    msg: "Deploying to {{{{ target_environment }}}}"
  no_log: true
```

**🔐 CI Secret Handling Best Practices:**
- Never run ``printenv``/``env`` in CI jobs or pipe them anywhere
- Mark secrets as masked in the CI system so logs redact them
- Scope each job's injected secrets to the minimum it needs
- Audit pipeline definitions for environment-dumping commands
"""
