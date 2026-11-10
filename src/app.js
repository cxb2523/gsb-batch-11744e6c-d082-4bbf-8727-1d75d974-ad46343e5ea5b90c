/* ============ app: 挂载 / 路由 / 事件 / 存储操作 ============ */

var APP_HTML = ''
  + '<div class="app">'
  + '  <header class="top"><div class="brand">TVBox</div>'
  + '    <div class="top-actions"><button class="icon-btn" data-act="open-settings" aria-label="设置">' + icon('settings') + '</button></div>'
  + '  </header>'
  + '  <main class="main">'
  + '    <section class="page on" id="pageHome">'
  + '      <div class="sec" id="homeHistory"><div class="sec-h"><h2>继续观看</h2></div><div class="hscroll"><div class="hs-list"></div></div></div>'
  + '      <div class="sec" id="homeBannerWrap"><div class="sec-h"><h2>热门推荐</h2><button class="link-btn" data-act="feed-refresh">换一批</button></div><div class="banner" id="homeBanner"></div></div>'
  + '      <div class="sec" id="homeFav"><div class="sec-h"><h2>我的收藏</h2></div><div class="hscroll"><div class="hs-list"></div></div></div>'
  + '      <div class="sec"><div class="sec-h"><h2>为你推荐</h2></div><div class="grid" id="homeGrid"></div></div>'
  + '      <div class="empty" id="homeEmpty"><div>还没有观看记录</div><div class="empty-sub">用顶部搜索找一部片子开始</div></div>'
  + '    </section>'
  + '    <section class="page" id="pageSearch">'
  + '      <div class="search-box"><input id="searchInput" type="search" placeholder="搜索影视名称" autocomplete="off" spellcheck="false">'
  + '        <button class="btn primary" data-act="search-go">搜索</button></div>'
  + '      <div class="grid" id="searchResult"></div>'
  + '      <button class="more" id="searchMore" data-act="search-more" style="display:none">加载更多</button>'
  + '    </section>'
  + '    <section class="page" id="pageSettings">'
  + '      <div class="sec"><div class="sec-h"><h2>外观</h2></div>'
  + '        <div class="theme-row">'
  + ['purple', 'yellow', 'green', 'blue'].map(function (t) {
      var c = THEMES[t];
      return '<button class="theme-option" data-act="theme" data-theme="' + t + '" aria-label="' + t + '"><i style="background:' + c.p + '"></i></button>';
    }).join('')
  + '        </div></div>'
  + '      <div class="sec"><div class="sec-h"><h2>数据源</h2></div><div class="rows" id="setSources"></div></div>'
  + '      <div class="sec"><div class="sec-h"><h2>跨域代理</h2></div>'
  + '        <div class="seg" id="setCors">'
  + '          <button class="seg-btn" data-act="cors" data-mode="auto">自动</button>'
  + '          <button class="seg-btn" data-act="cors" data-mode="off">关闭</button>'
  + '          <button class="seg-btn" data-act="cors" data-mode="custom">自定义</button>'
  + '        </div>'
  + '        <input class="text-input" id="corsInput" type="text" placeholder="https://your-proxy/?url={url}" autocomplete="off" spellcheck="false">'
  + '        <div class="hint">留空使用内置代理；{url} 会替换为目标地址。</div></div>'
  + '      <div class="sec"><div class="sec-h"><h2>播放行为</h2></div><div class="rows">'
  + '        <div class="row"><div class="row-main"><div class="row-t">自动跳过广告</div><div class="row-s">三色按钮 + 红金配色</div></div><button class="switch" id="swAdSkip" data-act="sw" data-key="adSkip"></button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">记忆播放位置</div></div><button class="switch" id="swRemember" data-act="sw" data-key="rememberPos"></button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">长按 2 倍速</div></div><button class="switch" id="swLongPress" data-act="sw" data-key="longPress"></button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">手势控制</div></div><button class="switch" id="swGesture" data-act="sw" data-key="gestures"></button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">自动全屏</div></div><button class="switch" id="swAutoFs" data-act="sw" data-key="autoFs"></button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">跳过片头</div><div class="row-s" id="skipStartV">未设置</div></div><button class="link-btn" data-act="skip-start">设置</button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">跳过片尾</div><div class="row-s" id="skipEndV">未设置</div></div><button class="link-btn" data-act="skip-end">设置</button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">默认倍速</div><div class="row-s" id="setSpeedV">1x</div></div><button class="link-btn" data-act="def-speed">更改</button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">默认画幅</div><div class="row-s" id="setRatioV">自动</div></div><button class="link-btn" data-act="def-ratio">更改</button></div>'
  + '      </div></div>'
  + '      <div class="sec"><div class="sec-h"><h2>备份与恢复</h2></div><div class="rows">'
  + '        <div class="row"><div class="row-main"><div class="row-t">导出备份</div><div class="row-s">历史 / 收藏 / 设置 / 数据源 / 播放位置</div></div><button class="link-btn" data-act="bk-export">导出</button></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">导入备份</div><div class="row-s">选择 .tvcbak 文件</div></div><button class="link-btn" data-act="bk-import">导入</button></div>'
  + '      </div><input type="file" id="bkFile" accept=".tvcbak" style="display:none">'
  + '      <div class="hint">AES-GCM 加密，密码不保存；导出/导入需要 HTTPS 或 localhost。</div></div>'
  + '      <div class="sec"><div class="sec-h"><h2>关于</h2></div>'
  + '        <div class="rows"><div class="row"><div class="row-main"><div class="row-t">TVBox 组件库</div><div class="row-s" id="verLine">v' + VERSION + '</div></div></div>'
  + '        <div class="row"><div class="row-main"><div class="row-t">许可</div><div class="row-s">AGPL-3.0-or-later</div></div></div></div>'
  + '        <div class="hint">数据均来自第三方公开接口，本站不存储视频文件。</div></div>'
  + '    </section>'
  + '  </main>'
  + '  <nav class="tabs">'
  + '    <button class="tab on" data-act="page" data-page="home">' + icon('home') + '<span>首页</span></button>'
  + '    <button class="tab" data-act="page" data-page="search">' + icon('search') + '<span>搜索</span></button>'
  + '    <button class="tab" data-act="page" data-page="settings">' + icon('settings') + '<span>设置</span></button>'
  + '  </nav>'
  + '  <div class="toast"></div>'
  + '</div>'
  + '<div class="player" id="player">'
  + '  <div class="pl-top"><button class="icon-btn" data-act="pl-close" aria-label="返回">' + icon('back') + '</button>'
  + '    <div class="pl-title" id="plTitle">播放</div>'
  + '    <button class="icon-btn wt-btn" data-act="wt-open" aria-label="一起看">' + icon('tv') + '<b id="wtBadge"></b></button>'
  + '    <button class="icon-btn" data-act="pl-cast" aria-label="投屏">' + icon('cast') + '</button></div>'
  + '  <div class="pl-stage" id="plStage"><video id="video" playsinline webkit-playsinline preload="metadata"></video><div class="pl-overlay" id="plOverlay"></div><div class="ad-tip" id="adTip"></div></div>'
  + '  <div class="pl-panel"><div class="line-tabs" id="lineTabs"></div><div class="ep-grid" id="epGrid"></div></div>'
  + '  <div class="pl-bar">'
  + '    <button class="icon-btn" id="btnPlay" data-act="pl-toggle">' + icon('play') + '</button>'
  + '    <span class="t" id="tCur">00:00</span>'
  + '    <div class="seek" id="seekBar" role="slider" tabindex="0"><i></i><b></b></div>'
  + '    <span class="t" id="tDur">00:00</span>'
  + '    <button class="chip" data-act="speed">1x</button>'
  + '    <button class="chip" data-act="ratio">画幅</button>'
  + '    <button class="icon-btn" data-act="pip" aria-label="画中画">' + icon('pip') + '</button>'
  + '    <button class="icon-btn" data-act="full" aria-label="全屏">' + icon('full') + '</button>'
  + '  </div>'
  + '  <aside class="wt-panel" id="wtPanel">'
  + '    <div class="wt-head"><span class="wt-title">一起看 <b id="wtRoom"></b></span><span class="wt-online" id="wtOnline"></span>'
  + '      <button class="icon-btn" data-act="wt-share" aria-label="分享">' + icon('more') + '</button>'
  + '      <button class="icon-btn" data-act="wt-close" aria-label="关闭">' + icon('close') + '</button></div>'
  + '    <div class="wt-list" id="wtList"></div>'
  + '    <div class="wt-sync" id="wtSyncBar" style="display:none"></div>'
  + '    <div class="wt-input"><input id="wtInput" type="text" placeholder="说点什么" maxlength="500" autocomplete="off">'
  + '      <button class="wt-send" data-act="wt-send">发送</button>'
  + '      <button class="wt-sync-btn" data-act="wt-sync">同步</button></div>'
  + '  </aside>'
  + '</div>';

