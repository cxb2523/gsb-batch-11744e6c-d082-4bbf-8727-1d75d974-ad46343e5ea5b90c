/* ============ player: 播放 / 选集 / 控制 / 手势 / 跳广告 ============ */

var POS_KEY = 'tvbox_pos';

function posMap() { return lsGet(POS_KEY) || {}; }
function savePos(item, from, ep, time) {
  if (!S.settings.rememberPos) return;
  var m = posMap(), k = item._sourceKey + ':' + item.vod_id;
  m[k] = { from: from, ep: ep, time: time, t: Date.now() };
  var keys = Object.keys(m);
  if (keys.length > 200) { keys.sort(function (a, b) { return m[a].t - m[b].t; }); delete m[keys[0]]; }
  lsSet(POS_KEY, m);
}

function openPlayer(item, opt) {
  opt = opt || {};
  var P = S.player;
  P.item = item;
  P.from = '';
  P.ep = 0;
  P.groups = {};
  P.order = [];
  P.hls && P.hls.destroy();
  P.hls = null;

  showPlayer(true);
  setPlayerTitle(item.vod_name || '播放');
  var stage = S.root.querySelector('#plStage');
  var overlay = S.root.querySelector('#plOverlay');
  overlay.innerHTML = '<div class="pl-loading"><div class="spinner"></div><div>加载中…</div></div>';

  var src = S.sources.find(function (s) { return s.key === item._sourceKey; });
  var detailP = src && item.vod_id ? apiDetail(src, item.vod_id) : Promise.resolve(null);

  detailP.then(function (detail) {
    var pu = (detail && detail.vod_play_url) || item.vod_play_url || '';
    var pf = (detail && detail.vod_play_from) || item.vod_play_from || '';
    var parsed = parsePlay(pu, pf);
    P.groups = parsed.groups;
    P.order = parsed.order;
    if (!P.order.length) {
      overlay.innerHTML = '<div class="pl-error"><div>暂无播放链接</div><button class="btn ghost" data-act="pl-close">返回</button></div>';
      return;
    }
    var want = opt.playFrom && P.groups[opt.playFrom] ? opt.playFrom : pickDefaultFrom(P.order, P.groups);
    P.from = want;
    var eps = P.groups[want] || [];
    var epIdx = opt.episode || 0;
    if (opt.episodeName) {
      var fi = eps.findIndex(function (x) { return x.name === opt.episodeName; });
      if (fi >= 0) epIdx = fi;
    }
    if (epIdx < 0 || epIdx >= eps.length) epIdx = 0;
    P.ep = epIdx;
    playEpisode(true, opt.position);
    renderEps();
    renderLines();
  });
}

function setPlayerTitle(t) {
  var el = S.root.querySelector('#plTitle');
  if (el) el.textContent = t;
}

function showPlayer(on) {
  var el = S.root.querySelector('#player');
  el.classList.toggle('open', !!on);
  if (!on) {
    var v = S.root.querySelector('#video');
    v.pause();
    S.player.hls && S.player.hls.destroy();
    S.player.hls = null;
    stopAdWatch();
    document.removeEventListener('keydown', onKey);
  } else {
    document.addEventListener('keydown', onKey);
  }
}

