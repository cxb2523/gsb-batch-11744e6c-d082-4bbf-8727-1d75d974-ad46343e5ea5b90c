'use strict';
// ======================================================================
//  hud.js —— 战术射击 HUD：准星、雷达、血量护甲、弹药、击杀信息、
//             受击方向、计分板、购买菜单（虚拟光标）、网络图
// ======================================================================
const _hv = new THREE.Vector3(), _hd = new THREE.Vector3(), _he = new THREE.Vector3();
const HUD = (() => {
  const E = {};
  let crossKey = '', radarT = 0, game = null;
  const cache = {};
  const feed = [];
  let buyOpen = false, buyCat = -1;
  let centerT = 0, hitT = 0;

  function setText(id, v) { if (cache[id] !== v) { cache[id] = v; E[id].textContent = v; } }
  function setHTML(id, v) { if (cache['h' + id] !== v) { cache['h' + id] = v; E[id].innerHTML = v; } }
  function show(id, on) { const k = 's' + id; if (cache[k] !== on) { cache[k] = on; E[id].classList.toggle('hidden', !on); } }

  const api = {
    init() {
      for (const id of ['hud', 'crosshair', 'scope', 'hitmarker', 'dmgdir', 'radar', 'radarLabel', 'money', 'buyhint', 'aliveCT', 'aliveT', 'scoreCT', 'scoreT',
        'timer', 'bombIcon', 'killfeed', 'center', 'subcenter', 'hpbox', 'hp', 'armor', 'hpbar', 'armorbar', 'armorIco', 'weaponbar', 'wname', 'mag', 'reserve',
        'progress', 'progressLabel', 'progressBar', 'netgraph', 'deathinfo', 'spectate', 'scoreboard', 'buymenu', 'vcursor', 'tags']) E[id] = $(id);
      E.tctx = E.tags.getContext('2d');
      E.rctx = E.radar.getContext('2d');
      E.cctx = E.crosshair.getContext('2d');
    },
    bind(g) { game = g; feed.length = 0; E.killfeed.innerHTML = ''; for (const k in cache) delete cache[k]; crossKey = ''; api.closeBuy(); },
    get buyOpen() { return buyOpen; },

    drawCrosshair(extra, hide) {
      const S = Settings.data;
      const key = [S.crossSize, S.crossGap, S.crossThick, S.crossColor, S.crossDot, S.crossOutline, Math.round(extra * 2), hide].join('|');
      if (key === crossKey) return;
      crossKey = key;
      const c = E.crosshair, g = E.cctx, dpr = Math.min(2, devicePixelRatio || 1);
      const size = S.crossSize, th = S.crossThick, gap = Math.max(0, S.crossGap + extra);
      const R = Math.ceil(gap + size + 4);
      c.width = c.height = Math.ceil(R * 2 * dpr);
      c.style.width = c.style.height = R * 2 + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, R * 2, R * 2);
      if (hide) return;
      const cx = R, cy = R, h = th / 2;
      const rects = [];
      if (size > 0) {
        rects.push([cx - h, cy - gap - size, th, size], [cx - h, cy + gap, th, size], [cx - gap - size, cy - h, size, th], [cx + gap, cy - h, size, th]);
      }
      if (S.crossDot) rects.push([cx - h, cy - h, th, th]);
      if (S.crossOutline) { g.fillStyle = 'rgba(0,0,0,0.85)'; for (const r of rects) g.fillRect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2); }
      g.fillStyle = S.crossColor;
      for (const r of rects) g.fillRect(r[0], r[1], r[2], r[3]);
    },

    hitmarker(kill) {
      if (!Settings.data.hitmarker) return;
      E.hitmarker.classList.toggle('kill', !!kill);
      E.hitmarker.style.opacity = 1; hitT = kill ? 0.35 : 0.15;
    },
    damageFrom(angleRad) {
      const d = document.createElement('div'); d.className = 'arc';
      d.style.transform = `rotate(${angleRad}rad)`;
      E.dmgdir.appendChild(d);
      setTimeout(() => { d.style.opacity = 0; }, 700);
      setTimeout(() => d.remove(), 1000);
    },
    center(text, cls = '', dur = 3, sub = '') {
      E.center.className = cls; E.center.textContent = text; E.center.style.opacity = 1;
      E.subcenter.textContent = sub; E.subcenter.style.opacity = 1;
      centerT = dur;
    },
    killfeed(o) {
      const el = document.createElement('div');
      el.className = 'kf' + (o.mine ? ' mine' : '');
      const nm = (a) => a ? `<span class="c${a.team}">${a.name}</span>` : '';
      el.innerHTML = `${o.killer ? nm(o.killer) : ''}<span class="w">${o.weapon}</span>${o.wallbang ? '<span class="wb">穿</span>' : ''}${o.hs ? '<span class="hs">爆头</span>' : ''}${nm(o.victim)}`;
      E.killfeed.prepend(el);
      feed.push({ el, t: o.mine ? 9 : 6 });
      while (E.killfeed.children.length > 6) E.killfeed.lastChild.remove();
    },
    moneyFlash() { E.money.classList.remove('flash'); void E.money.offsetWidth; E.money.classList.add('flash'); },

    // 敌我标识：队友头顶阵营色标记+名字；准星对准可见敌人时显示红色名字
    drawTags(g) {
      const c = E.tags, ctx = E.tctx, dpr = Math.min(2, devicePixelRatio || 1);
      const W = innerWidth, H = innerHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const P = g.player, view = g.viewTarget || P, cam = g.camera;
      if (!P.alive && !g.spectating) return;
      const team = view.team, col = team === 'CT' ? '#6cb4ff' : '#ffbf4d';
      const v = _hv, eye = cam.position;
      ctx.textAlign = 'center'; ctx.font = '600 12px "Segoe UI", "Microsoft YaHei", sans-serif';
      for (const a of g.actors) {
        if (!a.alive || a === view || a.team !== team) continue;
        g.aimPoint(a, 'head', v); v.y += 0.32;
        const d = v.distanceTo(eye);
        v.project(cam);
        if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
        const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
        const al = clamp(1.25 - d / 45, 0.45, 1);
        ctx.globalAlpha = al;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.moveTo(x - 7, y - 9); ctx.lineTo(x + 7, y - 9); ctx.lineTo(x, y + 1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x - 5.5, y - 8); ctx.lineTo(x + 5.5, y - 8); ctx.lineTo(x, y - 0.5); ctx.closePath(); ctx.fill();
        if (d < 30) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(a.name, x + 1, y - 12); ctx.fillStyle = col; ctx.fillText(a.name, x, y - 13); }
      }
      ctx.globalAlpha = 1;
      // 准星下的敌人
      if (P.alive) {
        const f = dirFromAngles(P.yaw, P.pitch, _hd), e = P.eyePos(_he);
        const wh = g.world.raycast(e.x, e.y, e.z, f.x, f.y, f.z, 80, {});
        const ah = g.rayActors(e.x, e.y, e.z, f, wh ? wh.t : 80, new Set([P]));
        if (ah && ah.actor.team !== P.team && !Effects.smokeBlocks(e, _hv.copy(e).addScaledVector(f, ah.t))) {
          ctx.font = '700 13px "Segoe UI", "Microsoft YaHei", sans-serif';
          ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText('敌人  ' + ah.actor.name, W / 2 + 1, H / 2 + 41);
          ctx.fillStyle = '#ff5a4a'; ctx.fillText('敌人  ' + ah.actor.name, W / 2, H / 2 + 40);
        }
      }
    },

    update(dt, g) {
      const P = g.player, view = g.viewTarget || P;
      api.drawTags(g);
      // 计时
      if (centerT > 0) { centerT -= dt; if (centerT <= 0) { E.center.style.opacity = 0; E.subcenter.style.opacity = 0; } }
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) E.hitmarker.style.opacity = 0; }
      for (let i = feed.length - 1; i >= 0; i--) { feed[i].t -= dt; if (feed[i].t <= 0) { feed[i].el.style.opacity = 0; const el = feed[i].el; setTimeout(() => el.remove(), 600); feed.splice(i, 1); } }

      // 血量护甲
      const a = view;
      setText('hp', String(Math.max(0, Math.ceil(a.hp))));
      setText('armor', String(Math.ceil(a.armor)));
      E.hpbar.style.width = clamp(a.hp, 0, 100) + '%';
      E.armorbar.style.width = clamp(a.armor, 0, 100) + '%';
      setText('armorIco', a.helmet ? '⛑' : '⛉');
      E.hpbox.classList.toggle('low', a.hp <= 25);
      // 武器
      const w = a.weapon, def = w ? w.def : null;
      setText('wname', def ? def.name : '');
      if (def && def.mag) {
        setText('mag', String(w.mag)); setText('reserve', '/ ' + (g.infiniteAmmo ? '∞' : w.reserve));
        E.mag.classList.toggle('low', w.mag <= Math.ceil(def.mag * 0.2));
      } else if (def && def.type === 'grenade') { setText('mag', String(a.inv.nades[def.id])); setText('reserve', ''); E.mag.classList.remove('low'); }
      else { setText('mag', '—'); setText('reserve', ''); E.mag.classList.remove('low'); }
      // 武器栏
      const I = a.inv; const rows = [];
      const ws = (k, n, on) => `<div class="ws${on ? ' on' : ''}"><b>${k}</b>${n}</div>`;
      if (I.primary) rows.push(ws(1, I.primary.def.name, a.slot === 'primary'));
      if (I.secondary) rows.push(ws(2, I.secondary.def.name, a.slot === 'secondary'));
      rows.push(ws(3, I.knife.def.name, a.slot === 'knife'));
      const nd = GRENADE_ORDER.filter((k) => I.nades[k] > 0).map((k) => WEAPONS[k].short + (I.nades[k] > 1 ? '×' + I.nades[k] : '')).join(' ');
      if (nd) rows.push(ws(4, nd, a.slot === 'nade'));
      if (I.c4) rows.push(ws(5, 'C4', a.slot === 'c4'));
      if (I.defuser) rows.push(`<div class="ws"><b>✂</b>拆弹器</div>`);
      setHTML('weaponbar', rows.join(''));
      // 金钱/购买
      const md = g.mode;
      setText('money', md.infiniteMoney ? '$ ∞' : '$' + P.money);
      show('buyhint', !!(md.canBuy && md.canBuy(P)) && !buyOpen);
      // 顶栏
      const tl = md.timeLeft != null ? md.timeLeft() : null;
      setText('timer', tl == null ? '--:--' : fmtTime(tl));
      E.timer.classList.toggle('low', tl != null && tl <= 10 && md.phase === 'live');
      setText('scoreCT', String(md.score ? md.score.CT : 0)); setText('scoreT', String(md.score ? md.score.T : 0));
      const alive = (t) => g.actors.filter((x) => x.team === t).map((x) => `<i class="${x.alive ? '' : 'dead'}"></i>`).join('');
      setHTML('aliveCT', alive('CT')); setHTML('aliveT', alive('T'));
      show('bombIcon', !!(md.bomb && md.bomb.planted && !md.bomb.exploded && !md.bomb.defused));
      // 准星
      const S = Settings.data;
      let extra = 0;
      if (S.crossStyle === 'dynamic' && a.alive) {
        const inacc = a.inaccuracy() / 1000;
        const px = Math.tan(inacc) / Math.tan(g.camera.fov * 0.5 * DEG) * innerHeight * 0.5;
        extra = Math.min(60, px * 0.6);
      }
      const hideX = !a.alive || (def && def.scope && !a.scoped) || (def && def.scope && a.scoped) || g.spectating;
      api.drawCrosshair(extra, hideX);
      show('scope', !!(a.alive && a.scoped && def && def.scope));
      // 进度条（安放/拆除）
      let prog = null;
      if (a.planting) prog = ['正在安放炸弹…', a.plantT / 3.2];
      else if (a.defusing) prog = [a.inv.defuser ? '正在拆除炸弹（拆弹器）…' : '正在拆除炸弹…', a.defuseT / (a.inv.defuser ? 5 : 10)];
      show('progress', !!prog);
      if (prog) { setText('progressLabel', prog[0]); E.progressBar.style.width = clamp(prog[1] * 100, 0, 100) + '%'; }
      // 网络图
      if (S.showFps) {
        const sp = Math.round(a.hspeed() / U);
        let s = `${g.fps.toFixed(0)} fps   ${sp} u/s`;
        if (g.client) s += g.net.rtt != null ? `   延迟 ${g.net.rtt}ms` : '   连接中…';
        if (md.id === 'range') s += `\n散布 ${a.inaccuracy().toFixed(1)} mrad\n后坐序号 ${a.recoilIdx.toFixed(1)}\n${a.sliding ? '滑铲中' : a.sprinting ? '冲刺' : a.ducked ? '下蹲' : a.onGround ? '' : '空中'}`;
        setText('netgraph', s);
      } else setText('netgraph', '');
      // 雷达
      radarT -= dt;
      if (radarT <= 0) { radarT = 1 / 30; api.drawRadar(g, a); }
      api.updateBuy(g);
    },

    drawRadar(g, a) {
      const c = E.rctx, W = 400, map = g.map;
      const ppm = 200 / 34, k = ppm / map.radarScale;
      const yaw = a.yaw, px = a.renderPos.x, pz = a.renderPos.z;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, W);
      c.save(); c.translate(200, 200); c.rotate(yaw); c.scale(k, k);
      c.globalAlpha = 0.92;
      c.drawImage(map.radar, -(px - map.origin) * map.radarScale, -(pz - map.origin) * map.radarScale);
      c.restore();
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const toS = (x, z) => { const rx = x - px, rz = z - pz; return [200 + (rx * cs - rz * sn) * ppm, 200 + (rx * sn + rz * cs) * ppm]; };
      const dot = (x, z, col, r, ring) => {
        let [sx, sy] = toS(x, z);
        const dx = sx - 200, dy = sy - 200, d = Math.hypot(dx, dy);
        if (d > 192) { sx = 200 + dx / d * 192; sy = 200 + dy / d * 192; r *= 0.75; }
        c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fillStyle = col; c.fill();
        if (ring) { c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.stroke(); }
      };
      const md = g.mode;
      if (md.bomb && (md.bomb.dropped || md.bomb.planted) && (g.player.team === 'T' || md.bomb.planted)) {
        const b = md.bomb.pos; const [sx, sy] = toS(b.x, b.z);
        c.fillStyle = md.bomb.planted ? '#ff3b30' : '#ffb43a'; c.fillRect(sx - 7, sy - 5, 14, 10);
        c.fillStyle = '#000'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.fillText('C4', sx, sy + 3.5);
      }
      for (const o of g.actors) {
        if (o === a || !o.alive) continue;
        if (o.team === g.player.team) dot(o.renderPos.x, o.renderPos.z, o.team === 'CT' ? '#8ab8ff' : '#ffc94d', 7, true);
        else if (g.time - (o.spottedT || -9) < 0.6) dot(o.renderPos.x, o.renderPos.z, '#ff4a3d', 7, true);
      }
      // 自身箭头
      c.beginPath(); c.moveTo(200, 189); c.lineTo(208, 208); c.lineTo(200, 203); c.lineTo(192, 208); c.closePath();
      c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#000'; c.stroke();
      const area = api.areaName(g, a.pos);
      setText('radarLabel', area);
    },
    areaName(g, p) {
      const pts = g.map.points; let best = '', bd = 1e9;
      const names = { t_spawn: 'T 出生点', ct_spawn: 'CT 出生点', top_mid: 'T 中路', mid: '中路', xbox: '中路木箱', mid_doors: '中门', ct_mid: 'CT 中路',
        outside_long: 'A 大外', long_doors: 'A 大门', long: 'A 大道', long_corner: 'A 大拐角', a_ramp: 'A 坡', a_site: 'A 包点', a_short: 'A 小', short: 'A 小道', ct_to_a: 'CT → A',
        upper_tunnel: 'B 外', b_tunnel: 'B 洞', lower_tunnel: '下水道', b_exit: 'B 洞口', b_site: 'B 包点', b_plat: 'B 平台', b_doors: 'B 门', b_window: 'B 窗' };
      for (const k in pts) { const d = pts[k].distanceToSquared(p); if (d < bd) { bd = d; best = names[k] || k; } }
      return best;
    },

    showDeath(text, sub) { E.deathinfo.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); show('deathinfo', true); },
    hideDeath() { show('deathinfo', false); },
    spectate(text) { if (text) { setText('spectate', text); show('spectate', true); } else show('spectate', false); },

    scoreboard(on, g) {
      show('scoreboard', on);
      if (!on) return;
      const md = g.mode, P = g.player;
      const row = (a) => `<tr class="${a === P ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td><span class="c${a.team}">${a.name}</span>${a.inv.c4 && a.team === P.team ? ' 💣' : ''}${a.inv.defuser && a.team === P.team ? ' ✂' : ''}</td><td class="n">${a.kills}</td><td class="n">${a.assists}</td><td class="n">${a.deaths}</td><td class="n">${'★'.repeat(Math.min(a.mvp, 5))}${a.mvp > 5 ? a.mvp : ''}</td><td class="n">${a.team === P.team && !md.infiniteMoney ? '$' + a.money : ''}</td><td class="n">${a.isBot ? 'BOT' : a.ping != null ? a.ping + 'ms' : g.net ? (a === P ? '你' : '玩家') : '本机'}</td></tr>`;
      const tbl = (t) => {
        const list = g.actors.filter((x) => x.team === t).sort((x, y) => y.kills - x.kills || x.deaths - y.deaths);
        return `<h3><span class="c${t}">${t === 'CT' ? '反恐精英' : '恐怖分子'}</span><span class="c${t}">${md.score ? md.score[t] : ''}</span></h3><table><tr><th>玩家</th><th class="n">击杀</th><th class="n">助攻</th><th class="n">死亡</th><th class="n">MVP</th><th class="n">金钱</th><th class="n">延迟</th></tr>${list.map(row).join('')}</table>`;
      };
      setHTML('scoreboard', `<div style="text-align:center;color:#a9a49a;font-size:13px;letter-spacing:2px;margin-bottom:6px">${md.title} · 炽沙小镇 · 机器人难度：${DIFFS[g.opts.diff].label}</div>` + tbl('CT') + tbl('T'));
    },

    // ---------------- 购买菜单 ----------------
    openBuy(g) {
      buyOpen = true; buyCat = -1;
      show('buymenu', true); show('vcursor', true);
      Input.cursorX = innerWidth / 2; Input.cursorY = innerHeight / 2;
      api.renderBuy(g);
    },
    closeBuy() { buyOpen = false; show('buymenu', false); show('vcursor', false); },
    renderBuy(g) {
      const P = g.player, md = g.mode;
      const cols = BUY_MENU.map((cat, ci) => {
        const items = cat.items.map((id, ii) => {
          const it = WEAPONS[id] || EQUIP[id];
          const st = g.buyState(P, id);
          return `<div class="it ${st.ok ? '' : 'no'} ${st.own ? 'own' : ''} ${buyCat === ci ? 'hot' : ''}" data-buy="${id}"><div class="nm">${it.name}</div><div class="pr">${md.infiniteMoney ? '免费' : '$' + it.price}</div><div class="k">${ci + 1}-${ii + 1}</div></div>`;
        }).join('');
        return `<div class="col"><h4>${ci + 1}. ${cat.title}</h4>${items}</div>`;
      }).join('');
      setHTML('buymenu', `<div class="bm"><div class="bmh"><div class="t">购买菜单</div><div class="m">${md.infiniteMoney ? '$ ∞' : '$' + P.money}</div></div><div class="cols">${cols}</div><div class="foot">鼠标点击购买，或按 数字键 选择分类+物品 · B / Esc 关闭 · ${md.buyTimeLeft ? '剩余购买时间 ' + Math.ceil(md.buyTimeLeft()) + ' 秒' : ''}</div></div>`);
    },
    updateBuy(g) {
      if (!buyOpen) return;
      E.vcursor.style.transform = `translate(${Input.cursorX}px, ${Input.cursorY}px)`;
      if (!(g.mode.canBuy && g.mode.canBuy(g.player)) || !g.player.alive) { api.closeBuy(); return; }
      api.renderBuy(g);
    },
    buyClick(g) {
      const el = document.elementFromPoint(Input.cursorX, Input.cursorY);
      const it = el && el.closest && el.closest('[data-buy]');
      if (it) g.buy(g.player, it.dataset.buy, true);
    },
    buyKey(g, n) {
      if (buyCat < 0) { if (n >= 1 && n <= BUY_MENU.length) { buyCat = n - 1; Sound.play('ui_click'); } return; }
      const id = BUY_MENU[buyCat].items[n - 1];
      if (id) g.buy(g.player, id, true);
      buyCat = -1;
    },
  };
  return api;
})();