var S = {
  root: null,
  settings: null,
  sources: [],
  history: [],
  favs: [],
  feed: null,
  index: {},
  page: 'home',
  search: { q: '', items: [], page: 1, loading: false, hasMore: false },
  player: { item: null, groups: {}, order: [], from: '', ep: 0, hls: null, lpTimer: 0, lpOn: false, pendingSeek: undefined }
};

/* ---------- 数据 ---------- */

function loadData() {
  var st = lsGet(SETTINGS_KEY) || {};
  S.settings = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    S.settings[k] = st[k] !== undefined ? st[k] : DEFAULT_SETTINGS[k];
  });
  S.history = lsGet(HISTORY_KEY) || [];
  S.favs = lsGet(FAV_KEY) || [];

  var saved = lsGet(SOURCES_KEY) || [];
  S.sources = DEFAULT_SOURCES.map(function (d) {
    var hit = Array.isArray(saved) ? saved.filter(function (x) { return x.key === d.key; })[0] : null;
    var s = JSON.parse(JSON.stringify(d));
    if (hit && hit.enabled !== undefined) s.enabled = hit.enabled;
    return s;
  });
  if (Array.isArray(saved)) {
    saved.filter(function (x) { return x.custom; }).forEach(function (x) { S.sources.push(x); });
  }
}