function playEpisode(auto, startAt) {
  var P = S.player;
  var eps = P.groups[P.from] || [];
  var ep = eps[P.ep];
  if (!ep) { toast('该集暂无播放链接'); return; }

  var v = S.root.querySelector('#video');
  var stage = S.root.querySelector('#plStage');
  var overlay = S.root.querySelector('#plOverlay');
  if (overlay) overlay.innerHTML = '';

  P.hls && P.hls.destroy();
  P.hls = null;
  v.pause();
  v.removeAttribute('src');
  v.load();

  var url = ep.url;
  var isHls = isHlsUrl(url);

  function afterLoad() {
    v.playbackRate = S.settings.speed || 1;
    applyRatio(S.settings.ratio || 'auto');
    if (startAt > 0 && isFinite(v.duration) && startAt < v.duration - 3) {
      v.currentTime = startAt;
    } else if (S.settings.skipStart > 0) {
      setTimeout(function () { if (isFinite(v.duration) && v.duration > S.settings.skipStart + 5) v.currentTime = S.settings.skipStart; }, 300);
    }
    if (auto) v.play().catch(function () {});
    startAdWatch();
  }

  if (isHls && G.Hls && G.Hls.isSupported()) {
    P.hls = new G.Hls({ enableWorker: true, lowLatencyMode: false });
    P.hls.loadSource(url);
    P.hls.attachMedia(v);
    P.hls.on(G.Hls.Events.MANIFEST_PARSED, function () { afterLoad(); });
    P.hls.on(G.Hls.Events.ERROR, function (e, data) {
      if (data && data.fatal) {
        if (data.type === 'networkError') P.hls.startLoad();
        else if (data.type === 'mediaError') P.hls.recoverMediaError();
        else {
          overlay.innerHTML = '<div class="pl-error"><div>播放失败：' + esc(data.details || '') + '</div>' +
            '<div class="pl-error-actions"><button class="btn ghost" data-act="pl-retry">重试</button>' +
            '<button class="btn ghost" data-act="pl-close">返回</button></div></div>';
        }
      }
    });
  } else {
    v.src = url;
    v.addEventListener('loadedmetadata', function once() {
      v.removeEventListener('loadedmetadata', once);
      afterLoad();
    });
  }

  setPlayerTitle(ep.name || S.player.item.vod_name);
  renderEps();
  highlightEp();
}

function renderEps() {
  var P = S.player;
  var box = S.root.querySelector('#epGrid');
  var eps = P.groups[P.from] || [];
  box.innerHTML = eps.map(function (e, i) {
    return '<button class="ep' + (i === P.ep ? ' on' : '') + '" data-act="ep" data-i="' + i + '">' + esc(e.name) + '</button>';
  }).join('');
}

function highlightEp() {
  var P = S.player;
  S.root.querySelectorAll('#epGrid .ep').forEach(function (b, i) {
    b.classList.toggle('on', i === P.ep);
  });
}

function renderLines() {
  var P = S.player;
  var box = S.root.querySelector('#lineTabs');
  if (P.order.length < 2) { box.style.display = 'none'; return; }
  box.style.display = '';
  box.innerHTML = P.order.map(function (n) {
    return '<button class="line' + (n === P.from ? ' on' : '') + '" data-act="line" data-name="' + esc(n) + '">' + esc(n) + '</button>';
  }).join('');
}

/* ---------- 控制条 ---------- */

var ctrlTimer = 0;

