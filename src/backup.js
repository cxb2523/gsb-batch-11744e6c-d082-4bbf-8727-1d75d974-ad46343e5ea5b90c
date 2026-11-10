/* ============ backup: 加密备份导出 / 导入（.tvcbak） ============ */

var BK_MAGIC = new Uint8Array([84, 86, 67, 66, 65, 75, 49, 0]); /* TVCBAK1\0 */
var BK_VERSION = 1;
var BK_ITER = 200000;

async function bkDerive(password, salt, bytes) {
  var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: BK_ITER, hash: 'SHA-256' }, base, bytes * 8);
}

function bkXor(data, key) {
  var out = new Uint8Array(data.length);
  for (var i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}

function bkRc4(data, key) {
  var s = new Uint8Array(256), j = 0, i = 0;
  for (i = 0; i < 256; i++) s[i] = i;
  for (i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; var t = s[i]; s[i] = s[j]; s[j] = t; }
  var out = new Uint8Array(data.length);
  i = 0; j = 0;
  for (var k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    var tmp = s[i]; s[i] = s[j]; s[j] = tmp;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

async function gzip(data) {
  if (!G.CompressionStream) throw new Error('浏览器不支持 CompressionStream，请使用 HTTPS 或新版浏览器');
  var cs = new G.CompressionStream('gzip');
  var stream = new Blob([data]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data) {
  if (!G.DecompressionStream) throw new Error('浏览器不支持 DecompressionStream');
  var ds = new G.DecompressionStream('gzip');
  var stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bkPayload() {
  return {
    magic: 'TVCBAK1',
    v: BK_VERSION,
    ts: Date.now(),
    data: {
      history: S.history,
      favorites: S.favs,
      settings: S.settings,
      sources: S.sources,
      positions: lsGet(POS_KEY) || {}
    }
  };
}

async function bkExport(password) {
  if (!password || password.length < 4) { toast('密码至少 4 位'); return; }
  try {
    var raw = new TextEncoder().encode(JSON.stringify(bkPayload()));
    var gz = await gzip(raw);

    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var bits = new Uint8Array(await bkDerive(password, salt, 64));

    var body = bkRc4(bkXor(gz, bits.slice(0, 16)), bits.slice(16, 32));

    var key = await crypto.subtle.importKey('raw', bits.slice(32, 64), { name: 'AES-GCM' }, false, ['encrypt']);
    var header = new Uint8Array(8 + 1 + 1 + 16 + 12);
    header.set(BK_MAGIC, 0);
    header[8] = BK_VERSION;
    header[9] = 0;
    header.set(salt, 10);
    header.set(iv, 26);

    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: header }, key, body));

    var out = new Uint8Array(header.length + ct.length);
    out.set(header, 0);
    out.set(ct, header.length);

    var name = 'tvbox-backup-' + new Date().toISOString().slice(0, 10) + '.tvcbak';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'application/octet-stream' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('已导出 ' + name);
  } catch (e) {
    toast('导出失败：' + (e.message || e));
  }
}

async function bkImport(file, password) {
  try {
    var buf = new Uint8Array(await file.arrayBuffer());
    for (var i = 0; i < BK_MAGIC.length; i++) {
      if (buf[i] !== BK_MAGIC[i]) throw new Error('不是有效的备份文件');
    }
    var ver = buf[8];
    if (ver !== BK_VERSION) throw new Error('备份版本不支持：' + ver);

    var header = buf.slice(0, 34);
    var salt = buf.slice(10, 26);
    var iv = buf.slice(26, 38);
    var ct = buf.slice(38);

    var bits = new Uint8Array(await bkDerive(password, salt, 64));
    var key = await crypto.subtle.importKey('raw', bits.slice(32, 64), { name: 'AES-GCM' }, false, ['decrypt']);
    var body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, additionalData: header }, key, ct));

    var gz = bkRc4(bkXor(body, bits.slice(0, 16)), bits.slice(16, 32));
    var json = JSON.parse(new TextDecoder().decode(await gunzip(gz)));
    if (!json || !json.data) throw new Error('备份内容为空');

    var d = json.data;
    if (Array.isArray(d.history)) S.history = d.history;
    if (Array.isArray(d.favorites)) S.favs = d.favorites;
    if (d.settings) Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (d.settings[k] !== undefined) S.settings[k] = d.settings[k]; });
    if (Array.isArray(d.sources) && d.sources.length) S.sources = d.sources;
    if (d.positions) lsSet(POS_KEY, d.positions);

    lsSet(HISTORY_KEY, S.history);
    lsSet(FAV_KEY, S.favs);
    saveSettings(); saveSources();

    applyTheme(S.settings.theme);
    renderHome(); renderSettings();
    toast('已恢复：' + S.history.length + ' 条历史、' + S.favs.length + ' 个收藏');
  } catch (e) {
    toast('导入失败：' + (e.message || e));
  }
}
