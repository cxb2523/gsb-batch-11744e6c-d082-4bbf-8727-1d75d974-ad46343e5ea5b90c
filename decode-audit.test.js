/*!
 * decode-audit.test.js — decode-audit.js 自动化测试（Node 内置 test runner，无网络依赖）
 * 运行：node --test decode-audit.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditDecodeSnapshot, _internals } = require('./decode-audit.js');

const KEY_BYTES = [0x51, 0x77, 0x21, 0xfe, 0x00, 0x42, 0xa9, 0x13];
const KEY_STRING = Buffer.from(KEY_BYTES).toString('base64');

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

/** 与页面方向相反：HTML 文本 -> UTF-8 -> 循环异或 -> base64，切成若干模板 */
function buildSnapshot(html, { chunks = 3, expectedIds = null, keyString = KEY_STRING } = {}) {
  const utf8 = new TextEncoder().encode(html);
  const xored = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    xored[i] = utf8[i] ^ KEY_BYTES[i % KEY_BYTES.length];
  }
  const b64 = toBase64(xored);
  const size = Math.ceil(b64.length / chunks) || 1;
  const templates = [];
  for (let i = 0; i < chunks; i++) {
    templates.push({ id: 'a1m2M2mApr' + i, text: b64.slice(i * size, (i + 1) * size) });
  }
  const snapshot = { templates, keyString };
  if (expectedIds) snapshot.expectedIds = expectedIds;
  return { snapshot, b64, utf8Length: utf8.length };
}

/** 完全照搬 index.html 内联脚本的解码步骤（用 Buffer.atob 等价物），用于逐字节一致性比对 */
function pageStyleDecode(snapshot) {
  const concat = snapshot.templates.map((t) => (typeof t.text === 'string' ? t.text : '')).join('');
  const b64Decoded = Buffer.from(concat, 'base64').toString('latin1'); // atob 等价：binary string
  const key = Buffer.from(snapshot.keyString, 'base64').toString('latin1');
  const out = new Uint8Array(b64Decoded.length);
  for (let i = 0; i < b64Decoded.length; i++) {
    out[i] = b64Decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
  }
  return { bytes: out, text: new TextDecoder('utf-8').decode(out) };
}

const SAMPLE_HTML =
  '<html><head><title>Audit Title</title>' +
  '<meta charset="utf-8"><link rel="x" href="y.css"><style>p{color:red}</style>' +
  '<script>var droppedInHead=1;</script><noscript>no</noscript></head>' +
  '<body><h1>hi</h1>' +
  '<script src="https://example.test/a.js"></script>' +
  '<script>   \n\t </script>' +
  '<script>var inline=1+1;</script>' +
  '<script src="">var emptySrcFallsToInline=2;</script>' +
  '<p>end</p></body></html>';

function assertJsonSafe(value, path = '$') {
  if (value === null) return;
  const t = typeof value;
  assert.ok(t !== 'function', path + ' 含函数，不可 JSON 序列化');
  assert.ok(t !== 'bigint' && t !== 'symbol' && t !== 'undefined', path + ' 含不可序列化类型 ' + t);
  if (t === 'object') {
    assert.ok(!(value instanceof Uint8Array) && !(value instanceof ArrayBuffer), path + ' 含二进制缓冲');
    for (const [k, v] of Object.entries(value)) assertJsonSafe(v, path + '.' + k);
  }
}

