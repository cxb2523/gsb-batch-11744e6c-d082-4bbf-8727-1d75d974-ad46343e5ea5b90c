/* ============ ui: 图标 / 卡片 / 骨架 / 提示 / 弹层 ============ */

var ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  back: '<path d="M15 6 9 12l6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  heart: '<path d="M20.8 5.6a5.4 5.4 0 0 0-7.7 0L12 6.7l-1.1-1.1a5.4 5.4 0 1 0-7.7 7.7L12 22l8.8-8.7a5.4 5.4 0 0 0 0-7.7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.5 0-3-2-5-3.5-6.5C14 7.5 13 5.5 13 3c-2.5 1.5-4 4-4 6 0 1 .3 2 .8 2.7C8.5 11 7 12.5 7 15c0 .6.1 1.2.3 1.7C6 16.2 5 15 5 13c0 0-1 1.5-1 3.5C4 20 7.5 22 12 22z"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  tv: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 3l4 3 4-3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  cast: '<path d="M2 17a5 5 0 0 1 5 5M2 13a9 9 0 0 1 9 9"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 4 6M21 9l-4 6"/>',
  pip: '<rect x="3" y="5" width="18" height="13" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1"/>'
};

function icon(name, size) {
  var d = ICONS[name] || '';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' + d + '</svg>';
}

var PALETTE = ['#8B6B4A', '#4A6B8B', '#6B4A8B', '#4A8B6B', '#8B4A5A', '#5A4A8B'];

function posterHtml(it, cls) {
  var pic = it && it.vod_pic ? String(it.vod_pic) : '';
  var name = (it && it.vod_name) || '未知';
  var color = PALETTE[Math.abs(hashStr(name)) % PALETTE.length];
  var img = pic && pic !== 'null' && pic.length > 8
    ? '<img src="' + esc(pic) + '" alt="" loading="lazy" draggable="false" onerror="this.remove()">'
    : '';
  return '<div class="' + cls + '" style="--ph:' + color + '">' + img +
    '<span class="poster-ph">' + esc(name.slice(0, 2)) + '</span></div>';
}

function hashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function cardHtml(it, size) {
  var meta = it.vod_remarks || it.vod_year || it.type_name || '';
  return '<div class="card ' + (size === 'lg' ? 'card-lg' : 'card-sm') + '" data-key="' + esc(it._sourceKey + ':' + it.vod_id) + '" tabindex="0" role="button">' +
    posterHtml(it, 'poster') +
    '<div class="card-body"><div class="card-name">' + esc(it.vod_name || '未知') + '</div>' +
    '<div class="card-meta">' + esc(meta) + '</div></div></div>';
}

function skelHtml(n, size) {
  var out = '';
  for (var i = 0; i < n; i++) {
    out += '<div class="card ' + (size === 'lg' ? 'card-lg' : 'card-sm') + ' skel"><div class="poster"></div><div class="card-body"><div class="skel-line"></div><div class="skel-line short"></div></div></div>';
  }
  return out;
}

var toastTimer = 0;
function toast(msg) {
  var el = S.root && S.root.querySelector('.toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
}

function sheet(title, bodyHtml, actions) {
  var wrap = document.createElement('div');
  wrap.className = 'sheet-mask';
  wrap.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' +
    '<div class="sheet-head"><div class="sheet-title">' + esc(title) + '</div>' +
    '<button class="icon-btn sheet-x" aria-label="关闭">' + icon('close') + '</button></div>' +
    '<div class="sheet-body">' + bodyHtml + '</div>' +
    (actions || '') + '</div>';
  S.root.appendChild(wrap);
  function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
  wrap.querySelector('.sheet-x').addEventListener('click', close);
  requestAnimationFrame(function () { wrap.classList.add('in'); });
  return { el: wrap, close: close };
}

function confirmSheet(title, text, onOk, okText) {
  var s = sheet(title, '<p class="sheet-text">' + esc(text) + '</p>',
    '<div class="sheet-actions"><button class="btn ghost" data-x>取消</button><button class="btn primary" data-ok>' + esc(okText || '确定') + '</button></div>');
  s.el.querySelector('[data-x]').addEventListener('click', s.close);
  s.el.querySelector('[data-ok]').addEventListener('click', function () { s.close(); onOk && onOk(); });
}