function saveSettings() { lsSet(SETTINGS_KEY, S.settings); }
function saveSources() {
  lsSet(SOURCES_KEY, S.sources.map(function (s) {
    return s.custom ? s : { key: s.key, enabled: s.enabled };
  }));
}

function remember(item, from, ep, time) {
  S.history = S.history.filter(function (x) { return !(x._sourceKey === item._sourceKey && x.vod_id === item.vod_id); });
  var rec = Object.assign({}, item, { _from: from, _ep: ep, _time: time, _at: Date.now() });
  S.history.unshift(rec);
  S.history = S.history.slice(0, 60);
  lsSet(HISTORY_KEY, S.history);
}

function isFav(item) {
  return S.favs.some(function (x) { return x._sourceKey === item._sourceKey && x.vod_id === item.vod_id; });
}

function toggleFav(item) {
  if (!item) return;
  if (isFav(item)) {
    S.favs = S.favs.filter(function (x) { return !(x._sourceKey === item._sourceKey && x.vod_id === item.vod_id); });
    toast('已取消收藏');
  } else {
    S.favs.unshift(Object.assign({}, item, { _at: Date.now() }));
    toast('已收藏');
  }
  lsSet(FAV_KEY, S.favs);
}

function itemByKey(k) { return S.index[k] || null; }
function regIndex(items) {
  (items || []).forEach(function (it) { if (it && it.vod_id) S.index[it._sourceKey + ':' + it.vod_id] = it; });
}

/* ---------- 路由 ---------- */

var PAGE_IDS = { home: 'pageHome', search: 'pageSearch', settings: 'pageSettings' };

function switchPage(p) {
  if (!PAGE_IDS[p]) return;
  S.page = p;
  S.root.querySelectorAll('.page').forEach(function (el) {
    el.classList.toggle('on', el.id === PAGE_IDS[p]);
  });
  S.root.querySelectorAll('.tab').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-page') === p);
  });
  if (p === 'settings') renderSettings();
  if (p === 'search') setTimeout(function () {
    var i = S.root.querySelector('#searchInput');
    if (i && !i.value) i.focus();
  }, 60);
}

function playItem(item, opt) {
  if (!item) return;
  remember(item, '', 0, 0);
  openPlayer(item, opt || {});
  if (S.settings.autoFs) setTimeout(toggleFull, 300);
}

/* ---------- 事件 ---------- */

