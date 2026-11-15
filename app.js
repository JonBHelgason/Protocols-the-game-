'use strict';
/* Protocols app - UI. Rules and numbers live in logic.js, decisions in Protocols-App-Spec.md */
(() => {
const L = Logic;
let S = null; // app state, saved to IndexedDB after every change
const ui = { tab: 'today', date: L.today(), loadedDay: L.today(), lib: { q: '', layer: 'all', cat: 'all', sort: 'code' }, period: 'week', sheet: null, pyrEdit: false };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
const parseN = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? null : x; };
const C = () => S.settings.level_cost_per_level;
const LAYER_NAME = { base: 'Base', l2: 'Layer 2', test: 'Test', backlog: 'Backlog', doctor: 'Doctor', as_needed: 'As needed', archived: 'Archived' };
const LAYER_ORDER = { base: 0, l2: 1, test: 2, as_needed: 3, backlog: 4, doctor: 5, archived: 6 };
const TOD_NAME = { morning: 'morning', day: 'daytime', afternoon: 'afternoon', evening: 'evening' };
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CATS = ['Sleep', 'Exercise', 'Stress control', 'Nutrition', 'Light', 'Focus and learning', 'Personal growth', 'Custom'];
const dfmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDate = d => dfmt.format(L.parse(d));
const tag = layer => `<span class="tag ${layer}">${LAYER_NAME[layer]}</span>`;

// ---------- storage ----------
const Store = {
  db: null,
  async init() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('protocols-app', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    } catch (e) { this.db = null; }
  },
  load() {
    if (this.db) return new Promise(res => {
      try {
        const q = this.db.transaction('kv').objectStore('kv').get('state');
        q.onsuccess = () => res(q.result || null); q.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    try { const t = localStorage.getItem('protocols-state'); return Promise.resolve(t ? JSON.parse(t) : null); } catch (e) { return Promise.resolve(null); }
  },
  save(state) {
    if (this.db) { try { this.db.transaction('kv', 'readwrite').objectStore('kv').put(state, 'state'); return; } catch (e) { /* fall through */ } }
    try { localStorage.setItem('protocols-state', JSON.stringify(state)); } catch (e) { /* no storage */ }
  },
};

// ---------- helpers ----------
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
const evText = e => e.kind === 'protocol' ? `${L.byId(S, e.id).name} is now level ${e.level}` : `Player level ${e.level}!`;
function commit(events) {
  Store.save(S); render();
  if (events && events.length) toast(events.map(evText).join(' · '));
}
const protLabel = p => `${p.codes[0]} ${p.name}`;
function pagesText(p) { const e = Object.entries(p.pages || {}); return e.length ? e.map(([k, v]) => `${k} p.${v}`).join(', ') : '–'; }
function metricVal(t, v) {
  if (v == null) return '–';
  if (t.metric.type === 'yesno') return Number(v) ? 'Yes' : 'No';
  return fmtN(Number(v)) + (t.metric.type === 'number' && t.metric.unit ? ' ' + t.metric.unit : '');
}
function avgText(t, avg) {
  if (avg == null) return '–';
  if (t.metric.type === 'yesno') return Math.round(avg * 100) + '% yes';
  return fmtN(avg) + (t.metric.type === 'number' && t.metric.unit ? ' ' + t.metric.unit : '');
}

// ---------- render root ----------
function render() {
  const names = { today: 'Today', pyramid: 'Pyramid', library: 'Library', tests: 'Tests', review: 'Review' };
  const xp = L.totalXp(S), lp = L.levelProgress(xp, C());
  $('#top').innerHTML = `<div class="title">${names[ui.tab]}${ui.tab === 'today' ? `<small>${esc(fmtDate(ui.date))}</small>` : ''}</div>
    <div class="player" title="Player level"><span class="lvl">Lv ${lp.level}</span><div class="bar"><i style="width:${Math.round(lp.frac * 100)}%"></i></div><span class="xp">${xp} XP</span></div>`;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
  const fn = { today: renderToday, pyramid: renderPyramid, library: renderLibrary, tests: renderTests, review: renderReview }[ui.tab];
  $('#screen').innerHTML = fn();
  renderSheet();
}

// ---------- Today ----------
function protRow(p, o = {}) {
  const date = ui.date, done = !!L.isDone(S, p.id, date), lv = L.lvOf(S, p.id);
  const tod = p.time_of_day ? ` · ${TOD_NAME[p.time_of_day]}` : '';
  const sub = o.sub ?? `${esc(p.codes.join(' / '))}${tod} · effort ${fmtN(p.effort)}`;
  return `<div class="row ${done ? 'done' : ''} ${o.hot ? 'hot' : ''}">
    <button class="chk" data-action="toggle" data-id="${esc(p.id)}" aria-pressed="${done}" aria-label="${done ? 'Undo' : 'Done'}: ${esc(p.name)}">${done ? '✓' : ''}</button>
    <div class="row-main" data-action="open" data-id="${esc(p.id)}"><div class="row-name">${esc(p.name)}</div><div class="row-sub">${sub}</div></div>
    <span class="badge">L${lv}</span></div>`;
}
const doneLast = (list, date) => [...list.filter(p => !L.isDone(S, p.id, date)), ...list.filter(p => L.isDone(S, p.id, date))];
const sec = (title, right) => `<div class="sec"><h3>${title}</h3><small>${right || ''}</small></div>`;

function testCard(t, date) {
  const p = L.byId(S, t.protocol), real = L.today();
  if (L.testFinished(t, real)) {
    return `<div class="card test-card"><h4>${esc(p.name)}</h4><div class="muted">Test finished. Give your verdict to free the slot.</div>
      <div class="btn-row"><button class="btn primary" data-action="verdict-open" data-test="${t.id}">Give verdict</button></div></div>`;
  }
  const day = L.testDay(t, date);
  if (day < 1) return '';
  const log = L.isDone(S, p.id, date), cur = log ? log.metric : null;
  let input = '';
  if (t.metric.type === 'rating') {
    input = [1, 2, 3, 4, 5].map(v => `<button class="chip" data-action="metric" data-test="${t.id}" data-value="${v}" aria-pressed="${cur != null && Number(cur) === v}">${v}</button>`).join('');
  } else if (t.metric.type === 'yesno') {
    input = [[1, 'Yes'], [0, 'No']].map(([v, l]) => `<button class="chip" data-action="metric" data-test="${t.id}" data-value="${v}" aria-pressed="${cur != null && Number(cur) === v}">${l}</button>`).join('');
  } else {
    input = `<input type="text" inputmode="decimal" id="metricNum" value="${cur != null ? esc(fmtN(Number(cur))) : ''}" placeholder="${esc(t.metric.unit || 'value')}" aria-label="${esc(t.metric.name)}">
      <button class="btn primary small" data-action="metric-num" data-test="${t.id}">Save</button>`;
  }
  return `<div class="card test-card">
    <h4>${esc(p.name)} <span class="badge">day ${day}/${t.days}</span></h4>
    ${t.hypothesis ? `<div class="muted">${esc(t.hypothesis)}</div>` : ''}
    <div class="metric-row"><b>${esc(t.metric.name)}</b></div>
    <div class="metric-row">${input}</div>
    <div class="metric-row"><input type="text" id="metricNote" value="${esc(log ? log.note : '')}" placeholder="Note (optional)" aria-label="Note"></div>
    <div class="row-sub" style="margin-top:6px">${log ? (cur != null ? 'Logged ✓ (tap the same value to clear)' : '') : 'Logging the value counts as today\'s completion.'}</div>
  </div>`;
}

function renderToday() {
  const date = ui.date, real = L.today(), set = S.settings, wk = L.weekStart(date);
  const paused = S.pauses.includes(date);
  let h = '';
  const chips = [];
  for (let i = 0; i <= set.backfill_days; i++) {
    const d = L.addDays(real, -i);
    chips.push(`<button class="chip" data-action="date" data-date="${d}" aria-pressed="${d === date}">${i === 0 ? 'Today' : i === 1 ? 'Yesterday' : esc(fmtDate(d).replace(/ \w+$/, ''))}</button>`);
  }
  chips.push(`<button class="chip" data-action="pause" aria-pressed="${paused}">Pause day</button>`);
  h += `<div class="dates wrap">${chips.join('')}</div>`;
  if (set.weekly_checkin && L.weekday(real) === 6 && S.meta.checkin_dismissed !== real) {
    h += `<div class="banner"><span>Sunday check-in: look at your week and adjust layers or efforts.</span><span><button class="btn small primary" data-action="checkin-go">Review</button> <button class="btn small" data-action="checkin-dismiss">Not now</button></span></div>`;
  }
  if (paused) h += `<div class="banner">Pause day. Nothing is penalised, and Layer 2 targets shrink for this week.</div>`;
  if (date !== real) h += `<div class="banner">Backfilling ${esc(fmtDate(date))}. Normal XP applies.</div>`;

  const base = L.sortProts(L.inLayer(S, 'base'));
  const bd = base.filter(p => L.isDone(S, p.id, date)).length;
  h += sec('Base', `${bd}/${base.length} · XP ${L.xpOnDate(S, date)}`);
  h += base.length ? `<div class="rows">${doneLast(base, date).map(p => protRow(p)).join('')}</div>` : `<div class="empty">No Base protocols. Move some in from the Pyramid.</div>`;

  const l2 = L.sortProts(L.inLayer(S, 'l2')).filter(p => {
    if (p.fixed_weekdays && p.fixed_weekdays.length && !p.fixed_weekdays.includes(L.weekday(date)) && !L.isDone(S, p.id, date)) return false;
    return L.weekCount(S, p.id, wk) < L.weekTarget(S, p, wk) || L.isDone(S, p.id, date);
  });
  h += sec('Layer 2', 'this week');
  h += l2.length ? `<div class="rows">${doneLast(l2, date).map(p => {
    const n = L.weekCount(S, p.id, wk), T = L.weekTarget(S, p, wk), left = 7 - L.weekday(date);
    const fixed = p.fixed_weekdays && p.fixed_weekdays.length;
    const sub = fixed ? `${n}/${T} this week · ${p.fixed_weekdays.map(i => WD[i]).join(' ')}` : `${n}/${T} this week · ${left}d left`;
    return protRow(p, { sub, hot: !fixed && n < T && (T - n) >= left });
  }).join('')}</div>` : `<div class="empty">Nothing due. Layer 2 targets are met or nothing is placed here.</div>`;

  const tests = L.activeTests(S);
  const cards = tests.map(t => testCard(t, date)).join('');
  const testCap = L.capacity(S, 'test');
  h += sec('Test', `slot ${fmtN(testCap.used)}/${testCap.limit}`);
  h += cards;
  if (testCap.used < testCap.limit - 1e-9) h += `<div class="card"><b>Test slot free</b><div class="muted">Try one protocol for 2 to 4 weeks with one daily metric.</div><div class="btn-row"><button class="btn primary" data-action="sheet-start">Start a test</button></div></div>`;

  const asn = L.sortProts(L.inLayer(S, 'as_needed'));
  if (asn.length) {
    h += sec('As needed', `+${set.xp_as_needed} XP per use`);
    h += `<div class="chips">${asn.map(p => {
      const n = S.completions.filter(c => c.protocol === p.id && c.date === date && c.kind === 'as_needed').length;
      return `<span class="asn"><button class="go" data-action="asneeded" data-id="${esc(p.id)}">${esc(p.name)}<small>+${set.xp_as_needed}</small></button>${n ? `<span class="cnt">×${n}</span><button class="undo" data-action="asneeded-undo" data-id="${esc(p.id)}" aria-label="Undo one">↶</button>` : ''}</span>`;
    }).join('')}</div>`;
  }
  return h;
}

// ---------- Pyramid ----------
function layerRows(layer) {
  const list = L.sortProts(L.inLayer(S, layer));
  if (!list.length) return `<div class="empty">Empty</div>`;
  return list.map(p => `<div class="row row-plain">
    <div class="row-main" data-action="open" data-id="${esc(p.id)}"><div class="row-name">${esc(p.name)}</div><div class="row-sub">${esc(p.codes.join(' / '))}${p.time_of_day ? ' · ' + TOD_NAME[p.time_of_day] : ''}</div></div>
    ${ui.pyrEdit ? `<input class="eff-in" type="text" inputmode="decimal" value="${fmtN(p.effort)}" data-change="eff" data-id="${esc(p.id)}" aria-label="Effort ${esc(p.name)}">` : `<span class="eff">${fmtN(p.effort)}</span>`}
    <span class="badge">L${L.lvOf(S, p.id)}</span></div>`).join('');
}
function simpleList(layer) {
  const list = L.sortProts(L.inLayer(S, layer)).sort((a, b) => (a.queue_order ?? 1e9) - (b.queue_order ?? 1e9) || 0);
  return list.length ? list.map(p => `<div class="row row-plain"><div class="row-main" data-action="open" data-id="${esc(p.id)}"><div class="row-name">${esc(p.name)}</div><div class="row-sub">${esc(p.codes.join(' / '))} · ${esc(p.category)}${p.queue_order != null ? ' · in test queue' : ''}</div></div><span class="badge">L${L.lvOf(S, p.id)}</span></div>`).join('') : `<div class="empty">Empty</div>`;
}
function renderPyramid() {
  const defs = [['test', 'Test', '72%', 'var(--test)'], ['l2', 'Layer 2', '86%', 'var(--l2)'], ['base', 'Base', '100%', 'var(--base)']];
  let h = `<div class="btn-row" style="margin:0 0 12px"><button class="btn small" data-action="pyr-edit" aria-pressed="${ui.pyrEdit}">${ui.pyrEdit ? 'Done editing' : 'Edit efforts and limits'}</button></div><div class="pyr">`;
  for (const [key, name, w, col] of defs) {
    const cap = L.capacity(S, key);
    const lim = ui.pyrEdit ? `<input class="lim-in" type="text" inputmode="decimal" value="${fmtN(cap.limit)}" data-change="lim" data-layer="${key}" aria-label="${name} limit">` : fmtN(cap.limit);
    let body;
    if (key === 'test') {
      const ts = L.activeTests(S);
      body = ts.length ? ts.map(t => { const p = L.byId(S, t.protocol); const fin = L.testFinished(t, L.today());
        return `<div class="row row-plain"><div class="row-main" data-action="open" data-id="${esc(p.id)}"><div class="row-name">${esc(p.name)}</div><div class="row-sub">${fin ? 'Finished, verdict needed' : `Day ${L.testDay(t, L.today())}/${t.days}`} · ${esc(t.metric.name)}</div></div>${ui.pyrEdit ? `<input class="eff-in" type="text" inputmode="decimal" value="${fmtN(p.effort)}" data-change="eff" data-id="${esc(p.id)}">` : `<span class="eff">${fmtN(p.effort)}</span>`}<span class="badge">L${L.lvOf(S, p.id)}</span></div>`; }).join('') : '<div class="empty">No test running</div>';
      const q = S.protocols.filter(p => p.layer === 'backlog' && p.queue_order != null).sort((a, b) => a.queue_order - b.queue_order);
      body += `<div class="row-sub" style="margin-top:6px">Queue: ${q.length ? q.map(p => esc(p.codes[0])).join(', ') : 'empty'}</div>
        <div class="btn-row"><button class="btn small primary" data-action="sheet-start">Start a test</button></div>`;
    } else body = layerRows(key);
    h += `<section class="layer ${cap.over ? 'over' : ''}" style="--w:${w};--c:${col}">
      <div class="layer-head"><h3>${name}</h3><span class="cap">${fmtN(cap.used)} / ${lim}</span></div>
      <div class="bar ${cap.over ? 'over' : ''}"><i style="width:${Math.min(100, cap.limit ? cap.used / cap.limit * 100 : 0)}%"></i></div>
      ${cap.over ? '<div class="err" style="margin:0 0 6px">Over the limit. Move something out or raise the limit.</div>' : ''}${body}</section>`;
  }
  h += '</div>';
  const fold = (layer, title) => { const n = L.inLayer(S, layer).length; return `<details class="fold"><summary><span>${title}</span><span class="muted">${n}</span></summary>${simpleList(layer)}</details>`; };
  h += fold('backlog', 'Backlog (not placed)') + fold('as_needed', 'As needed') + fold('doctor', 'Doctor first (no XP)');
  return h;
}

// ---------- Library ----------
function libFiltered() {
  const f = ui.lib, q = f.q.trim().toLowerCase();
  let list = S.protocols.filter(p => (f.layer === 'all' ? p.layer !== 'archived' : p.layer === f.layer)
    && (f.cat === 'all' || p.category === f.cat)
    && (!q || p.codes.join(' ').toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.abstract.toLowerCase().includes(q)));
  if (f.sort === 'level') list.sort((a, b) => L.xpOf(S, b.id) - L.xpOf(S, a.id) || a.codes[0].localeCompare(b.codes[0], 'en', { numeric: true }));
  else if (f.sort === 'layer') list.sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] || a.codes[0].localeCompare(b.codes[0], 'en', { numeric: true }));
  else list.sort((a, b) => a.codes[0].localeCompare(b.codes[0], 'en', { numeric: true }));
  return list;
}
function libList() {
  const list = libFiltered();
  if (!list.length) return `<div class="empty">No protocols match.</div>`;
  return `<div class="rows">${list.map(p => `<div class="row row-plain"><div class="row-main" data-action="open" data-id="${esc(p.id)}">
    <div class="row-name">${esc(p.codes.join(' / '))} · ${esc(p.name)}</div>
    <div class="row-sub">${esc(p.category)} · effort ${fmtN(p.effort)}</div></div>${tag(p.layer)}<span class="badge">L${L.lvOf(S, p.id)}</span></div>`).join('')}</div>`;
}
function renderLibrary() {
  const f = ui.lib;
  const layers = [['all', 'All'], ['base', 'Base'], ['l2', 'Layer 2'], ['test', 'Test'], ['as_needed', 'As needed'], ['backlog', 'Backlog'], ['doctor', 'Doctor'], ['archived', 'Archived']];
  return `<input type="search" id="libq" data-input="libq" placeholder="Search code, name or abstract" value="${esc(f.q)}" aria-label="Search">
    <div class="dates" style="margin-top:10px">${layers.map(([k, n]) => `<button class="chip" data-action="lib-layer" data-layer="${k}" aria-pressed="${f.layer === k}">${n}</button>`).join('')}</div>
    <div class="grid2" style="margin-bottom:10px">
      <select data-change="libcat" aria-label="Category"><option value="all">All categories</option>${CATS.map(c => `<option ${f.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <select data-change="libsort" aria-label="Sort"><option value="code" ${f.sort === 'code' ? 'selected' : ''}>Sort: code</option><option value="level" ${f.sort === 'level' ? 'selected' : ''}>Sort: XP</option><option value="layer" ${f.sort === 'layer' ? 'selected' : ''}>Sort: layer</option></select></div>
    <div id="libList">${libList()}</div>
    <div class="btn-row"><button class="btn" data-action="edit" data-id="">+ Add custom protocol</button></div>`;
}

// ---------- Tests ----------
function chartSvg(t) {
  const W = 320, H = 150, pl = 30, pr = 8, pt = 10, pb = 22, n = t.days;
  const x = i => pl + (W - pl - pr) * (n === 1 ? .5 : i / (n - 1));
  const logs = L.testStats(S, t, L.today()).logs.map(c => ({ i: L.diffDays(t.start, c.date), v: Number(c.metric) })).filter(o => o.i >= 0 && o.i < n && !isNaN(o.v));
  let lo, hi;
  if (t.metric.type === 'rating') { lo = 1; hi = 5; } else if (t.metric.type === 'yesno') { lo = 0; hi = 1; } else {
    const vs = logs.map(o => o.v).concat(t.baseline != null ? [t.baseline] : []);
    lo = vs.length ? Math.min(...vs) : 0; hi = vs.length ? Math.max(...vs) : 1;
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; } const pad = (hi - lo) * .12; lo -= pad; hi += pad;
  }
  const y = v => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
  const byI = new Map(logs.map(o => [o.i, o.v]));
  let d = '', prev = false;
  for (let i = 0; i < n; i++) { if (byI.has(i)) { d += `${prev ? 'L' : 'M'}${x(i).toFixed(1)} ${y(byI.get(i)).toFixed(1)} `; prev = true; } else prev = false; }
  const dots = logs.map(o => `<circle class="dot" cx="${x(o.i).toFixed(1)}" cy="${y(o.v).toFixed(1)}" r="3"/>`).join('');
  const base = t.baseline != null ? `<line class="base" x1="${pl}" x2="${W - pr}" y1="${y(t.baseline)}" y2="${y(t.baseline)}"/><text x="${W - pr}" y="${y(t.baseline) - 3}" text-anchor="end">baseline</text>` : '';
  const lab = v => fmtN(Math.round(v * 10) / 10);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.metric.name)} over ${n} days">
    <line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(hi)}" y2="${y(hi)}"/><line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(lo)}" y2="${y(lo)}"/>
    <text x="${pl - 4}" y="${y(hi) + 4}" text-anchor="end">${lab(hi)}</text><text x="${pl - 4}" y="${y(lo) + 4}" text-anchor="end">${lab(lo)}</text>
    <text x="${pl}" y="${H - 6}">day 1</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">day ${n}</text>
    ${base}<path class="ln" d="${d}"/>${dots}</svg>`;
}
function renderTests() {
  const real = L.today();
  let h = '';
  const active = L.activeTests(S);
  h += sec('Running', `${active.length}`);
  if (!active.length) h += `<div class="empty">No test running.</div>`;
  for (const t of active) {
    const p = L.byId(S, t.protocol), st = L.testStats(S, t, real), fin = L.testFinished(t, real);
    const notes = st.logs.filter(c => c.note).slice(-3);
    h += `<div class="card test-card"><h4>${esc(p.name)} <span class="badge">${fin ? 'finished' : `day ${L.testDay(t, real)}/${t.days}`}</span></h4>
      ${t.hypothesis ? `<div class="muted">${esc(t.hypothesis)}</div>` : ''}
      ${chartSvg(t)}
      <div class="meta"><div><small>Logged</small><b>${st.logged}/${st.elapsed} days (${Math.round(st.pct * 100)}%)</b></div>
      <div><small>Average ${esc(t.metric.name)}</small><b>${avgText(t, st.avg)}${t.baseline != null ? ` <span class="muted">(baseline ${metricVal(t, t.baseline)})</span>` : ''}</b></div></div>
      ${notes.length ? `<ul class="note-list">${notes.map(c => `<li>${esc(fmtDate(c.date))}: ${esc(c.note)}</li>`).join('')}</ul>` : ''}
      <div class="btn-row"><button class="btn ${fin ? 'primary' : ''}" data-action="verdict-open" data-test="${t.id}">${fin ? 'Give verdict' : 'Stop early and give verdict'}</button><button class="btn" data-action="open" data-id="${esc(p.id)}">Protocol</button></div></div>`;
  }
  const cap = L.capacity(S, 'test');
  if (cap.used < cap.limit - 1e-9) h += `<div class="btn-row" style="margin:0 0 6px"><button class="btn primary" data-action="sheet-start">Start a test</button></div>`;
  const q = S.protocols.filter(p => p.layer === 'backlog' && p.queue_order != null).sort((a, b) => a.queue_order - b.queue_order);
  h += sec('Queue', `${q.length}`);
  h += q.length ? `<div class="rows">${q.map(p => `<div class="row row-plain"><div class="row-main" data-action="open" data-id="${esc(p.id)}"><div class="row-name">${esc(p.name)}</div><div class="row-sub">${esc(p.codes.join(' / '))}</div></div>
    <button class="btn small" data-action="sheet-start" data-id="${esc(p.id)}">Start</button><button class="btn small" data-action="queue-remove" data-id="${esc(p.id)}" aria-label="Remove from queue">✕</button></div>`).join('')}</div>` : `<div class="empty">Queue is empty. Add protocols from their card.</div>`;
  const hist = S.tests.filter(t => t.status === 'finished').sort((a, b) => b.end.localeCompare(a.end));
  h += sec('History', `${hist.length}`);
  const VN = { keep_l2: 'Kept in Layer 2', promote_base: 'Promoted to Base', drop: 'Dropped' };
  h += hist.length ? hist.map(t => { const p = L.byId(S, t.protocol), st = L.testStats(S, t, real);
    return `<div class="card"><b>${esc(p.name)}</b> <span class="muted">${esc(t.start)} → ${esc(t.end)}</span>
      <div>${VN[t.verdict]} · logged ${Math.round(st.pct * 100)}% · average ${avgText(t, st.avg)}${t.baseline != null ? ` vs baseline ${metricVal(t, t.baseline)}` : ''}</div>
      ${t.learned ? `<div class="muted">“${esc(t.learned)}”</div>` : ''}</div>`; }).join('') : `<div class="empty">Finished tests appear here.</div>`;
  return h;
}

// ---------- Review ----------
function heatCells(weeks, fracFor, pausedSet) {
  const real = L.today(), start = L.addDays(L.weekStart(real), -7 * (weeks - 1)), out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = L.addDays(start, i), f = d > real ? 0 : fracFor(d);
    const cls = f >= .999 ? 'f' : f > .66 ? 'l3' : f > .33 ? 'l2' : f > 0 ? 'l1' : '';
    out.push(`<i class="${cls} ${pausedSet.has(d) ? 'p' : ''} ${d > real ? 'future' : ''}" title="${d}"></i>`);
  }
  return `<div class="heat" role="img" aria-label="Calendar heat map">${out.join('')}</div>`;
}
function renderReview() {
  const real = L.today(), wk = L.weekStart(real);
  const start = ui.period === 'week' ? wk : L.addDays(real, -29);
  const days = L.windowDates(real, L.diffDays(start, real) + 1).filter(d => !S.pauses.includes(d));
  const xpP = S.completions.filter(c => c.date >= start && c.date <= real).reduce((a, c) => a + c.xp, 0);
  const base = L.inLayer(S, 'base'), l2 = L.inLayer(S, 'l2');
  const baseDone = base.reduce((a, p) => { const set = L.doneDates(S, p.id); return a + days.filter(d => set.has(d)).length; }, 0);
  const basePct = base.length && days.length ? baseDone / (base.length * days.length) : null;
  const met = l2.filter(p => L.weekCount(S, p.id, wk) >= L.weekTarget(S, p, wk)).length;
  const lp = L.levelProgress(L.totalXp(S), C());
  let h = `<div class="btn-row" style="margin:0 0 12px;justify-content:space-between"><span class="seg"><button data-action="period" data-period="week" aria-pressed="${ui.period === 'week'}">Week</button><button data-action="period" data-period="30" aria-pressed="${ui.period === '30'}">30 days</button></span>
    <button class="btn small" data-action="settings-open">Settings and backup</button></div>`;
  h += `<div class="kpis"><div class="kpi"><small>Base completion</small><b>${basePct == null ? '–' : Math.round(basePct * 100) + '%'}</b></div>
    <div class="kpi"><small>Layer 2 targets (this week)</small><b>${met}/${l2.length}</b></div>
    <div class="kpi"><small>XP in period</small><b>${xpP}</b></div>
    <div class="kpi"><small>Player level</small><b>${lp.level}</b> <small>${lp.into}/${lp.need} XP</small></div></div>`;
  h += sec('Base, last 12 weeks', 'darker = more done');
  const pset = new Set(S.pauses);
  h += `<div class="card">${base.length ? heatCells(12, d => base.filter(p => L.doneDates(S, p.id).has(d)).length / base.length, pset) : '<div class="empty">No Base protocols.</div>'}</div>`;
  h += sec('Consistency, 30 days', 'Layer 2: 4 weeks');
  const list = [...base, ...l2, ...L.inLayer(S, 'test')];
  h += `<div class="card">${list.length ? list.map(p => { const v = L.completionPct(S, p, real); const pc = v == null ? 0 : Math.round(v * 100);
    const low = pc < 50 && L.countDone(S, p.id) > 0; // quiet marker, only once the protocol has been used
    return `<div class="pct-row"><span data-action="open" data-id="${esc(p.id)}" style="cursor:pointer">${esc(p.name)} <small>${tag(p.layer)}</small></span><span class="bar cap"><i style="width:${pc}%"></i></span><span class="${low ? 'low' : ''}">${pc}%${low ? ' ●' : ''}</span></div>`; }).join('') : '<div class="empty">Nothing to show.</div>'}</div>`;
  const ranked = S.protocols.filter(p => L.xpOf(S, p.id) > 0).sort((a, b) => L.xpOf(S, b.id) - L.xpOf(S, a.id));
  h += sec('Levels', `${ranked.length}`);
  h += `<div class="card">${ranked.length ? ranked.map(p => { const lp2 = L.levelProgress(L.xpOf(S, p.id), C());
    return `<div class="pct-row"><span data-action="open" data-id="${esc(p.id)}" style="cursor:pointer">${esc(p.name)}</span><span class="bar"><i style="width:${Math.round(lp2.frac * 100)}%"></i></span><span class="badge">L${lp2.level}</span></div>`; }).join('') : '<div class="empty">Complete a protocol to earn XP.</div>'}</div>`;
  h += `<div class="btn-row"><button class="btn" data-action="tab" data-tab="tests">Test history</button></div>`;
  return h;
}

// ---------- Sheets ----------
function renderSheet() {
  const root = $('#sheetRoot'), prev = root.querySelector('.sheet')?.scrollTop || 0;
  if (!ui.sheet) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
  const sh = ui.sheet;
  const body = { protocol: sheetProtocol, edit: sheetEdit, move: sheetMove, swap: sheetSwap, startTest: sheetStart, verdict: sheetVerdict, settings: sheetSettings }[sh.type](sh);
  root.innerHTML = `<div class="backdrop" data-action="backdrop"><div class="sheet" role="dialog" aria-modal="true">${body}</div></div>`;
  document.body.style.overflow = 'hidden';
  if (sh.keepScroll) root.querySelector('.sheet').scrollTop = prev;
}
const head = (title, sub) => `<div class="sheet-head"><div>${sub ? `<small>${sub}</small>` : ''}<h2>${title}</h2></div><button class="x" data-action="close" aria-label="Close">✕</button></div>`;
const openSheet = o => { ui.sheet = o; renderSheet(); };
const closeSheet = () => { ui.sheet = null; renderSheet(); };

function sheetProtocol(sh) {
  const p = L.byId(S, sh.id), real = L.today(), wk = L.weekStart(real);
  const xp = L.xpOf(S, p.id), lp = L.levelProgress(xp, C()), last = L.lastDone(S, p.id);
  const set = L.doneDates(S, p.id), pset = new Set(S.pauses);
  const rel = new Set([...p.goes_with.map(c => L.byCode(S, c)).filter(Boolean).map(x => x.id), ...S.protocols.filter(x => x.goes_with.some(c => p.codes.includes(c))).map(x => x.id)]);
  const target = p.layer === 'l2' ? `${L.weekTarget(S, p, wk)} per week${p.target_override != null ? ' (override)' : ''}` : '–';
  const sched = p.type === 'scheduled' && p.layer !== 'archived';
  return `${head(esc(p.name), `${esc(p.codes.join(' / '))} · ${esc(p.category)}`)}
    <div>${tag(p.layer)} ${p.layer === 'backlog' && p.queue_order != null ? '<span class="tag test">In test queue</span>' : ''}</div>
    <p class="abstract">${p.abstract ? esc(p.abstract) : '<span class="muted">No abstract yet. Tap Edit to write one.</span>'}</p>
    ${p.layer === 'doctor' ? '<div class="banner warn">Talk to a doctor before trying this. No XP, outside the pyramid.</div>' : ''}
    <div class="row-sub" style="margin-bottom:4px">Level ${lp.level} · ${xp} XP · ${lp.into}/${lp.need} to next level</div>
    <div class="bar"><i style="width:${Math.round(lp.frac * 100)}%"></i></div>
    <div class="meta">
      <div><small>Effort</small><b>${fmtN(p.effort)}</b></div><div><small>Recommended</small><b>${p.freq_per_week != null ? p.freq_per_week + ' per week' : p.type === 'as_needed' ? 'as needed' : '–'}</b></div>
      <div><small>Weekly target</small><b>${target}</b></div><div><small>Time of day</small><b>${p.time_of_day ? TOD_NAME[p.time_of_day] : '–'}</b></div>
      <div><small>Completions</small><b>${L.countDone(S, p.id)}</b></div><div><small>Last done</small><b>${last ? esc(fmtDate(last)) : '–'}</b></div>
      <div><small>Book pages</small><b>${esc(pagesText(p))}</b></div>${p.fixed_weekdays && p.fixed_weekdays.length ? `<div><small>Fixed days</small><b>${p.fixed_weekdays.map(i => WD[i]).join(' ')}</b></div>` : ''}
    </div>
    ${p.note ? `<div class="muted">Note: ${esc(p.note)}</div>` : ''}
    ${rel.size ? `<div class="links" style="margin-top:6px">Goes with: ${[...rel].map(id => `<button class="linkbtn" data-action="open" data-id="${esc(id)}">${esc(L.byId(S, id).codes[0])}</button>`).join(', ')}</div>` : ''}
    <div class="sec"><h3>Last 12 weeks</h3></div>${heatCells(12, d => set.has(d) ? 1 : 0, pset)}
    <div class="btn-row">
      <button class="btn" data-action="edit" data-id="${esc(p.id)}">Edit</button>
      ${sched && p.layer !== 'test' ? `<button class="btn" data-action="sheet-move" data-id="${esc(p.id)}">Move to…</button>` : ''}
      ${sched && ['backlog', 'base', 'l2'].includes(p.layer) ? `<button class="btn" data-action="sheet-start" data-id="${esc(p.id)}">Start a test</button>` : ''}
      ${p.layer === 'test' ? `<button class="btn" data-action="verdict-from" data-id="${esc(p.id)}">Stop test, give verdict</button>` : ''}
      ${p.layer === 'backlog' && p.queue_order == null ? `<button class="btn" data-action="queue-add" data-id="${esc(p.id)}">Add to test queue</button>` : ''}
      ${p.layer === 'backlog' && p.queue_order != null ? `<button class="btn" data-action="queue-remove" data-id="${esc(p.id)}">Remove from queue</button>` : ''}
      ${p.layer === 'archived' ? `<button class="btn" data-action="restore" data-id="${esc(p.id)}">Restore</button>` : p.layer !== 'test' ? `<button class="btn danger" data-action="archive" data-id="${esc(p.id)}">Archive</button>` : ''}
    </div>`;
}

function sheetMove(sh) {
  const p = L.byId(S, sh.id);
  const opts = [['base', 'Base'], ['l2', 'Layer 2'], ['backlog', 'Backlog'], ['doctor', 'Doctor first']];
  return `${head('Move ' + esc(p.name), 'Effort ' + fmtN(p.effort))}
    <div class="rows">${opts.map(([k, n]) => { const cap = ['base', 'l2'].includes(k) ? L.capacity(S, k) : null;
      return `<div class="row row-plain"><div class="row-main"><div class="row-name">${n}</div><div class="row-sub">${cap ? `${fmtN(cap.used)} / ${fmtN(cap.limit)} used` : k === 'doctor' ? 'No XP, outside the pyramid' : 'Not placed'}</div></div>
      <button class="btn small ${p.layer === k ? '' : 'primary'}" data-action="move" data-id="${esc(p.id)}" data-layer="${k}" ${p.layer === k ? 'disabled' : ''}>${p.layer === k ? 'Here' : 'Move'}</button></div>`; }).join('')}
      <div class="row row-plain"><div class="row-main"><div class="row-name">Test</div><div class="row-sub">Starts a test with a daily metric</div></div><button class="btn small primary" data-action="sheet-start" data-id="${esc(p.id)}">Start test</button></div></div>
    <div class="btn-row"><button class="btn" data-action="open" data-id="${esc(p.id)}">Back</button></div>`;
}
function sheetSwap(sh) {
  const p = L.byId(S, sh.id);
  return `${head('No room in ' + LAYER_NAME[sh.layer])}
    <p>Moving <b>${esc(p.name)}</b> (effort ${fmtN(p.effort)}) would put ${LAYER_NAME[sh.layer]} over its limit by <b>${fmtN(sh.over)}</b>. Swap it with one of these, which goes to the backlog:</p>
    <div class="rows">${sh.candidates.map(id => { const c = L.byId(S, id);
      return `<div class="row row-plain"><div class="row-main"><div class="row-name">${esc(c.name)}</div><div class="row-sub">effort ${fmtN(c.effort)}</div></div><button class="btn small primary" data-action="swap" data-id="${esc(p.id)}" data-layer="${sh.layer}" data-swap="${esc(id)}">Swap</button></div>`; }).join('') || '<div class="empty">No single protocol frees enough room. Lower an effort or raise the limit.</div>'}</div>
    <div class="btn-row"><button class="btn" data-action="sheet-move" data-id="${esc(p.id)}">Cancel</button></div>`;
}

function sheetEdit(sh) {
  const isNew = !sh.id;
  const p = isNew ? { name: '', codes: [], pages: {}, category: 'Custom', abstract: '', type: 'scheduled', effort: 1, freq_per_week: null, target_override: null, fixed_weekdays: [], time_of_day: null, goes_with: [], note: '' } : L.byId(S, sh.id);
  const pg = Object.entries(p.pages || {}).map(([k, v]) => `${k}:${v}`).join(', ');
  const wd = p.fixed_weekdays || [];
  return `${head(isNew ? 'New custom protocol' : 'Edit ' + esc(p.name), isNew ? '' : esc(p.codes.join(' / ')))}
    <form data-form="edit" autocomplete="off">
      <label for="f-name">Name</label><input id="f-name" name="name" type="text" required value="${esc(p.name)}">
      <label for="f-codes">Codes (first is the main code, comma separated)</label><input id="f-codes" name="codes" type="text" value="${esc(p.codes.join(', '))}" placeholder="auto (CU1, CU2…)">
      <div class="grid2"><div><label for="f-cat">Category</label><select id="f-cat" name="category">${CATS.map(c => `<option ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label for="f-type">Type</label><select id="f-type" name="type"><option value="scheduled" ${p.type === 'scheduled' ? 'selected' : ''}>Scheduled</option><option value="as_needed" ${p.type === 'as_needed' ? 'selected' : ''}>As needed</option></select></div></div>
      <label for="f-abs">Abstract (your own words)</label><textarea id="f-abs" name="abstract">${esc(p.abstract)}</textarea>
      <div class="grid3"><div><label for="f-eff">Effort</label><input id="f-eff" name="effort" type="text" inputmode="decimal" value="${fmtN(p.effort)}"></div>
      <div><label for="f-freq">Recommended / week</label><input id="f-freq" name="freq" type="text" inputmode="decimal" value="${p.freq_per_week != null ? fmtN(p.freq_per_week) : ''}"></div>
      <div><label for="f-ovr">Target override</label><input id="f-ovr" name="override" type="text" inputmode="decimal" value="${p.target_override != null ? fmtN(p.target_override) : ''}"></div></div>
      <label>Fixed weekdays (Layer 2, optional)</label><div class="wd">${WD.map((n, i) => `<label class="inline"><input type="checkbox" name="wd" value="${i}" ${wd.includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</div>
      <div class="grid2"><div><label for="f-tod">Time of day</label><select id="f-tod" name="tod"><option value="">–</option>${Object.entries(TOD_NAME).map(([k, n]) => `<option value="${k}" ${p.time_of_day === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label for="f-goes">Goes with (codes)</label><input id="f-goes" name="goes" type="text" value="${esc((p.goes_with || []).join(', '))}"></div></div>
      <label for="f-pages">Book pages (CODE:page, comma separated)</label><input id="f-pages" name="pages" type="text" value="${esc(pg)}">
      <label for="f-note">Note</label><input id="f-note" name="note" type="text" value="${esc(p.note || '')}">
      ${sh.err ? `<div class="err">${esc(sh.err)}</div>` : ''}
      <div class="btn-row"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-action="${isNew ? 'close' : 'open'}" data-id="${esc(sh.id || '')}">Cancel</button></div>
    </form>`;
}

function sheetStart(sh) {
  const cands = S.protocols.filter(p => p.type === 'scheduled' && ['backlog', 'base', 'l2'].includes(p.layer))
    .sort((a, b) => (a.queue_order ?? 1e9) - (b.queue_order ?? 1e9) || a.codes[0].localeCompare(b.codes[0], 'en', { numeric: true }));
  const cap = L.capacity(S, 'test');
  return `${head('Start a test', `Test slot ${fmtN(cap.used)} / ${cap.limit} used`)}
    <form data-form="starttest" autocomplete="off">
      <label for="t-p">Protocol</label><select id="t-p" name="pid">${cands.map(p => `<option value="${esc(p.id)}" ${p.id === sh.pid ? 'selected' : ''}>${esc(protLabel(p))}${p.queue_order != null ? ' (queued)' : ''}</option>`).join('')}</select>
      <div class="grid2"><div><label for="t-days">Duration (days, 14 to 28 suggested)</label><input id="t-days" name="days" type="text" inputmode="numeric" value="21"></div>
      <div><label for="t-type">Metric type</label><select id="t-type" name="mtype"><option value="rating">Rating 1 to 5</option><option value="number">Number</option><option value="yesno">Yes / no</option></select></div></div>
      <div class="grid2"><div><label for="t-mname">Daily metric name</label><input id="t-mname" name="mname" type="text" value="Daily rating" required></div>
      <div><label for="t-unit">Unit (numbers)</label><input id="t-unit" name="unit" type="text" placeholder="e.g. min"></div></div>
      <label for="t-base">Baseline (optional, how it is now)</label><input id="t-base" name="baseline" type="text" inputmode="decimal">
      <label for="t-hyp">Hypothesis (one line)</label><input id="t-hyp" name="hyp" type="text" placeholder="e.g. falls asleep faster">
      ${sh.err ? `<div class="err">${esc(sh.err)}</div>` : ''}
      <div class="btn-row"><button class="btn primary" type="submit" ${cands.length ? '' : 'disabled'}>Start test</button><button class="btn" type="button" data-action="close">Cancel</button></div>
    </form>`;
}

function sheetVerdict(sh) {
  const t = S.tests.find(x => x.id === sh.testId), p = L.byId(S, t.protocol), st = L.testStats(S, t, L.today());
  const opts = [['keep_l2', 'Keep in Layer 2'], ['promote_base', 'Promote to Base'], ['drop', 'Drop to backlog']];
  return `${head('Verdict: ' + esc(p.name), `Started ${esc(t.start)}`)}
    <div class="meta"><div><small>Logged</small><b>${st.logged}/${st.elapsed} days (${Math.round(st.pct * 100)}%)</b></div>
      <div><small>Average ${esc(t.metric.name)}</small><b>${avgText(t, st.avg)}</b></div>
      ${t.baseline != null ? `<div><small>Baseline</small><b>${metricVal(t, t.baseline)}</b></div>` : ''}
      ${st.diff != null ? `<div><small>Change</small><b>${st.diff >= 0 ? '+' : ''}${fmtN(t.metric.type === 'yesno' ? st.diff * 100 : st.diff)}${t.metric.type === 'yesno' ? ' pp' : ''}</b></div>` : ''}</div>
    ${st.logs.filter(c => c.note).length ? `<ul class="note-list">${st.logs.filter(c => c.note).map(c => `<li>${esc(fmtDate(c.date))}: ${esc(c.note)}</li>`).join('')}</ul>` : ''}
    <form data-form="verdict" data-test="${t.id}">
      <label>Your verdict</label><div class="chips">${opts.map(([k, n]) => `<label class="inline chip"><input type="radio" name="verdict" value="${k}" ${sh.verdict === k ? 'checked' : ''} required>${n}</label>`).join('')}</div>
      <label for="v-learn">What I learned (optional)</label><textarea id="v-learn" name="learned">${esc(sh.learned || '')}</textarea>
      ${sh.swap ? `<div class="banner warn" style="margin-top:12px"><div>${LAYER_NAME[sh.swap.layer]} is full (over by ${fmtN(sh.swap.over)}). Pick a protocol to move to the backlog:<select name="swap" style="margin-top:8px">${sh.swap.candidates.map(id => `<option value="${esc(id)}">${esc(L.byId(S, id).name)} (effort ${fmtN(L.byId(S, id).effort)})</option>`).join('')}</select></div></div>${sh.swap.candidates.length ? '' : '<div class="err">No single protocol frees enough room. Pick another verdict, lower an effort or raise the limit.</div>'}` : ''}
      <div class="row-sub" style="margin-top:8px">Finishing gives +${S.settings.bonus_test_verdict} XP, whatever you decide.</div>
      <div class="btn-row"><button class="btn primary" type="submit">Confirm verdict</button><button class="btn" type="button" data-action="close">Not yet</button></div>
    </form>`;
}

function sheetSettings() {
  const s = S.settings;
  const num = (name, label, v) => `<div><label for="s-${name}">${label}</label><input id="s-${name}" name="${name}" type="text" inputmode="decimal" value="${fmtN(v)}"></div>`;
  return `${head('Settings and backup')}
    <form data-form="settings" autocomplete="off">
      <div class="sec"><h3>Effort limits</h3></div>
      <div class="grid3">${num('lim_base', 'Base', s.layer_limits.base)}${num('lim_l2', 'Layer 2', s.layer_limits.l2)}${num('lim_test', 'Test', s.layer_limits.test)}</div>
      <div class="sec"><h3>XP and levels</h3></div>
      <div class="grid2">${num('xp_per_effort', 'XP per effort', s.xp_per_effort)}${num('level_cost', 'Level cost (× level)', s.level_cost_per_level)}${num('bonus_l2', 'Layer 2 target bonus', s.bonus_l2_week_target)}${num('bonus_test', 'Test verdict bonus', s.bonus_test_verdict)}${num('xp_asn', 'As-needed XP', s.xp_as_needed)}${num('backfill', 'Backfill days', s.backfill_days)}</div>
      <label class="inline"><input type="checkbox" name="checkin" ${s.weekly_checkin ? 'checked' : ''}>Sunday check-in banner on Today</label>
      <div class="btn-row"><button class="btn primary" type="submit">Save settings</button></div>
    </form>
    <div class="sec"><h3>Backup</h3></div>
    <div class="row-sub">Data lives only in this browser. Export a copy now and then.</div>
    <div class="btn-row"><button class="btn" data-action="export">Export JSON</button>
      <label class="btn" style="margin:0;color:var(--ink);font-size:1rem">Import JSON<input type="file" accept="application/json,.json" data-change="import" hidden></label></div>
    <div class="sec"><h3>Data</h3></div>
    <div class="btn-row"><button class="btn" data-action="reseed">Load starter library (erases progress)</button><button class="btn danger" data-action="erase">Erase everything</button></div>
    <div class="row-sub" style="margin-top:14px">Level formula: XP to reach level L = ${fmtN(s.level_cost_per_level / 2)} × L × (L − 1). Efforts, frequencies and abstracts are editable on each protocol.</div>`;
}

// ---------- events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, id = el.dataset.id;
  if (a === 'backdrop') { if (e.target === el) closeSheet(); return; }
  const act = ACTIONS[a];
  if (act) act(el, id);
});
document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  FORMS[form.dataset.form](form);
});
document.addEventListener('input', e => {
  if (e.target.dataset.input === 'libq') { ui.lib.q = e.target.value; $('#libList').innerHTML = libList(); }
});
document.addEventListener('change', e => {
  const t = e.target, k = t.dataset.change;
  if (!k) return;
  if (k === 'libcat') { ui.lib.cat = t.value; render(); }
  else if (k === 'libsort') { ui.lib.sort = t.value; render(); }
  else if (k === 'eff') { const v = parseN(t.value); if (v != null && v >= 0) { L.byId(S, t.dataset.id).effort = v; commit(); } else render(); }
  else if (k === 'lim') { const v = parseN(t.value); if (v != null && v >= 0) { S.settings.layer_limits[t.dataset.layer] = v; commit(); } else render(); }
  else if (k === 'import') importFile(t.files[0]);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = L.today();
  if (now !== ui.loadedDay) { if (ui.date === ui.loadedDay) ui.date = now; ui.loadedDay = now; render(); }
});

const ACTIONS = {
  tab: el => { ui.tab = el.dataset.tab; ui.sheet = null; render(); window.scrollTo(0, 0); },
  date: el => { ui.date = el.dataset.date; render(); },
  pause: () => { const i = S.pauses.indexOf(ui.date); if (i >= 0) S.pauses.splice(i, 1); else S.pauses.push(ui.date); commit(); },
  toggle: (el, id) => { const r = L.toggleDone(S, id, ui.date); commit(r.events); },
  asneeded: (el, id) => { const r = L.addAsNeeded(S, id, ui.date); commit(r.events); },
  'asneeded-undo': (el, id) => { L.undoAsNeeded(S, id, ui.date); commit(); },
  open: (el, id) => openSheet({ type: 'protocol', id }),
  close: () => closeSheet(),
  edit: (el, id) => openSheet({ type: 'edit', id: id || null }),
  'sheet-move': (el, id) => openSheet({ type: 'move', id }),
  move: (el, id) => {
    const layer = el.dataset.layer, r = L.moveProtocol(S, id, layer);
    if (r.ok) { Store.save(S); openSheet({ type: 'protocol', id }); render(); toast(`Moved to ${LAYER_NAME[layer]}`); }
    else openSheet({ type: 'swap', id, layer, over: r.over, candidates: r.candidates.map(c => c.id) });
  },
  swap: (el, id) => {
    const r = L.moveProtocol(S, id, el.dataset.layer, el.dataset.swap);
    if (r.ok) { Store.save(S); openSheet({ type: 'protocol', id }); render(); toast('Swapped'); }
  },
  'queue-add': (el, id) => { const p = L.byId(S, id); p.queue_order = Math.max(0, ...S.protocols.map(x => x.queue_order || 0)) + 1; Store.save(S); render(); openSheet({ type: 'protocol', id }); },
  'queue-remove': (el, id) => { L.byId(S, id).queue_order = null; Store.save(S); render(); if (ui.sheet) openSheet({ type: 'protocol', id }); },
  archive: (el, id) => { const p = L.byId(S, id); if (!confirm(`Archive "${p.name}"? Level and history are kept.`)) return; p.prev_layer = p.layer; p.layer = 'archived'; p.queue_order = null; p.doctor = false; Store.save(S); closeSheet(); render(); toast('Archived'); },
  restore: (el, id) => { const p = L.byId(S, id); p.layer = p.type === 'as_needed' ? 'as_needed' : 'backlog'; Store.save(S); render(); openSheet({ type: 'protocol', id }); },
  'sheet-start': (el, id) => openSheet({ type: 'startTest', pid: id || null }),
  metric: (el) => {
    const t = S.tests.find(x => x.id === el.dataset.test), v = Number(el.dataset.value), p = L.byId(S, t.protocol);
    const log = L.isDone(S, p.id, ui.date), note = ($('#metricNote') || {}).value || '';
    if (log && log.metric != null && Number(log.metric) === v) { L.clearMetric(S, t.id, ui.date); commit(); return; }
    const r = L.setMetric(S, t.id, ui.date, v, note); commit(r.events);
  },
  'metric-num': (el) => {
    const v = parseN(($('#metricNum') || {}).value); if (v == null) { toast('Enter a number'); return; }
    const r = L.setMetric(S, el.dataset.test, ui.date, v, ($('#metricNote') || {}).value || ''); commit(r.events);
  },
  'verdict-open': el => openSheet({ type: 'verdict', testId: el.dataset.test }),
  'verdict-from': (el, id) => { const t = L.activeTests(S).find(x => x.protocol === id); if (t) openSheet({ type: 'verdict', testId: t.id }); },
  'lib-layer': el => { ui.lib.layer = el.dataset.layer; render(); },
  period: el => { ui.period = el.dataset.period; render(); },
  'pyr-edit': () => { ui.pyrEdit = !ui.pyrEdit; render(); },
  'settings-open': () => openSheet({ type: 'settings' }),
  'checkin-go': () => { S.meta.checkin_dismissed = L.today(); Store.save(S); ui.tab = 'review'; render(); },
  'checkin-dismiss': () => { S.meta.checkin_dismissed = L.today(); commit(); },
  export: () => {
    const blob = new Blob([JSON.stringify(Object.assign({ app: 'protocols' }, S), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `protocols-backup-${L.today()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  reseed: () => { if (!confirm('Replace everything with the starter library? Progress is erased.')) return; S = L.stateFromLibrary(LIBRARY); closeSheet(); commit(); toast('Starter library loaded'); },
  erase: () => { if (!confirm('Erase all protocols and progress?')) return; S = L.normalizeState({ settings: S.settings, protocols: [] }); closeSheet(); commit(); },
};

function importFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (!Array.isArray(obj.protocols)) throw new Error('No protocols array');
      if (!confirm(`Import ${obj.protocols.length} protocols${obj.completions ? ' and ' + obj.completions.length + ' log entries' : ''}? This replaces what is here.`)) return;
      S = L.normalizeState(obj); closeSheet(); commit(); toast('Imported');
    } catch (err) { toast('Import failed: ' + err.message); }
  };
  r.readAsText(file);
}

const FORMS = {
  edit(form) {
    const f = new FormData(form), id = ui.sheet.id, isNew = !id;
    const name = String(f.get('name')).trim();
    let codes = String(f.get('codes')).split(',').map(s => s.trim()).filter(Boolean);
    if (!name) return fail('Name is required');
    if (!codes.length) { let n = 1; while (L.byCode(S, 'CU' + n)) n++; codes = ['CU' + n]; }
    for (const c of codes) { const o = L.byCode(S, c); if (o && o.id !== id) return fail(`Code ${c} is already used by ${o.name}`); }
    const type = f.get('type'), eff = parseN(f.get('effort'));
    const pages = {}; String(f.get('pages')).split(',').map(s => s.trim()).filter(Boolean).forEach(s => { const [k, v] = s.split(':'); if (k && parseN(v) != null) pages[k.trim()] = parseN(v); });
    const wd = f.getAll('wd').map(Number).sort();
    const data = {
      name, codes, category: f.get('category'), abstract: String(f.get('abstract')).trim(), type, pages,
      freq_per_week: parseN(f.get('freq')), target_override: parseN(f.get('override')), fixed_weekdays: wd.length ? wd : null,
      time_of_day: f.get('tod') || null, goes_with: String(f.get('goes')).split(',').map(s => s.trim()).filter(Boolean), note: String(f.get('note')).trim() || null,
    };
    if (isNew) {
      S.protocols.push(L.normProtocol(Object.assign(data, { id: codes[0], custom: true, layer: type === 'as_needed' ? 'as_needed' : 'backlog', suggested_layer: '?', effort: type === 'as_needed' ? 0 : (eff ?? 1) })));
      Store.save(S); ui.sheet = { type: 'protocol', id: codes[0] }; render(); return;
    }
    const p = L.byId(S, id), was = p.type;
    Object.assign(p, data);
    if (type === 'as_needed') { p.effort = 0; if (p.layer !== 'archived') p.layer = 'as_needed'; p.queue_order = null; }
    else { p.effort = eff ?? (was === 'as_needed' ? 1 : p.effort); if (was === 'as_needed' && p.layer === 'as_needed') p.layer = 'backlog'; }
    Store.save(S); ui.sheet = { type: 'protocol', id }; render();
    function fail(m) { ui.sheet.err = m; ui.sheet.keepScroll = true; renderSheet(); }
  },
  starttest(form) {
    const f = new FormData(form), days = parseInt(f.get('days'), 10);
    if (!(days >= 1 && days <= 90)) { ui.sheet.err = 'Duration must be 1 to 90 days'; ui.sheet.keepScroll = true; renderSheet(); return; }
    const r = L.startTest(S, { pid: f.get('pid'), start: L.today(), days, baseline: parseN(f.get('baseline')), hypothesis: String(f.get('hyp')).trim(),
      metric: { name: String(f.get('mname')).trim() || 'Daily rating', type: f.get('mtype'), unit: String(f.get('unit')).trim() } });
    if (!r.ok) { ui.sheet.err = r.err + '. Finish a test first or raise the Test limit.'; ui.sheet.pid = f.get('pid'); ui.sheet.keepScroll = true; renderSheet(); return; }
    closeSheet(); ui.tab = 'today'; ui.date = L.today(); commit(); toast('Test started. Log the metric on Today.');
  },
  verdict(form) {
    const f = new FormData(form), sh = ui.sheet, v = f.get('verdict'), learned = String(f.get('learned'));
    const r = L.finishTest(S, form.dataset.test, v, learned, f.get('swap') || null, L.today());
    if (!r.ok) {
      const layer = v === 'keep_l2' ? 'l2' : 'base';
      Object.assign(sh, { verdict: v, learned, keepScroll: true, swap: { layer, over: r.over, candidates: (r.candidates || []).map(c => c.id) } });
      renderSheet(); return;
    }
    closeSheet(); commit(r.events); toast('Verdict saved. +' + S.settings.bonus_test_verdict + ' XP');
  },
  settings(form) {
    const f = new FormData(form), s = S.settings, g = k => parseN(f.get(k));
    const pos = (v, d) => (v != null && v >= 0 ? v : d);
    s.layer_limits = { base: pos(g('lim_base'), 5), l2: pos(g('lim_l2'), 5), test: pos(g('lim_test'), 2) };
    s.xp_per_effort = pos(g('xp_per_effort'), 10); s.level_cost_per_level = Math.max(1, pos(g('level_cost'), 100));
    s.bonus_l2_week_target = pos(g('bonus_l2'), 20); s.bonus_test_verdict = pos(g('bonus_test'), 50); s.xp_as_needed = pos(g('xp_asn'), 5);
    s.backfill_days = Math.min(14, Math.round(pos(g('backfill'), 3))); s.weekly_checkin = f.get('checkin') === 'on';
    closeSheet(); commit(); toast('Settings saved');
  },
};

// ---------- boot ----------
async function boot() {
  await Store.init();
  const raw = await Store.load();
  S = raw && Array.isArray(raw.protocols) ? L.normalizeState(raw) : L.stateFromLibrary(LIBRARY);
  if (!raw) Store.save(S);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  window.protocolsApp = { state: () => S, ui };
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
boot();
})();
