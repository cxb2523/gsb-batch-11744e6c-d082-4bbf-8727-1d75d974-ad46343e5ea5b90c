/*!
 * TVBox 采集接口 SDK
 * 零依赖，封装苹果 CMS（MacCMS v10）标准 JSON 接口；与组件库共用同一套代理与线路解析规则。
 *
 * 仓库：https://github.com/silverbullet-liang/tvbox-center
 * 版权：Copyright (C) 2026 silverbullet-liang
 * 许可：AGPL-3.0-or-later（SPDX）
 *
 * 浏览器：
 *   <script src="https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-center@v2.0.0/dist/tvbox-sdk.min.js"></script>
 *   <script>
 *     const client = TVBoxSDK.create({ sources: [{ key:'lzi', name:'量子资源', api:'https://example.com/api.php/provide/vod/' }] });
 *     client.search('庆余年').then(list => console.log(list));
 *   </script>
 *
 * Node：
 *   const TVBoxSDK = require('./tvbox-sdk.min.js');
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.TVBoxSDK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '2.0.1';
  var TIMEOUT = 12000;
  var CORS_MIRROR = 'https://corsmirror.com/v1?url=';

  /* ---------- URL ---------- */

  function buildUrl(api, params) {
    var base = String(api || '');
    if (base.charAt(base.length - 1) !== '/') base += '/';
    var qs = Object.keys(params || {}).filter(function (k) {
      var v = params[k];
      return v !== undefined && v !== null && v !== '';
    }).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return base + (qs ? '?' + qs : '');
  }

  function proxyUrl(url, custom) {
    var c = String(custom || '').trim();
    if (c) return c.indexOf('{url}') >= 0 ? c.replace('{url}', encodeURIComponent(url)) : c + encodeURIComponent(url);
    return CORS_MIRROR + encodeURIComponent(url);
  }

  /* ---------- 请求 ---------- */

  function request(url, timeout) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('当前环境没有 fetch'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout || TIMEOUT) : 0;
    return fetch(url, {
      signal: ctrl ? ctrl.signal : undefined,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).then(function (res) {
      if (to) clearTimeout(to);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (txt) {
      try { return JSON.parse(txt); } catch (e) { throw new Error('返回不是 JSON'); }
    }).catch(function (e) {
      if (to) clearTimeout(to);
      throw e;
    });
  }

  function fetchByMode(url, src, opts) {
    opts = opts || {};
    var mode = opts.cors || 'auto';
    if (mode === 'off') return request(url, opts.timeout);
    if (mode === 'custom') return request(proxyUrl(url, opts.proxy), opts.timeout || 15000);
    var known = src && src.cors === false;
    if (!known) {
      return request(url, 4000).catch(function () {
        return request(proxyUrl(url, opts.proxy), 15000);
      });
    }
    return request(proxyUrl(url, opts.proxy), 15000);
  }

  /* ---------- 解析 ---------- */

  function parseEpisodes(block) {
    var eps = [], pts = String(block || '').split('#');
    for (var i = 0; i < pts.length; i++) {
      var k = pts[i].indexOf('$');
      if (k > 0) {
        var name = pts[i].substring(0, k).trim();
        var url = pts[i].substring(k + 1).trim();
        if (url) eps.push({ name: name || ('第' + (eps.length + 1) + '集'), url: url });
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
        var eps = parseEpisodes(b);
        if (eps.length) { groups[froms[i].trim()] = eps; order.push(froms[i].trim()); }
      });
      return { groups: groups, order: order };
    }

    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.indexOf('$') === -1 && i + 1 < blocks.length && blocks[i + 1].indexOf('$') !== -1) {
        var nm = b.trim(), eps = parseEpisodes(blocks[i + 1]);
        if (eps.length) { groups[nm] = eps; order.push(nm); }
        i++;
      } else if (b.indexOf('$') !== -1) {
        var nm2 = '默认源' + (order.length + 1), eps2 = parseEpisodes(b);
        if (eps2.length) { groups[nm2] = eps2; order.push(nm2); }
      }
    }
    return { groups: groups, order: order };
  }

  // 兼容旧 API：返回 { 线路名: [{name,url}] }
  function parsePlayUrls(playUrl, playFrom) {
    return parsePlay(playUrl, playFrom).groups;
  }

  // 多线路时优先 m3u8（通常是「默认源2」）
  function pickDefaultFrom(order, groups) {
    order = order || [];
    groups = groups || {};
    if (!order.length) return '';
    var i, j;
    for (i = 0; i < order.length; i++) if (/m3u8|hls/i.test(order[i])) return order[i];
    for (j = 0; j < order.length; j++) if (/默认源2$/.test(order[j])) return order[j];
    for (var k = 0; k < order.length; k++) {
      var eps = groups[order[k]] || [];
      for (var m = 0; m < eps.length; m++) {
        if (/(\.m3u8|\/hls\/|[?&]v=m3u8)/i.test(eps[m].url || '')) return order[k];
      }
    }
    return order[0];
  }

  /* ---------- 数据源 ---------- */

  function normalizeSource(src) {
    if (typeof src === 'string') return { key: src, name: src, api: src };
    src = src || {};
    return {
      key: src.key || src.name || src.api,
      name: src.name || src.api,
      api: src.api,
      type: src.type || 1,
      cors: src.cors,
      search: src.search !== false
    };
  }

  function Source(src, opts) {
    var s = normalizeSource(src);
    this.key = s.key;
    this.name = s.name;
    this.api = s.api;
    this.type = s.type;
    this.cors = s.cors;
    this.search = s.search;
    this.opts = opts || {};
  }

  Source.prototype.url = function (params) {
    return buildUrl(this.api, params);
  };

  // list({ page, wd, t }) → { ok, list, total, pagecount, error? }
  Source.prototype.list = function (o) {
    o = o || {};
    var params = { ac: 'list', pg: o.page || 1 };
    if (o.wd) params.wd = o.wd;
    if (o.t) params.t = o.t;
    var self = this;
    return fetchByMode(this.url(params), this, this.opts).then(function (data) {
      var list = data && Array.isArray(data.list) ? data.list : [];
      return {
        ok: true,
        list: list.map(function (it) {
          it._source = self.name; it._sourceKey = self.key; it._api = self.api;
          return it;
        }),
        total: (data && data.total) || list.length,
        pagecount: (data && data.pagecount) || 1
      };
    }).catch(function (e) {
      return { ok: false, list: [], total: 0, pagecount: 0, error: e.message };
    });
  };

  Source.prototype.detail = function (id) {
    return fetchByMode(this.url({ ac: 'detail', ids: id }), this, this.opts).then(function (data) {
      return data && data.list && data.list[0] ? data.list[0] : null;
    }).catch(function () { return null; });
  };

  Source.prototype.suggest = function (wd, limit) {
    return this.list({ wd: wd }).then(function (r) {
      var out = [], seen = {};
      r.list.forEach(function (it) {
        var n = it.vod_name;
        if (n && !seen[n] && out.length < (limit || 10)) { seen[n] = 1; out.push(n); }
      });
      return out;
    });
  };

  /* ---------- 多源客户端 ---------- */

  function Client(opts) {
    opts = opts || {};
    this.opts = { cors: opts.cors || 'auto', proxy: opts.proxy || '', timeout: opts.timeout || TIMEOUT };
    this.sources = (opts.sources || []).map(function (s) {
      return s instanceof Source ? s : new Source(s, this.opts);
    }, this);
  }

  Client.prototype.get = function (keyOrName) {
    for (var i = 0; i < this.sources.length; i++) {
      if (this.sources[i].key === keyOrName || this.sources[i].name === keyOrName) return this.sources[i];
    }
    return null;
  };

  Client.prototype.add = function (src) {
    var s = src instanceof Source ? src : new Source(src, this.opts);
    this.sources.push(s);
    return s;
  };

  // 单源列表（也接受 key 或 name）
  Client.prototype.list = function (key, o) {
    var s = this.get(key);
    return s ? s.list(o) : Promise.resolve({ ok: false, list: [], total: 0, pagecount: 0, error: '未找到数据源' });
  };

  // 单源详情
  Client.prototype.detail = function (key, id) {
    var s = this.get(key);
    return s ? s.detail(id) : Promise.resolve(null);
  };

  // 多源并行搜索，结果为各源拼接，每项带 _source / _sourceKey / _api
  Client.prototype.search = function (wd, o) {
    o = o || {};
    var page = o.page || 1, t = o.t || '';
    var list = this.sources.filter(function (s) { return s.search !== false; });
    return Promise.all(list.map(function (src) {
      return src.list({ page: page, wd: wd, t: t }).then(function (r) { return r.list; });
    })).then(function (groups) {
      var out = [], seen = {};
      groups.forEach(function (g) {
        g.forEach(function (it) {
          var k = it._sourceKey + ':' + it.vod_id;
          if (!seen[k]) { seen[k] = 1; out.push(it); }
        });
      });
      return out;
    });
  };

  Client.prototype.suggest = function (wd, limit) {
    return Promise.all(this.sources.map(function (src) {
      return src.suggest(wd, limit);
    })).then(function (groups) {
      var out = [], seen = {};
      groups.forEach(function (g) {
        g.forEach(function (n) {
          if (!seen[n] && out.length < (limit || 10)) { seen[n] = 1; out.push(n); }
        });
      });
      return out;
    });
  };

  /* ---------- 导出 ---------- */

  return {
    version: VERSION,
    DEFAULT_TIMEOUT: TIMEOUT,
    CORS_MIRROR: CORS_MIRROR,
    buildUrl: buildUrl,
    proxyUrl: proxyUrl,
    request: request,
    parseEpisodes: parseEpisodes,
    parsePlay: parsePlay,
    parsePlayUrls: parsePlayUrls,
    pickDefaultFrom: pickDefaultFrom,
    Source: Source,
    Client: Client,
    source: function (src, opts) { return new Source(src, opts); },
    create: function (opts) { return new Client(opts); }
  };
});