test('正常路径：字节数/命中/head 白名单/脚本计数/重放风险面全部正确且与页面算法一致', () => {
  const { snapshot, b64, utf8Length } = buildSnapshot(SAMPLE_HTML, { chunks: 4 });
  const audit = auditDecodeSnapshot(snapshot);

  assert.equal(audit.status, 'pass');
  assert.ok(audit.checks.every((c) => c.pass), '所有检查项应通过: ' + JSON.stringify(audit.checks));

  // 解码管线指标
  assert.equal(audit.decoding.concatenatedBase64Length, b64.length);
  assert.equal(audit.decoding.decodedByteCount, utf8Length);
  assert.equal(audit.decoding.xorKeyLength, KEY_BYTES.length);
  assert.equal(audit.decoding.utf8Decoded, true);

  // 与页面脚本逐字节算法一致
  const page = pageStyleDecode(snapshot);
  assert.equal(page.bytes.length, audit.decoding.decodedByteCount);
  assert.equal(page.text.length, audit.decoding.decodedTextLength);
  assert.equal(page.text, SAMPLE_HTML);

  // title/head/body 命中
  assert.deepEqual(
    { t: audit.structure.titleHit, h: audit.structure.headHit, b: audit.structure.bodyHit },
    { t: true, h: true, b: true }
  );

  // head 白名单：META/LINK/STYLE 保留；SCRIPT/NOSCRIPT 丢弃；title 在解析前被页面剥离，不计
  assert.deepEqual(audit.structure.head.keptTags, { META: 1, LINK: 1, STYLE: 1 });
  assert.deepEqual(audit.structure.head.discardedTags, { SCRIPT: 1, NOSCRIPT: 1 });
  assert.equal(audit.structure.head.keptCount, 3);
  assert.equal(audit.structure.head.discardedCount, 2);

  // body 脚本剥离：1 外链 + 2 内联（空白内联跳过 1，空 src 按页面语义落回内联）
  assert.equal(audit.structure.bodyScripts.strippedCount, 3);
  assert.equal(audit.structure.bodyScripts.externalCount, 1);
  assert.equal(audit.structure.bodyScripts.inlineCount, 2);
  assert.equal(audit.structure.bodyScripts.blankInlineSkipped, 1);
  assert.equal(audit.structure.bodyScripts.countsConsistent, true);

  // 重放风险面：顺序、类型、只含长度/布尔/计数，不含脚本文本
  const rr = audit.replayRisk;
  assert.equal(rr.verdict, 'replay-surface');
  assert.equal(rr.replayable, true);
  assert.equal(rr.entries.length, 3);
  assert.deepEqual(
    rr.entries.map((e) => e.kind),
    ['external', 'inline', 'inline']
  );
  assert.equal(rr.entries[0].srcEmpty, false);
  assert.equal(rr.entries[0].inlineLength, null);
  assert.equal(rr.entries[1].inlineLength, 'var inline=1+1;'.length);
  assert.equal(rr.entries[2].inlineLength, 'var emptySrcFallsToInline=2;'.length);
  assert.equal(rr.externalCount + rr.inlineCount, rr.totalCollected);
  assert.equal(rr.countsConsistent, true);
  assert.ok(!JSON.stringify(rr).includes('var inline'), '风险面不得包含脚本文本原文');
});

test('提供 decodedHtml 时做一致性核对，且结构审计结果相同', () => {
  const { snapshot } = buildSnapshot(SAMPLE_HTML);
  const audit = auditDecodeSnapshot({ ...snapshot, decodedHtml: SAMPLE_HTML });
  const consistency = audit.checks.find((c) => c.name === 'decoded-html-consistency');
  assert.equal(consistency.pass, true);
  assert.equal(audit.analysis.source, 'provided');
  assert.equal(audit.structure.bodyScripts.strippedCount, 3);

  const wrong = auditDecodeSnapshot({ ...snapshot, decodedHtml: '<html></html>' });
  assert.equal(wrong.checks.find((c) => c.name === 'decoded-html-consistency').pass, false);
});

test('负向：密钥为空 -> fail，可读原因，不抛异常', () => {
  const { snapshot } = buildSnapshot(SAMPLE_HTML);
  const audit = auditDecodeSnapshot({ templates: snapshot.templates, keyString: '' });
  assert.equal(audit.status, 'fail');
  const keyCheck = audit.checks.find((c) => c.name === 'key-nonempty');
  assert.equal(keyCheck.pass, false);
  assert.ok(keyCheck.reason && keyCheck.reason.length > 0);
  assert.equal(audit.decoding.xorKeyLength, 0);
  assert.equal(audit.replayRisk.verdict, 'unavailable');
});

test('负向：base64 非法 -> fail，可读原因，不抛异常', () => {
  const audit = auditDecodeSnapshot({
    templates: [{ id: 't0', text: '@@@not-base64@@@' }],
    keyString: KEY_STRING
  });
  assert.equal(audit.status, 'fail');
  const b64Check = audit.checks.find((c) => c.name === 'base64-valid');
  assert.equal(b64Check.pass, false);
  assert.ok(b64Check.reason.includes('base64'));
  assert.equal(audit.decoding.validBase64, false);
});

test('边界：模板列表为空 -> degraded，不抛异常', () => {
  const audit = auditDecodeSnapshot({ templates: [], keyString: KEY_STRING });
  assert.equal(audit.status, 'degraded');
  const tplCheck = audit.checks.find((c) => c.name === 'templates-present');
  assert.equal(tplCheck.pass, false);
  assert.ok(tplCheck.reason.includes('模板列表为空'));
  assert.equal(audit.decoding.templateCount, 0);
  assert.equal(audit.decoding.concatenatedBase64Length, 0);
  const nonEmpty = audit.checks.find((c) => c.name === 'base64-nonempty');
  assert.equal(nonEmpty.pass, false);
});