function onAct(e) {
  var el = e.target.closest('[data-act]');
  if (!el) {
    var card = e.target.closest('[data-key]');
    if (card) {
      var it0 = itemByKey(card.getAttribute('data-key'));
      if (it0) playItem(it0);
    }
    return;
  }
  var act = el.getAttribute('data-act');

  if (act === 'page') { switchPage(el.getAttribute('data-page')); return; }
  if (act === 'open-settings') { switchPage('settings'); return; }
  if (act === 'feed-refresh') { S.feed = null; try { localStorage.removeItem(FEED_KEY); } catch (e2) {} loadFeed(true); return; }

  if (act === 'search-go') { doSearch(S.root.querySelector('#searchInput').value); return; }
  if (act === 'search-more') { doSearch(S.search.q, true); return; }

  if (act === 'theme') {
    S.settings.theme = el.getAttribute('data-theme');
    saveSettings(); applyTheme(S.settings.theme); renderSettings(); toast('主题已切换'); return;
  }
  if (act === 'toggle-src') {
    var i = parseInt(el.getAttribute('data-i'), 10);
    S.sources[i].enabled = !S.sources[i].enabled;
    saveSources(); renderSettings(); return;
  }
  if (act === 'cors') {
    S.settings.cors = el.getAttribute('data-mode');
    saveSettings(); renderSettings();
    toast(S.settings.cors === 'off' ? '已关闭代理' : S.settings.cors === 'custom' ? '使用自定义代理' : '自动选择代理');
    return;
  }
  if (act === 'sw') {
    var key = el.getAttribute('data-key');
    S.settings[key] = !S.settings[key];
    saveSettings(); renderSettings();
    if (key === 'adSkip' && !S.settings.adSkip) stopAdWatch();
    return;
  }
  if (act === 'skip-start' || act === 'skip-end') {
    pickNumber(act === 'skip-start' ? '跳过片头（秒）' : '跳过片尾（秒）', act === 'skip-start' ? S.settings.skipStart : S.settings.skipEnd, function (v) {
      S.settings[act === 'skip-start' ? 'skipStart' : 'skipEnd'] = v;
      saveSettings(); renderSettings();
    });
    return;
  }
  if (act === 'def-speed') {
    pickOption('默认倍速', [0.5, 0.75, 1, 1.25, 1.5, 2], S.settings.speed, function (v) {
      S.settings.speed = v; saveSettings(); renderSettings();
      var video = S.root.querySelector('#video');
      if (video) video.playbackRate = v;
      S.root.querySelector('[data-act="speed"]').textContent = v + 'x';
    }, 'x');
    return;
  }
  if (act === 'def-ratio') { pickRatio(function (v) { S.settings.ratio = v; saveSettings(); renderSettings(); applyRatio(v); }); return; }

  if (act === 'pl-close') { showPlayer(false); return; }
  if (act === 'pl-toggle') {
    var v = S.root.querySelector('#video');
    if (v.paused) v.play().catch(function () {}); else v.pause();
    return;
  }
  if (act === 'pl-retry') { playEpisode(true); return; }
  if (act === 'ep') { S.player.ep = parseInt(el.getAttribute('data-i'), 10); playEpisode(true); highlightEp(); return; }
  if (act === 'line') {
    S.player.from = el.getAttribute('data-name');
    S.player.ep = 0; renderLines(); playEpisode(true); return;
  }
  if (act === 'speed') {
    var video2 = S.root.querySelector('#video');
    pickOption('播放速度', [0.5, 0.75, 1, 1.25, 1.5, 2], video2.playbackRate, function (val) {
      video2.playbackRate = val;
      S.settings.speed = val; saveSettings();
      S.root.querySelector('[data-act="speed"]').textContent = val + 'x';
    }, 'x');
    return;
  }
  if (act === 'ratio') { pickRatio(function (v) { applyRatio(v); S.settings.ratio = v; saveSettings(); }); return; }
  if (act === 'full') { toggleFull(); return; }
  if (act === 'pip') {
    var pv = S.root.querySelector('#video');
    if (document.pictureInPictureElement) { document.exitPictureInPicture(); }
    else if (pv.requestPictureInPicture) { pv.requestPictureInPicture().catch(function () { toast('当前浏览器不支持画中画'); }); }
    else toast('当前浏览器不支持画中画');
    return;
  }
  if (act === 'pl-cast') { startCast(); return; }
  if (act === 'fav-current') { toggleFav(S.player.item); return; }
  if (act === 'wt-open') { wtEnter(S.player.item); return; }
  if (act === 'wt-close') { wtLeave(); return; }
  if (act === 'wt-sync') { wtSync(); return; }
  if (act === 'wt-follow') { wtFollow(); return; }
  if (act === 'wt-share') { wtShare(); return; }
  if (act === 'wt-send') { wtSend(S.root.querySelector('#wtInput').value); S.root.querySelector('#wtInput').value = ''; return; }
  if (act === 'bk-export') { askPassword('导出备份（设置密码）', function (pw) { bkExport(pw); }); return; }
  if (act === 'bk-import') { S.root.querySelector('#bkFile').click(); return; }
  if (act === 'ad-undo') {
    var video3 = S.root.querySelector('#video');
    video3.currentTime = parseFloat(el.getAttribute('data-from')) || 0;
    S.root.querySelector('#adTip').classList.remove('show');
    adCooldown = Date.now() + 60000;
    return;
  }
}

