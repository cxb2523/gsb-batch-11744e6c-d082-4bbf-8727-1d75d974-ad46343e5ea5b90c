/*!
 * decode-audit.js — 解码加载审计（纯函数模块）
 *
 * 浏览器与 Node 均可加载，不依赖 DOM、不执行任何脚本、不发起网络请求、不写文件。
 * 审计算法与 index.html 末尾内联脚本的解码/解析语义逐项对齐：
 *   1. atob(密钥串) 得到循环 XOR 密钥（与页面 Durtuuu = atob(...) 一致）
 *   2. 按模板顺序拼接 innerHTML 后整体 atob（页面：xmo8VB.join('') -> atob）
 *   3. 逐字节 key[i % key.length] 循环异或
 *   4. TextDecoder('utf-8')（非 fatal，与页面相同；另用 fatal 解码器判定是否成功）
 *   5. title/head/body 三个正则与页面完全一致
 *   6. head 白名单 STYLE/META/LINK/BASE，与页面 if 判断一致
 *   7. body 脚本剥离正则、src 优先、空白内联不计，与页面 replace 回调一致
 *
 * 返回值为可 JSON.stringify 的纯数据（仅 string/number/boolean/null/普通对象/数组）。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DecodeAudit = factory();
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var HEAD_WHITELIST = ['STYLE', 'META', 'LINK', 'BASE'];
  var VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
  var VOID_TAG_SET = (function () {
    var s = {};
    for (var i = 0; i < VOID_TAGS.length; i++) s[VOID_TAGS[i]] = true;
    return s;
  })();

  /* 与页面一致的三个结构正则（同样的大小写不敏感、非贪婪、[\s\S] 跨行） */
  var TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
  var HEAD_RE = /<head[^>]*>([\s\S]*?)<\/head>/i;
  var BODY_RE = /<body[^>]*>([\s\S]*?)<\/body>/i;
  /* 与页面一致：head 注入前先剥离首个 title */
  var HEAD_TITLE_STRIP_RE = /<title[^>]*>[\s\S]*?<\/title>/i;
  /* 与页面一致的脚本剥离正则与 src 属性正则 */
  var SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  var SRC_RE = /src\s*=\s*["']([^"']+)["']/i;

  function makeCheck(name, pass, reason) {
    var c = { name: name, pass: !!pass };
    if (!pass) c.reason = reason || '未通过';
    return c;
  }

  /**
   * 严格复刻浏览器 atob 的解码行为：
   *  - 先移除 ASCII 空白（\t \n \f \r 空格），与 HTML 规范 atob 一致
   *  - 剩余字符必须是标准 base64 字母表，等号仅允许出现在末尾且最多两个，长度为 4 的倍数
   *  - 非法输入不抛异常，返回 {ok:false, reason}
   */
  function decodeBase64(input) {
    if (input === null || input === undefined) {
      return { ok: false, reason: 'base64 输入为 null/undefined', bytes: [] };
    }
    if (typeof input !== 'string') {
      return { ok: false, reason: 'base64 输入不是字符串', bytes: [] };
    }
    var stripped = input.replace(/[\t\n\f\r ]+/g, '');
    if (stripped.length === 0) {
      return { ok: true, bytes: [], empty: true };
    }
    if (stripped.length % 4 !== 0) {
      return { ok: false, reason: 'base64 长度不是 4 的倍数（去空白后 ' + stripped.length + ' 个字符）', bytes: [] };
    }
    var padMatch = /(=*)$/.exec(stripped);
    var padding = padMatch ? padMatch[1].length : 0;
    if (padding > 2) {
      return { ok: false, reason: 'base64 填充等号超过 2 个', bytes: [] };
    }
    var core = padding ? stripped.slice(0, stripped.length - padding) : stripped;
    if (!/^[A-Za-z0-9+/]*$/.test(core)) {
      return { ok: false, reason: 'base64 含非法字符（允许字母表 A-Z a-z 0-9 + / 与末尾 =）', bytes: [] };
    }
    var map = new Int8Array(128);
    for (var k = 0; k < 128; k++) map[k] = -1;
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (k = 0; k < alphabet.length; k++) map[alphabet.charCodeAt(k)] = k;

    var bytes = [];
    for (var q = 0; q < stripped.length; q += 4) {
      var c0 = map[stripped.charCodeAt(q)];
      var c1 = map[stripped.charCodeAt(q + 1)];
      var c2 = stripped.charAt(q + 2) === '=' ? -2 : map[stripped.charCodeAt(q + 2)];
      var c3 = stripped.charAt(q + 3) === '=' ? -2 : map[stripped.charCodeAt(q + 3)];
      if (c0 < 0 || c1 < 0 || c2 === -1 || c3 === -1) {
        return { ok: false, reason: 'base64 字符映射失败（位置 ' + q + ' 附近）', bytes: [] };
      }
      var triplet = (c0 << 18) | (c1 << 12) | ((c2 === -2 ? 0 : c2) << 6) | (c3 === -2 ? 0 : c3);
      bytes.push((triplet >> 16) & 0xff);
      if (c2 !== -2) bytes.push((triplet >> 8) & 0xff);
      if (c3 !== -2) bytes.push(triplet & 0xff);
    }
    return { ok: true, bytes: bytes, empty: false };
  }

  function isAllWhitespace(s) {
    return s.trim().length === 0;
  }

  /**
   * 轻量顶层元素分词器，模拟页面把 head 片段赋给 div.innerHTML 后遍历 firstChild 的视角：
   * 只统计 div 的直接子元素；文本节点/注释/声明没有 tagName，页面里 (_n.tagName||'') 为 ''，
   * 不会命中白名单，计入 nonElementNodeCount 而不计入标签计数。嵌套元素不是直接子节点。
   */
  function parseTopLevelElements(html) {
    var topLevelTags = [];
    var nonElementNodeCount = 0;
    var stack = [];
    var i = 0;
    var n = html.length;

    while (i < n) {
      var lt = html.indexOf('<', i);
      if (lt === -1) {
        if (stack.length === 0 && !isAllWhitespace(html.slice(i))) nonElementNodeCount++;
        break;
      }
      if (stack.length === 0 && lt > i && !isAllWhitespace(html.slice(i, lt))) {
        nonElementNodeCount++;
      }
      if (html.indexOf('<!--', lt) === lt) {
        var end = html.indexOf('-->', lt + 4);
        if (stack.length === 0) nonElementNodeCount++;
        i = end === -1 ? n : end + 3;
        continue;
      }
      var tagMatch = /^<\s*(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt));
      if (!tagMatch) {
        /* <!doctype ...>、<?...> 或游离的 '<'：无 tagName 的非元素节点 */
        var gtDecl = html.indexOf('>', lt);
        if (stack.length === 0) nonElementNodeCount++;
        i = gtDecl === -1 ? n : gtDecl + 1;
        continue;
      }
      var isClose = tagMatch[1] === '/';
      var name = tagMatch[2].toLowerCase();
      var gt = html.indexOf('>', lt);
      if (gt === -1) {
        if (stack.length === 0) nonElementNodeCount++;
        break;
      }
      if (isClose) {
        var idx = stack.lastIndexOf(name);
        if (idx !== -1) stack.length = idx;
        i = gt + 1;
        continue;
      }
      if (stack.length === 0) topLevelTags.push(name.toUpperCase());
      if (!VOID_TAG_SET[name]) stack.push(name);
      i = gt + 1;
    }
    return { topLevelTags: topLevelTags, nonElementNodeCount: nonElementNodeCount };
  }

  function bump(map, key) {
    map[key] = (map[key] || 0) + 1;
  }

  /**
   * 分析已解出的 HTML 文本（结构审计 + 重放风险面）。
   * 纯字符串处理，不构造 DOM、不执行脚本，输出不含任何脚本文本原文。
   */
  function analyzeDecodedHtml(text) {
    var titleHit = !!TITLE_RE.exec(text);
    var headMatch = HEAD_RE.exec(text);
    var bodyMatch = BODY_RE.exec(text);
    var headHit = !!headMatch;
    var bodyHit = !!bodyMatch;

    var headKeptTags = {};
    var headDiscardedTags = {};
    var headKeptCount = 0;
    var headDiscardedCount = 0;
    var nonElementNodeCount = 0;

    if (headMatch) {
      /* 与页面相同：先 replace 掉 head 内首个 title，再模拟 div.innerHTML 的直接子节点 */
      var headInner = headMatch[1].replace(HEAD_TITLE_STRIP_RE, '');
      var parsed = parseTopLevelElements(headInner);
      nonElementNodeCount = parsed.nonElementNodeCount;
      for (var ti = 0; ti < parsed.topLevelTags.length; ti++) {
        var tag = parsed.topLevelTags[ti];
        if (HEAD_WHITELIST.indexOf(tag) !== -1) {
          bump(headKeptTags, tag);
          headKeptCount++;
        } else {
          bump(headDiscardedTags, tag);
          headDiscardedCount++;
        }
      }
    }

    /* body 脚本剥离：无 body 时按任务要求标注“不重放”，不计脚本 */
    var strippedCount = 0;
    var externalCount = 0;
    var inlineCount = 0;
    var blankInlineSkipped = 0;
    var entries = [];

    if (bodyHit) {
      var bodyInner = bodyMatch[1];
      var m;
      SCRIPT_RE.lastIndex = 0;
      while ((m = SCRIPT_RE.exec(bodyInner)) !== null) {
        var attrs = m[1];
        var content = m[2];
        var srcMatch = SRC_RE.exec(attrs);
        if (srcMatch) {
          /* 有 src 优先记为外链；正则 [^"']+ 决定捕获值不可能为空串，仍显式给出布尔 */
          externalCount++;
          strippedCount++;
          entries.push({
            index: entries.length,
            kind: 'external',
            srcEmpty: srcMatch[1] === '',
            inlineLength: null
          });
        } else if (content.trim()) {
          /* 无 src 且非空白：内联，仅记录长度，绝不保留脚本文本 */
          inlineCount++;
          strippedCount++;
          entries.push({
            index: entries.length,
            kind: 'inline',
            srcEmpty: null,
            inlineLength: content.length
          });
        } else {
          /* 无 src 且为空白内联：页面不收集 */
          blankInlineSkipped++;
        }
      }
    }

    var countsConsistent = externalCount + inlineCount === strippedCount;

    var replayRisk;
    if (!bodyHit) {
      replayRisk = {
        verdict: 'no-body-no-replay',
        replayable: false,
        reason: '解出文本中不存在 body，页面不会进入脚本剥离/重放流程',
        entries: [],
        externalCount: 0,
        inlineCount: 0,
        totalCollected: 0,
        countsConsistent: true
      };
    } else {
      replayRisk = {
        verdict: 'replay-surface',
        replayable: entries.length > 0,
        entries: entries,
        externalCount: externalCount,
        inlineCount: inlineCount,
        totalCollected: strippedCount,
        countsConsistent: countsConsistent
      };
    }

    return {
      hits: { titleHit: titleHit, headHit: headHit, bodyHit: bodyHit },
      head: {
        keptTags: headKeptTags,
        discardedTags: headDiscardedTags,
        keptCount: headKeptCount,
        discardedCount: headDiscardedCount,
        nonElementNodeCount: nonElementNodeCount
      },
      bodyScripts: {
        strippedCount: strippedCount,
        externalCount: externalCount,
        inlineCount: inlineCount,
        blankInlineSkipped: blankInlineSkipped,
        countsConsistent: countsConsistent
      },
      replayRisk: replayRisk
    };
  }

  /**
   * 主入口：auditDecodeSnapshot(snapshot)
   *
   * snapshot:
   *   templates:    Array<{ id: string, text?: string }>  按拼接顺序排列
   *   expectedIds?: string[]  期望存在的模板 id；缺省则以 templates 自身为准（仅查空文本）
   *   keyString:    string    页面 atob(...) 使用的同一密钥串（base64 字面量）
   *   decodedHtml?: string    可选的已解出 HTML；提供后结构审计以它为准并做一致性核对
   *
   * 永不抛出未捕获异常；返回纯 JSON 数据。
   * status: 'pass' | 'degraded' | 'fail'
   */
  function auditDecodeSnapshot(snapshot) {
    snapshot = snapshot || {};
    var checks = [];
    var hardFail = false;
    var degraded = false;

    var templates = Array.isArray(snapshot.templates) ? snapshot.templates : [];
    var expectedIds = Array.isArray(snapshot.expectedIds) ? snapshot.expectedIds : null;
    var keyString = snapshot.keyString;

    var presentById = {};
    var emptyTemplateIds = [];
    for (var ti = 0; ti < templates.length; ti++) {
      var tpl = templates[ti] || {};
      presentById[tpl.id] = true;
      if (typeof tpl.text !== 'string' || tpl.text.length === 0) emptyTemplateIds.push(tpl.id);
    }
    var missingTemplateIds = [];
    if (expectedIds) {
      for (var ei = 0; ei < expectedIds.length; ei++) {
        if (!presentById[expectedIds[ei]]) missingTemplateIds.push(expectedIds[ei]);
      }
    }

    var templatesOk = templates.length > 0 && missingTemplateIds.length === 0 && emptyTemplateIds.length === 0;
    if (!templatesOk) {
      degraded = true;
      var parts = [];
      if (templates.length === 0) parts.push('模板列表为空');
      if (missingTemplateIds.length) parts.push('缺失模板: ' + missingTemplateIds.join(', '));
      if (emptyTemplateIds.length) parts.push('空模板: ' + emptyTemplateIds.join(', '));
      checks.push(makeCheck('templates-present', false, parts.join('；')));
    } else {
      checks.push(makeCheck('templates-present', true));
    }

    /* 1. 密钥：页面先 atob 固定密钥串，再按字节循环异或 */
    var keyBytes = [];
    if (typeof keyString !== 'string' || keyString.length === 0) {
      hardFail = true;
      checks.push(makeCheck('key-nonempty', false, '密钥串为空，无法进行循环异或（页面将得到 NaN 字节）'));
    } else {
      var keyDecoded = decodeBase64(keyString);
      if (!keyDecoded.ok) {
        hardFail = true;
        checks.push(makeCheck('key-nonempty', false, '密钥串 atob 失败：' + keyDecoded.reason));
      } else if (keyDecoded.bytes.length === 0) {
        hardFail = true;
        checks.push(makeCheck('key-nonempty', false, '密钥 atob 后字节数为 0，异或密钥为空'));
      } else {
        keyBytes = keyDecoded.bytes;
        checks.push(makeCheck('key-nonempty', true));
      }
    }

    /* 2. 拼接 + atob */
    var concat = '';
    for (var ci = 0; ci < templates.length; ci++) {
      var t = templates[ci];
      concat += t && typeof t.text === 'string' ? t.text : '';
    }

    var b64 = decodeBase64(concat);
    if (!b64.ok) {
      hardFail = true;
      checks.push(makeCheck('base64-valid', false, '拼接文本 base64 解码失败：' + b64.reason));
    } else {
      checks.push(makeCheck('base64-valid', true));
    }
    if (b64.ok && b64.empty) {
      degraded = true;
      checks.push(makeCheck('base64-nonempty', false, '拼接后的 base64 解码得到 0 字节'));
    } else {
      checks.push(makeCheck('base64-nonempty', b64.ok && !b64.empty));
    }

    /* 3. 循环异或 + 4. UTF-8 解码（与页面完全相同的字节级算法） */
    var utf8Decoded = false;
    var decodedText = '';
    var decodedByteCount = b64.ok ? b64.bytes.length : 0;

    if (b64.ok && keyBytes.length > 0) {
      var xored = new Uint8Array(b64.bytes.length);
      for (var bi = 0; bi < b64.bytes.length; bi++) {
        xored[bi] = b64.bytes[bi] ^ keyBytes[bi % keyBytes.length];
      }
      try {
        /* 非 fatal：与页面 new TextDecoder('utf-8').decode 输出逐项一致 */
        decodedText = new TextDecoder('utf-8').decode(xored);
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(xored);
          utf8Decoded = true;
        } catch (e) {
          utf8Decoded = false;
        }
      } catch (e2) {
        utf8Decoded = false;
        decodedText = '';
      }
      if (!utf8Decoded) {
        hardFail = true;
        checks.push(makeCheck('utf8-decode', false, 'UTF-8 解码存在非法字节序列（页面非 fatal 解码会产生替换字符 U+FFFD）'));
      } else {
        checks.push(makeCheck('utf8-decode', true));
      }
    } else {
      checks.push(makeCheck('utf8-decode', false, '前置解码失败，跳过 UTF-8 解码'));
    }

    /* 5/6/7. 结构审计：优先使用可选的外部已解出文本，并与管线结果核对 */
    var analysisText = null;
    var analysisSource = 'none';
    if (typeof snapshot.decodedHtml === 'string') {
      analysisText = snapshot.decodedHtml;
      analysisSource = 'provided';
    } else if (decodedText) {
      analysisText = decodedText;
      analysisSource = 'pipeline';
    }

    if (analysisSource === 'provided' && decodedText && snapshot.decodedHtml !== decodedText) {
      checks.push(makeCheck('decoded-html-consistency', false,
        '提供的解出文本与模板/密钥实际解出结果不一致（提供长度 ' + snapshot.decodedHtml.length +
        '，管线长度 ' + decodedText.length + '）'));
    } else if (analysisSource === 'provided') {
      checks.push(makeCheck('decoded-html-consistency', true));
    }

    var structure;
    if (analysisText !== null) {
      structure = analyzeDecodedHtml(analysisText);
    } else {
      structure = {
        hits: { titleHit: false, headHit: false, bodyHit: false },
        head: { keptTags: {}, discardedTags: {}, keptCount: 0, discardedCount: 0, nonElementNodeCount: 0 },
        bodyScripts: { strippedCount: 0, externalCount: 0, inlineCount: 0, blankInlineSkipped: 0, countsConsistent: true },
        replayRisk: {
          verdict: 'unavailable',
          replayable: false,
          reason: '解码管线失败且未提供 decodedHtml，无法评估重放风险面',
          entries: [],
          externalCount: 0,
          inlineCount: 0,
          totalCollected: 0,
          countsConsistent: true
        }
      };
    }

    checks.push(makeCheck('title-hit', structure.hits.titleHit,
      structure.hits.titleHit ? undefined : '解出文本未命中 <title>'));
    checks.push(makeCheck('head-hit', structure.hits.headHit,
      structure.hits.headHit ? undefined : '解出文本未命中 <head>'));

    if (!structure.hits.bodyHit) {
      degraded = true;
      checks.push(makeCheck('body-present', false, '解出文本缺少 <body>，审计降级，重放风险面标注为“无 body、不重放”'));
    } else {
      checks.push(makeCheck('body-present', true));
    }

    checks.push(makeCheck('script-counts-consistent', structure.bodyScripts.countsConsistent,
      structure.bodyScripts.countsConsistent ? undefined : '外链/内联计数之和与剥离总数不一致'));

    var status = hardFail ? 'fail' : degraded ? 'degraded' : 'pass';

    return {
      schemaVersion: 1,
      status: status,
      checks: checks,
      decoding: {
        templateCount: templates.length,
        expectedTemplateCount: expectedIds ? expectedIds.length : templates.length,
        missingTemplateIds: missingTemplateIds,
        emptyTemplateIds: emptyTemplateIds,
        concatenatedBase64Length: concat.length,
        validBase64: !!b64.ok,
        decodedByteCount: decodedByteCount,
        xorKeyLength: keyBytes.length,
        utf8Decoded: utf8Decoded,
        decodedTextLength: decodedText.length
      },
      structure: {
        titleHit: structure.hits.titleHit,
        headHit: structure.hits.headHit,
        bodyHit: structure.hits.bodyHit,
        head: structure.head,
        bodyScripts: structure.bodyScripts
      },
      replayRisk: structure.replayRisk,
      analysis: {
        source: analysisSource
      }
    };
  }

  return {
    auditDecodeSnapshot: auditDecodeSnapshot,
    analyzeDecodedHtml: analyzeDecodedHtml,
    _internals: {
      decodeBase64: decodeBase64,
      parseTopLevelElements: parseTopLevelElements
    }
  };
});
