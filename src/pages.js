/* ============ pages: 首页 / 搜索 / 设置 ============ */

var FEED_TTL = 5 * 60 * 1000;
var FEED_KEY = 'tvbox_feed';

/* ---------- 首页 ---------- */

function renderHome() {
  var root = S.root;
  var histBox = root.querySelector('#homeHistory .hs-list');
  var favBox = root.querySelector('#homeFav .hs-list');
  var banner = root.querySelector('#homeBanner');
  var grid = root.querySelector('#homeGrid');
  var empty = root.querySelector('#homeEmpty');

  /* 历史 */
  var hist = S.history.slice(0, 20);
  root.querySelector('#homeHistory').style.display = hist.length ? '' : 'none';
  regIndex(hist);
  histBox.innerHTML = hist.map(function (it) { return cardHtml(it, 'sm'); }).join('');

  /* 收藏 */
  var favs = S.favs.slice(0, 20);
  root.querySelector('#homeFav').style.display = favs.length ? '' : 'none';
  regIndex(favs);
  favBox.innerHTML = favs.map(function (it) { return cardHtml(it, 'sm'); }).join('');

  /* 推荐 */
  var feed = S.feed || [];
  if (!feed.length) {
    grid.innerHTML = skelHtml(6, 'lg');
    banner.innerHTML = '';
    root.querySelector('#homeBannerWrap').style.display = 'none';
    empty.style.display = (hist.length || favs.length) ? 'none' : '';
    return;
  }

  var withPic = feed.filter(function (it) { return it.vod_pic && String(it.vod_pic).length > 12; });
  var picks = (withPic.length ? withPic : feed).slice(0, 5);

  root.querySelector('#homeBannerWrap').style.display = picks.length ? '' : 'none';
  banner.innerHTML = picks.map(function (it) {
    return '<div class="hb" data-key="' + esc(it._sourceKey + ':' + it.vod_id) + '">' +
      posterHtml(it, 'hb-poster') +
      '<div class="hb-mask"></div>' +
      '<div class="hb-info"><div class="hb-tag">' + esc(it.type_name || it._source || '推荐') + '</div>' +
      '<div class="hb-name">' + esc(it.vod_name || '') + '</div>' +
      '<div class="hb-meta">' + esc(it.vod_remarks || it.vod_year || '') + '</div></div></div>';
  }).join('');

  var rest = feed.slice(picks.length, picks.length + 24);
  regIndex(feed);
  grid.innerHTML = rest.map(function (it) { return cardHtml(it, 'lg'); }).join('');
  empty.style.display = 'none';
  startBanner();
}

var bannerTimer = 0;
function startBanner() {
  var box = S.root.querySelector('#homeBanner');
  if (!box) return;
  clearInterval(bannerTimer);
  var idx = 0;
  bannerTimer = setInterval(function () {
    var cards = box.querySelectorAll('.hb');
    if (cards.length < 2 || document.hidden) return;
    idx = (idx + 1) % cards.length;
    box.scrollTo({ left: cards[idx].offsetLeft, behavior: 'smooth' });
  }, 4500);
}

function loadFeed(force) {
  if (!force) {
    var c = lsGet(FEED_KEY);
    if (c && c.t && Date.now() - c.t < FEED_TTL && c.list && c.list.length) {
      S.feed = c.list; renderHome(); return Promise.resolve();
    }
  }
  var srcs = enabledSources();
  if (!srcs.length) { S.feed = []; renderHome(); return Promise.resolve(); }
  renderHome();
  return Promise.all(srcs.map(function (s) { return apiList(s, 1); })).then(function (res) {
    var seen = {}, list = [];
    res.forEach(function (r) {
      (r.list || []).forEach(function (it) {
        var k = it._sourceKey + ':' + it.vod_id;
        if (!seen[k] && it.vod_id) { seen[k] = 1; list.push(it); }
      });
    });
    list.sort(function (a, b) { return String(b.vod_time || '').localeCompare(String(a.vod_time || '')); });
    S.feed = list.slice(0, 30);
    lsSet(FEED_KEY, { t: Date.now(), list: S.feed });
    renderHome();
  });
}