function askPassword(title, cb) {
  var s = sheet(title, '<input class="text-input" id="pwInput" type="password" placeholder="至少 4 位" autocomplete="new-password">' +
    '<div class="sheet-actions"><button class="btn ghost" data-x>取消</button><button class="btn primary" data-ok>确定</button></div>');
  var inp = s.el.querySelector('#pwInput');
  setTimeout(function () { inp.focus(); }, 80);
  s.el.querySelector('[data-x]').addEventListener('click', s.close);
  s.el.querySelector('[data-ok]').addEventListener('click', function () {
    var v = inp.value.trim();
    if (v.length < 4) { toast('密码至少 4 位'); return; }
    s.close(); cb(v);
  });
}

function pickOption(title, values, cur, cb, suffix) {
  var html = '<div class="opts">' + values.map(function (v) {
    return '<button class="opt' + (v === cur ? ' on' : '') + '" data-v="' + v + '">' + v + (suffix || '') + '</button>';
  }).join('') + '</div>';
  var s = sheet(title, html);
  s.el.querySelectorAll('.opt').forEach(function (b) {
    b.addEventListener('click', function () { s.close(); cb(parseFloat(b.getAttribute('data-v'))); });
  });
}

function pickRatio(cb) {
  var list = [['auto', '自动'], ['16:9', '16:9'], ['4:3', '4:3'], ['fill', '铺满'], ['fit', '适应']];
  var s = sheet('画幅', '<div class="opts">' + list.map(function (r) {
    return '<button class="opt" data-v="' + r[0] + '">' + r[1] + '</button>';
  }).join('') + '</div>');
  s.el.querySelectorAll('.opt').forEach(function (b) {
    b.addEventListener('click', function () { s.close(); cb(b.getAttribute('data-v')); });
  });
}

function pickNumber(title, cur, cb) {
  var s = sheet(title, '<div class="num-row"><button class="step" data-d="-10">-10</button>' +
    '<div class="num" id="numV">' + (cur || 0) + ' 秒</div><button class="step" data-d="10">+10</button></div>' +
    '<div class="sheet-actions"><button class="btn ghost" data-x>取消</button><button class="btn primary" data-ok>确定</button></div>');
  var n = cur || 0;
  var lab = s.el.querySelector('#numV');
  s.el.querySelectorAll('.step').forEach(function (b) {
    b.addEventListener('click', function () {
      n = Math.max(0, Math.min(600, n + parseInt(b.getAttribute('data-d'), 10)));
      lab.textContent = n + ' 秒';
    });
  });
  s.el.querySelector('[data-x]').addEventListener('click', s.close);
  s.el.querySelector('[data-ok]').addEventListener('click', function () { s.close(); cb(n); });
}

/* ---------- 投屏 ---------- */

function startCast() {
  var url = S.root.querySelector('#video').src;
  if (!url) { toast('请先播放'); return; }
  if (!G.cast || !G.cast.framework || !G.chrome || !G.chrome.cast) { toast('当前浏览器不支持投屏'); return; }
  try {
    var ctx = G.cast.framework.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: G.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: G.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });
    ctx.requestSession().then(function () {
      var session = ctx.getCurrentSession();
      var info = new G.chrome.cast.media.MediaInfo(url, 'application/x-mpegURL');
      var req = new G.chrome.cast.media.LoadRequest(info);
      return session.loadMedia(req);
    }).then(function () { toast('已投屏'); }).catch(function () { toast('投屏取消'); });
  } catch (e) { toast('投屏失败'); }
}

/* ---------- 挂载 ---------- */