test('边界：缺失模板 id 与空文本模板被显式列出', () => {
  const { snapshot } = buildSnapshot(SAMPLE_HTML, { chunks: 2 });
  snapshot.expectedIds = ['a1m2M2mApr0', 'a1m2M2mApr1', 'a1m2M2mApr2'];
  snapshot.templates[1].text = '';
  const audit = auditDecodeSnapshot(snapshot);
  assert.equal(audit.status, 'degraded');
  assert.deepEqual(audit.decoding.missingTemplateIds, ['a1m2M2mApr2']);
  assert.deepEqual(audit.decoding.emptyTemplateIds, ['a1m2M2mApr1']);
});

test('边界：解出文本缺少 body -> degraded，重放风险面为“无 body、不重放”而非报错', () => {
  const headOnly = '<html><head><title>T</title><meta charset="utf-8"></head></html>';
  const { snapshot } = buildSnapshot(headOnly);
  const audit = auditDecodeSnapshot(snapshot);
  assert.equal(audit.status, 'degraded');
  assert.equal(audit.structure.bodyHit, false);
  assert.equal(audit.checks.find((c) => c.name === 'body-present').pass, false);
  assert.equal(audit.replayRisk.verdict, 'no-body-no-replay');
  assert.equal(audit.replayRisk.replayable, false);
  assert.equal(audit.replayRisk.entries.length, 0);
  assert.equal(audit.replayRisk.totalCollected, 0);
  assert.equal(audit.structure.bodyScripts.strippedCount, 0);
  // 无 body 时 head 审计仍可用
  assert.equal(audit.structure.head.keptCount, 1);
  assert.deepEqual(audit.structure.head.keptTags, { META: 1 });
});

test('非法 UTF-8 字节序列 -> fail，且不抛异常（与页面非 fatal 行为对应）', () => {
  const badBytes = new Uint8Array([0x41, 0xff, 0xfe, 0x42]);
  const xored = new Uint8Array(badBytes.length);
  for (let i = 0; i < badBytes.length; i++) xored[i] = badBytes[i] ^ KEY_BYTES[i % KEY_BYTES.length];
  const audit = auditDecodeSnapshot({
    templates: [{ id: 't0', text: toBase64(xored) }],
    keyString: KEY_STRING
  });
  assert.equal(audit.status, 'fail');
  assert.equal(audit.decoding.utf8Decoded, false);
  assert.equal(audit.decoding.decodedByteCount, badBytes.length);
  assert.equal(audit.checks.find((c) => c.name === 'utf8-decode').pass, false);
});

test('所有审计对象经 JSON.stringify 往返保持结构，且不含函数/缓冲/undefined', () => {
  const cases = [
    auditDecodeSnapshot(buildSnapshot(SAMPLE_HTML).snapshot),
    auditDecodeSnapshot({ templates: [], keyString: KEY_STRING }),
    auditDecodeSnapshot({ templates: [{ id: 't', text: '###' }], keyString: '' }),
    auditDecodeSnapshot(buildSnapshot('<html><head></head></html>').snapshot)
  ];
  for (const audit of cases) {
    assertJsonSafe(audit);
    const roundTrip = JSON.parse(JSON.stringify(audit));
    assert.deepEqual(roundTrip, audit);
  }
});

test('纯数据保证：风险面条目只允许长度/布尔/计数字段', () => {
  const audit = auditDecodeSnapshot(buildSnapshot(SAMPLE_HTML).snapshot);
  for (const entry of audit.replayRisk.entries) {
    for (const k of Object.keys(entry)) {
      assert.ok(['index', 'kind', 'srcEmpty', 'inlineLength'].includes(k));
    }
  }
});

test('内部 base64 解码器：空白容错与严格非法字符判定', () => {
  assert.equal(_internals.decodeBase64('').ok, true);
  assert.equal(_internals.decodeBase64('aGVs\nbG8=').ok, true); // "hello"，含换行
  assert.equal(_internals.decodeBase64('aGVsbG8=').bytes.length, 5);
  assert.equal(_internals.decodeBase64('aGVsbG8').ok, false); // 长度非 4 倍数
  assert.equal(_internals.decodeBase64('aGVsbG8!').ok, false); // 非法字符
});