/* ---------- 搜索 ---------- */

function renderSearch() {
  var root = S.root;
  var box = root.querySelector('#searchResult');
  var more = root.querySelector('#searchMore');
  if (!S.search.items.length) {
    box.innerHTML = S.search.loading ? skelHtml(6, 'lg') : '';
    more.style.display = 'none';
    return;
  }
  regIndex(S.search.items);
  box.innerHTML = S.search.items.map(function (it) { return cardHtml(it, 'lg'); }).join('');
  more.style.display = S.search.hasMore ? '' : 'none';
  more.textContent = S.search.loading ? '搜索中…' : '加载更多';
}

function doSearch(q, append) {
  q = (q || '').trim();
  if (!q) { toast('请输入关键词'); return; }
  if (S.search.loading) return;
  if (!append) { S.search.items = []; S.search.page = 1; S.search.hasMore = true; }
  S.search.q = q;
  S.search.loading = true;
  renderSearch();

  var srcs = enabledSources().filter(function (s) { return s.search !== false; });
  var page = S.search.page;

  Promise.all(srcs.map(function (s) { return apiList(s, page, q); })).then(function (res) {
    var seen = {}, list = [];
    res.forEach(function (r) {
      (r.list || []).forEach(function (it) {
        var k = it._sourceKey + ':' + it.vod_id;
        if (!seen[k] && it.vod_id) { seen[k] = 1; list.push(it); }
      });
    });
    var hasMore = res.some(function (r) { return r.list && r.list.length > 0; });
    S.search.items = append ? S.search.items.concat(list) : list;
    S.search.loading = false;
    S.search.hasMore = hasMore && list.length > 0;
    S.search.page = page + 1;
    renderSearch();
    if (!S.search.items.length) toast('没有找到相关作品');
  });
}

/* ---------- 设置 ---------- */

function renderSettings() {
  var root = S.root;

  root.querySelectorAll('.theme-option').forEach(function (el) {
    el.classList.toggle('on', el.getAttribute('data-theme') === S.settings.theme);
  });

  var srcBox = root.querySelector('#setSources');
  srcBox.innerHTML = S.sources.map(function (s, i) {
    return '<div class="row"><div class="row-main"><div class="row-t">' + esc(s.name) +
      (s.cors === false ? '<span class="tag">代理</span>' : '') + '</div>' +
      '<div class="row-s">' + esc(s.api) + '</div></div>' +
      '<button class="switch ' + (s.enabled !== false ? 'on' : '') + '" data-act="toggle-src" data-i="' + i + '" aria-label="切换"></button></div>';
  }).join('');

  var mode = S.settings.cors || 'auto';
  root.querySelectorAll('#setCors .seg-btn').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-mode') === mode);
  });
  root.querySelector('#corsInput').value = S.settings.corsProxy || '';

  var sw = { adSkip: 'swAdSkip', rememberPos: 'swRemember', longPress: 'swLongPress', autoFs: 'swAutoFs', gestures: 'swGesture' };
  Object.keys(sw).forEach(function (k) {
    var el = root.querySelector('#' + sw[k]);
    if (el) el.classList.toggle('on', !!S.settings[k]);
  });

  var sv = root.querySelector('#skipStartV'), ev = root.querySelector('#skipEndV');
  if (sv) sv.textContent = S.settings.skipStart ? S.settings.skipStart + ' 秒' : '未设置';
  if (ev) ev.textContent = S.settings.skipEnd ? S.settings.skipEnd + ' 秒' : '未设置';
  var sp = root.querySelector('#setSpeedV'), rt = root.querySelector('#setRatioV');
  if (sp) sp.textContent = (S.settings.speed || 1) + 'x';
  if (rt) rt.textContent = S.settings.ratio === 'auto' ? '自动' : S.settings.ratio;
  var vl = root.querySelector('#verLine');
  if (vl) vl.textContent = 'v' + VERSION;
}