function bindPlayer() {
  var root = S.root;
  var v = root.querySelector('#video');
  var wrap = root.querySelector('#player');

  function bump() {
    wrap.classList.add('show-ctrl');
    clearTimeout(ctrlTimer);
    ctrlTimer = setTimeout(function () { wrap.classList.remove('show-ctrl'); }, 3000);
  }
  wrap.addEventListener('mousemove', bump);
  wrap.addEventListener('touchstart', bump, { passive: true });
  wrap.addEventListener('click', function (e) {
    if (e.target.closest('.pl-bar, .pl-top, .pl-panel')) return;
    bump();
  });

  var bar = root.querySelector('#seekBar');
  function syncBar() {
    var d = v.duration || 0;
    var p = d ? (v.currentTime / d) * 100 : 0;
    bar.value = p;
    bar.style.setProperty('--p', p + '%');
    root.querySelector('#tCur').textContent = fmtTime(v.currentTime);
    root.querySelector('#tDur').textContent = fmtTime(d);
  }
  v.addEventListener('timeupdate', syncBar);
  v.addEventListener('loadedmetadata', syncBar);
  v.addEventListener('play', function () { root.querySelector('#btnPlay').innerHTML = icon('pause'); bump(); });
  v.addEventListener('pause', function () { root.querySelector('#btnPlay').innerHTML = icon('play'); wrap.classList.add('show-ctrl'); });
  v.addEventListener('error', function () {
    S.root.querySelector('#plOverlay').innerHTML = '<div class="pl-error"><div>播放失败，可能是直链失效</div>' +
      '<div class="pl-error-actions"><button class="btn ghost" data-act="pl-retry">重试</button>' +
      '<button class="btn ghost" data-act="pl-close">返回</button></div></div>';
  });
  v.addEventListener('ended', function () {
    if (S.settings.playMode === 'loop') {
      var eps = S.player.groups[S.player.from] || [];
      if (S.player.ep < eps.length - 1) { S.player.ep++; playEpisode(true); }
    }
  });

  bar.addEventListener('input', function () {
    if (v.duration) v.currentTime = (bar.value / 100) * v.duration;
  });

  /* 手势 */
  var sx = 0, sy = 0, st = 0, startT = 0, startVol = 1, moved = false, lastTap = 0;
  var stage = root.querySelector('#plStage');
  stage.addEventListener('touchstart', function (e) {
    if (!S.settings.gestures) return;
    var t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
    startT = v.currentTime; startVol = v.volume; moved = false;
    if (S.settings.longPress) {
      S.player.lpTimer = setTimeout(function () {
        if (v.playbackRate !== 2) { v.playbackRate = 2; S.player.lpOn = true; toast('2 倍速播放中'); }
      }, 500);
    }
  }, { passive: true });

  stage.addEventListener('touchmove', function (e) {
    if (!S.settings.gestures) return;
    var t = e.touches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) { moved = true; clearTimeout(S.player.lpTimer); }
    if (Math.abs(dx) > Math.abs(dy)) {
      var dt = (dx / stage.clientWidth) * 120;
      var nt = Math.max(0, Math.min(v.duration || 0, startT + dt));
      toast((dt > 0 ? '快进 ' : '快退 ') + fmtTime(Math.abs(dt)) + ' → ' + fmtTime(nt));
      S.player.pendingSeek = nt;
    } else if (Math.abs(dy) > 20) {
      var nv = Math.max(0, Math.min(1, startVol - dy / stage.clientHeight));
      v.volume = nv;
      toast('音量 ' + Math.round(nv * 100) + '%');
    }
  }, { passive: true });

  stage.addEventListener('touchend', function () {
    clearTimeout(S.player.lpTimer);
    if (S.player.lpOn) { v.playbackRate = S.settings.speed || 1; S.player.lpOn = false; return; }
    if (S.player.pendingSeek !== undefined) { v.currentTime = S.player.pendingSeek; S.player.pendingSeek = undefined; return; }
    if (!moved) {
      var now = Date.now();
      if (now - lastTap < 280) {
        toggleFull();
        lastTap = 0;
      } else lastTap = now;
    }
  }, { passive: true });
}

function onKey(e) {
  var v = S.root && S.root.querySelector('#video');
  if (!v || !S.root.querySelector('#player').classList.contains('open')) return;
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  var k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
  else if (k === 'arrowleft') { v.currentTime = Math.max(0, v.currentTime - 10); }
  else if (k === 'arrowright') { v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); }
  else if (k === 'j') { v.currentTime = Math.max(0, v.currentTime - 60); }
  else if (k === 'l') { v.currentTime = Math.min(v.duration || 0, v.currentTime + 60); }
  else if (k === 'arrowup') { v.volume = Math.min(1, v.volume + 0.1); }
  else if (k === 'arrowdown') { v.volume = Math.max(0, v.volume - 0.1); }
  else if (k === 'm') { v.muted = !v.muted; }
  else if (k === 'f') { toggleFull(); }
  else if (k === 'escape') { if (document.fullscreenElement) document.exitFullscreen(); else showPlayer(false); }
}

function toggleFull() {
  var wrap = S.root.querySelector('#player');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
}

function applyRatio(r) {
  var wrap = S.root.querySelector('#player');
  wrap.setAttribute('data-ratio', r || 'auto');
  S.root.querySelectorAll('.ratio-opt').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-ratio') === (r || 'auto'));
  });
}