function boot() {
  var root = S.root;

  bindPlayer();
  bindSeek();
  bindLongPress();

  root.addEventListener('click', onAct);
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var card = e.target.closest('[data-key]');
      if (card) { var it = itemByKey(card.getAttribute('data-key')); if (it) playItem(it); }
    }
  });

  var input = root.querySelector('#searchInput');
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(input.value); });
  input.addEventListener('input', debounce(function () { if (input.value.trim().length >= 2) doSearch(input.value); }, 600));

  var wtIn = root.querySelector('#wtInput');
  wtIn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { wtSend(wtIn.value); wtIn.value = ''; }
  });

  root.querySelector('#bkFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    askPassword('导入备份（输入密码）', function (pw) { bkImport(f, pw); });
  });

  root.querySelector('#corsInput').addEventListener('change', function () {
    S.settings.corsProxy = this.value.trim();
    saveSettings(); toast(this.value.trim() ? '代理地址已保存' : '已清空代理地址');
  });

  applyTheme(S.settings.theme);
  switchPage('home');
  renderHome();
  ensureHls().then(function () { loadFeed(); });

  root.querySelector('[data-act="speed"]').textContent = (S.settings.speed || 1) + 'x';
  applyRatio(S.settings.ratio);
}

function bindSeek() {
  var bar = S.root.querySelector('#seekBar');
  var v = S.root.querySelector('#video');
  var dragging = false;

  function seekTo(clientX) {
    var r = bar.getBoundingClientRect();
    if (!r.width) return;
    var p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    bar.style.setProperty('--p', (p * 100) + '%');
    if (v.duration) v.currentTime = p * v.duration;
  }

  bar.addEventListener('pointerdown', function (e) {
    dragging = true;
    try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    seekTo(e.clientX);
  });
  bar.addEventListener('pointermove', function (e) { if (dragging) seekTo(e.clientX); });
  bar.addEventListener('pointerup', function (e) {
    dragging = false;
    try { bar.releasePointerCapture(e.pointerId); } catch (err) {}
  });
}

function bindLongPress() {
  var timer = 0;
  S.root.addEventListener('pointerdown', function (e) {
    var card = e.target.closest('[data-key]');
    if (!card) return;
    timer = setTimeout(function () {
      var it = itemByKey(card.getAttribute('data-key'));
      if (!it) return;
      toggleFav(it);
      renderHome();
      if (navigator.vibrate) navigator.vibrate(20);
    }, 600);
  });
  ['pointerup', 'pointercancel', 'pointermove'].forEach(function (ev) {
    S.root.addEventListener(ev, function () { clearTimeout(timer); });
  });
}

function mount(target, options) {
  options = options || {};
  var host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) { console.error('[TVBox] mount target not found:', target); return null; }
  if (S.root) unmount();

  loadData();

  if (Array.isArray(options.sources) && options.sources.length) {
    S.sources = options.sources.map(function (s) {
      return Object.assign({
        key: s.key || s.name || s.api,
        name: s.name || s.api,
        api: s.api,
        type: s.type || 1,
        enabled: s.enabled !== false,
        search: s.search !== false
      }, s);
    });
  }
  if (options.theme && THEMES[options.theme]) S.settings.theme = options.theme;

  injectStyle();

  var root = document.createElement('div');
  root.id = 'tvbox-root';
  root.innerHTML = APP_HTML;
  host.appendChild(root);
  S.root = root;

  boot();
  return root;
}

function unmount() {
  if (!S.root) return;
  var v = S.root.querySelector('#video');
  if (v) { try { v.pause(); } catch (e) {} }
  if (S.player.hls) { try { S.player.hls.destroy(); } catch (e) {} S.player.hls = null; }
  clearInterval(bannerTimer);
  stopAdWatch();
  if (WT.client) { try { WT.client.end(true); } catch (e) {} WT.client = null; }
  document.removeEventListener('keydown', onKey);
  if (S.root.parentNode) S.root.parentNode.removeChild(S.root);
  S.root = null;
}

function injectStyle() {
  if (document.querySelector('style[data-tvbox="css"]')) return;
  var s = document.createElement('style');
  s.setAttribute('data-tvbox', 'css');
  s.textContent = CSS;
  document.head.appendChild(s);
}

function ensureHls() {
  if (G.Hls) return Promise.resolve();
  return new Promise(function (res) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
    s.onload = res; s.onerror = res;
    document.head.appendChild(s);
  });
}
