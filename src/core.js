/* ============ core: 常量 / 工具 / 存储 / 主题 / 网络 / 解析 ============ */

var VERSION = '2.0.1';

var DEFAULT_SOURCES = [
  { key: 'lzi',   name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod/',    type: 1, enabled: true, noProxy: true, search: true, cors: false },
  { key: 'bfzy',  name: '暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod/',       type: 1, enabled: true, noProxy: true, search: true, cors: false },
  { key: 'ffzy',  name: '非凡资源', api: 'https://cj.ffzyapi.com/api.php/provide/vod/',    type: 1, enabled: true, noProxy: true, search: true, cors: false },
  { key: 'hnzy',  name: '红牛资源', api: 'https://www.hongniuzy2.com/api.php/provide/vod/', type: 1, enabled: true, noProxy: true, search: true, cors: false },
  { key: 'jyzy',  name: '金鹰资源', api: 'https://jyzyapi.com/api.php/provide/vod/',       type: 1, enabled: true, noProxy: true, search: true, cors: false },
  { key: 'huya',  name: '虎牙资源', api: 'https://www.huyaapi.com/api.php/provide/vod/',   type: 1, enabled: true, noProxy: true, search: true, cors: false },
  { key: 'p2100', name: '飘零资源', api: 'https://p2100.net/api.php/provide/vod/',         type: 1, enabled: true, noProxy: true, search: true, cors: false }
];

var THEMES = {
  purple: { p: '#6750A4', onP: '#fff', pC: '#EADDFF', onPC: '#21005D', s: '#625B71', onS: '#fff', sC: '#E8DEF8', onSC: '#1D192B', t: '#7D5260', tC: '#FFD8E4' },
  yellow: { p: '#F9A825', onP: '#fff', pC: '#FFF8E1', onPC: '#3E2723', s: '#8D6E63', onS: '#fff', sC: '#F5F5DC', onSC: '#3E2723', t: '#E65100', tC: '#FFE0B2' },
  green:  { p: '#2E7D32', onP: '#fff', pC: '#E8F5E9', onPC: '#1B5E20', s: '#558B2F', onS: '#fff', sC: '#F1F8E9', onSC: '#33691E', t: '#00695C', tC: '#E0F2F1' },
  blue:   { p: '#1565C0', onP: '#fff', pC: '#E3F2FD', onPC: '#0D47A1', s: '#0277BD', onS: '#fff', sC: '#E1F5FE', onSC: '#01579B', t: '#00838F', tC: '#E0F7FA' }
};

var SETTINGS_KEY = 'tvbox_settings';
var HISTORY_KEY = 'tvbox_history';
var FAV_KEY = 'tvbox_favorites';
var SOURCES_KEY = 'tvbox_sources';

var DEFAULT_SETTINGS = {
  theme: 'purple', cors: 'auto', corsProxy: '',
  adSkip: true, rememberPos: true, longPress: true, autoFs: false, gestures: true,
  skipStart: 0, skipEnd: 0, speed: 1, ratio: 'auto', playMode: 'loop'
};

function lsGet(k) {
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}

function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function debounce(fn, ms) {
  var t = 0;
  return function () {
    var a = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, a); }, ms);
  };
}

/* ---------- 主题 ---------- */

function applyTheme(name) {
  var t = THEMES[name] || THEMES.purple;
  var r = S.root;
  if (!r) return;
  r.setAttribute('data-theme', name);
  var map = { '--p': t.p, '--on-p': t.onP, '--p-c': t.pC, '--on-p-c': t.onPC, '--s': t.s, '--on-s': t.onS, '--s-c': t.sC, '--on-s-c': t.onSC, '--t': t.t, '--t-c': t.tC };
  Object.keys(map).forEach(function (k) { r.style.setProperty(k, map[k]); });
  var opts = r.querySelectorAll('.theme-option');
  for (var i = 0; i < opts.length; i++) opts[i].classList.toggle('on', opts[i].getAttribute('data-theme') === name);
}

/* ---------- 网络 ---------- */

var CORS_MIRROR = 'https://corsmirror.com/v1?url=';

function proxyUrl(url) {
  var c = (S.settings.corsProxy || '').trim();
  if (c) return c.indexOf('{url}') >= 0 ? c.replace('{url}', encodeURIComponent(url)) : c + encodeURIComponent(url);
  return CORS_MIRROR + encodeURIComponent(url);
}