/* ---------- 跳广告：三色按钮 + 红金配色 ---------- */

var adCanvas = null, adCtx = null, adTimer = 0, adHits = 0, adCooldown = 0, adSkippedAt = 0;

function startAdWatch() {
  stopAdWatch();
  if (!S.settings.adSkip) return;
  adHits = 0;
  var v = S.root.querySelector('#video');
  adTimer = setInterval(function () {
    if (v.paused || !v.videoWidth) return;
    if (Date.now() < adCooldown) return;
    if (!adCanvas) { adCanvas = document.createElement('canvas'); adCanvas.width = 320; adCanvas.height = 180; adCtx = adCanvas.getContext('2d', { willReadFrequently: true }); }
    try { adCtx.drawImage(v, 0, 0, 320, 180); } catch (e) { return; }
    var score = adScore(adCtx.getImageData(0, 0, 320, 180));
    if (score > 0.72) {
      adHits++;
      if (adHits >= 2) skipAd();
    } else {
      adHits = 0;
    }
  }, 1000);
}

function stopAdWatch() { clearInterval(adTimer); adTimer = 0; }

function adScore(img) {
  var d = img.data, w = 320, h = 180;
  var blue = 0, yellow = 0, green = 0, red = 0, gold = 0, total = 0;
  var x0 = Math.floor(w * 0.30), x1 = Math.floor(w * 0.70);
  var y0 = Math.floor(h * 0.35), y1 = Math.floor(h * 0.72);
  for (var y = 0; y < h; y += 2) {
    for (var x = 0; x < w; x += 2) {
      var i = (y * w + x) * 4;
      var r = d[i], g = d[i + 1], b = d[i + 2];
      total++;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
      var sat = mx === 0 ? 0 : df / mx;
      if (sat > 0.35 && mx > 70) {
        var hue = 0;
        if (df === 0) hue = 0;
        else if (mx === r) hue = 60 * (((g - b) / df) % 6);
        else if (mx === g) hue = 60 * (((b - r) / df) + 2);
        else hue = 60 * (((r - g) / df) + 4);
        if (hue < 0) hue += 360;
        if (hue >= 190 && hue <= 260) blue++;
        else if (hue >= 40 && hue <= 68) yellow++;
        else if (hue >= 80 && hue <= 170) green++;
        if (hue <= 24 || hue >= 336) {
          if (mx > 110) red++;
          if (hue >= 26 && hue <= 60 && mx > 120) gold++;
        } else if (hue > 26 && hue <= 60 && mx > 130 && sat > 0.4) gold++;
      }
    }
  }
  var inBtn = 0, btnTot = 0;
  for (var yy = y0; yy < y1; yy += 2) {
    for (var xx = x0; xx < x1; xx += 2) {
      var j = (yy * w + xx) * 4;
      var rr = d[j], gg = d[j + 1], bb = d[j + 2];
      var m2 = Math.max(rr, gg, bb), n2 = Math.min(rr, gg, bb);
      if (m2 > 70 && (m2 - n2) / m2 > 0.35) inBtn++;
      btnTot++;
    }
  }
  var btnRatio = btnTot ? inBtn / btnTot : 0;
  var colorRatio = total ? (red + gold) / total : 0;
  return 0.6 * Math.min(1, btnRatio * 3) + 0.4 * Math.min(1, colorRatio * 1.4);
}

function skipAd() {
  var v = S.root.querySelector('#video');
  if (!v || !isFinite(v.currentTime)) return;
  var from = v.currentTime, to = Math.min(v.duration || from + 15, from + 15);
  v.currentTime = to;
  adCooldown = Date.now() + 8000;
  adSkippedAt = Date.now();
  adHits = 0;
  var tip = S.root.querySelector('#adTip');
  tip.innerHTML = '已跳过广告 ' + fmtTime(from) + ' → ' + fmtTime(to) +
    ' <button data-act="ad-undo" data-from="' + from + '">取消</button>';
  tip.classList.add('show');
  setTimeout(function () { tip.classList.remove('show'); }, 8000);
}