function fetchJson(url, timeout) {
  return new Promise(function (resolve, reject) {
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, timeout || 12000);
    fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
      .then(function (res) {
        clearTimeout(to);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (txt) { resolve(JSON.parse(txt)); })
      .catch(function (e) { clearTimeout(to); reject(e); });
  });
}

function apiFetch(url, src, timeout) {
  var mode = S.settings.cors || 'auto';
  if (mode === 'off') return fetchJson(url, timeout);
  if (mode === 'custom') return fetchJson(proxyUrl(url), 15000);
  var known = src && src.cors === false;
  if (!known) {
    return fetchJson(url, 4000).catch(function () { return fetchJson(proxyUrl(url), 15000); });
  }
  return fetchJson(proxyUrl(url), 15000);
}

function buildUrl(src, params) {
  var api = src.api.charAt(src.api.length - 1) === '/' ? src.api : src.api + '/';
  var qs = Object.keys(params).filter(function (k) {
    var v = params[k];
    return v !== undefined && v !== null && v !== '';
  }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  return api + (qs ? '?' + qs : '');
}

function apiList(src, page, wd, t) {
  var params = { ac: 'list', pg: page || 1 };
  if (wd) params.wd = wd;
  if (t) params.t = t;
  return apiFetch(buildUrl(src, params), src, 12000).then(function (data) {
    if (data && Array.isArray(data.list)) {
      return {
        ok: true,
        list: data.list.map(function (it) {
          it._source = src.name; it._sourceKey = src.key; it._api = src.api; return it;
        }),
        total: data.total || data.list.length,
        pagecount: data.pagecount || 1
      };
    }
    return { ok: false, list: [], total: 0, pagecount: 1 };
  }).catch(function (e) { return { ok: false, list: [], total: 0, pagecount: 1, err: String(e && e.message || e) }; });
}

function apiDetail(src, id) {
  return apiFetch(buildUrl(src, { ac: 'detail', ids: id }), src, 12000).then(function (data) {
    return data && data.list && data.list[0] ? data.list[0] : null;
  }).catch(function () { return null; });
}

function enabledSources() {
  return S.sources.filter(function (s) { return s.enabled !== false; });
}

/* ---------- 解析 ---------- */

function parseEpBlock(block) {
  var eps = [], pts = String(block || '').split('#');
  for (var i = 0; i < pts.length; i++) {
    var k = pts[i].indexOf('$');
    if (k > 0) {
      var name = pts[i].substring(0, k).trim();
      var url = pts[i].substring(k + 1).trim();
      if (url) eps.push({ name: name || '第' + (eps.length + 1) + '集', url: url });
    }
  }
  return eps;
}

// 返回 { order:[线路名], groups:{线路名:[{name,url}]} }
function parsePlay(playUrl, playFrom) {
  var groups = {}, order = [];
  var blocks = String(playUrl || '').split('$$$').filter(function (b) { return b.trim(); });
  var froms = playFrom ? String(playFrom).split('$$$') : null;

  if (froms && froms.length === blocks.length) {
    blocks.forEach(function (b, i) {
      var eps = parseEpBlock(b);
      if (eps.length) { groups[froms[i].trim()] = eps; order.push(froms[i].trim()); }
    });
    return { groups: groups, order: order };
  }

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.indexOf('$') === -1 && i + 1 < blocks.length && blocks[i + 1].indexOf('$') !== -1) {
      var nm = b.trim(), eps = parseEpBlock(blocks[i + 1]);
      if (eps.length) { groups[nm] = eps; order.push(nm); }
      i++;
    } else if (b.indexOf('$') !== -1) {
      var nm2 = '默认源' + (order.length + 1), eps2 = parseEpBlock(b);
      if (eps2.length) { groups[nm2] = eps2; order.push(nm2); }
    }
  }
  return { groups: groups, order: order };
}

function pickDefaultFrom(order, groups) {
  if (!order.length) return '';
  for (var i = 0; i < order.length; i++) if (/m3u8|hls/i.test(order[i])) return order[i];
  for (var j = 0; j < order.length; j++) if (/默认源2$/.test(order[j])) return order[j];
  for (var k = 0; k < order.length; k++) {
    var eps = groups[order[k]] || [];
    for (var m = 0; m < eps.length; m++) {
      if (/(\.m3u8|\/hls\/|[?&]v=m3u8)/i.test(eps[m].url || '')) return order[k];
    }
  }
  return order[0];
}

function isHlsUrl(url) {
  return /(\.m3u8|\/hls\/|[?&]v=m3u8)/i.test(url || '');
}
