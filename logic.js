'use strict';
/* Protocols app - pure logic (no DOM). Rules follow Protocols-App-Spec.md */
const Logic = (() => {
  // ---------- dates (local, YYYY-MM-DD, week starts Monday) ----------
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => dstr(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
  const weekday = s => (parse(s).getDay() + 6) % 7; // Mon = 0
  const weekStart = s => addDays(s, -weekday(s));
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const round2 = n => Math.round(n * 100) / 100;
  const EPS = 1e-9;

  // ---------- defaults / normalising ----------
  const DEFAULT_SETTINGS = {
    layer_limits: { base: 5, l2: 5, test: 2 },
    xp_per_effort: 10, level_cost_per_level: 100,
    bonus_l2_week_target: 20, bonus_test_verdict: 50, xp_as_needed: 5,
    backfill_days: 3, weekly_checkin: false,
  };
  const TOD_ORDER = { morning: 0, day: 1, afternoon: 2, evening: 3 };

  function normProtocol(p) {
    const q = Object.assign({
      id: '', codes: [], pages: {}, name: '', category: 'Custom', abstract: '', type: 'scheduled',
      layer: 'backlog', suggested_layer: '?', effort: 1, freq_per_week: null, target_override: null,
      fixed_weekdays: null, time_of_day: null, goes_with: [], doctor: false, custom: false,
      queue_order: null, note: null, prev_layer: null,
    }, p);
    if (!q.codes || !q.codes.length) q.codes = [q.id];
    q.doctor = q.layer === 'doctor';
    return q;
  }
  function normalizeState(raw) {
    const s = {
      schema_version: 1,
      settings: Object.assign({}, DEFAULT_SETTINGS, raw.settings || {}),
      protocols: (raw.protocols || []).map(normProtocol),
      completions: raw.completions || [],
      tests: raw.tests || [],
      pauses: raw.pauses || [],
      meta: raw.meta || {},
    };
    s.settings.layer_limits = Object.assign({}, DEFAULT_SETTINGS.layer_limits, (raw.settings || {}).layer_limits || {});
    return s;
  }
  const stateFromLibrary = lib => normalizeState({ settings: lib.settings, protocols: lib.protocols });

  // ---------- levels and XP ----------
  // cost from level L to L+1 = c*L  =>  total XP to reach L = c*L*(L-1)/2
  const levelFromXp = (xp, c = 100) => Math.floor((1 + Math.sqrt(1 + 8 * xp / c)) / 2);
  const xpAtLevel = (lv, c = 100) => c * lv * (lv - 1) / 2;
  function levelProgress(xp, c = 100) {
    const lv = levelFromXp(xp, c), a = xpAtLevel(lv, c), b = xpAtLevel(lv + 1, c);
    return { level: lv, into: xp - a, need: b - a, frac: (xp - a) / (b - a) };
  }
  const xpOf = (s, id) => s.completions.reduce((a, c) => c.protocol === id ? a + c.xp : a, 0);
  const totalXp = s => s.completions.reduce((a, c) => a + c.xp, 0);
  const lvOf = (s, id) => levelFromXp(xpOf(s, id), s.settings.level_cost_per_level);
  const overallLevel = s => levelFromXp(totalXp(s), s.settings.level_cost_per_level);
  const xpOnDate = (s, date) => s.completions.reduce((a, c) => c.date === date ? a + c.xp : a, 0);

  // ---------- lookups ----------
  const byId = (s, id) => s.protocols.find(p => p.id === id);
  const byCode = (s, code) => s.protocols.find(p => p.codes.includes(code));
  const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  function sortProts(list) {
    return list.slice().sort((a, b) => {
      const ta = TOD_ORDER[a.time_of_day] ?? 9, tb = TOD_ORDER[b.time_of_day] ?? 9;
      return ta - tb || natural(a.codes[0], b.codes[0]);
    });
  }
  const inLayer = (s, layer) => s.protocols.filter(p => p.layer === layer);
  const isDone = (s, id, date) => s.completions.find(c => c.protocol === id && c.date === date && (c.kind === 'normal' || c.kind === 'backfill'));
  const lastDone = (s, id) => s.completions.filter(c => c.protocol === id && (c.kind === 'normal' || c.kind === 'backfill' || c.kind === 'as_needed')).map(c => c.date).sort().pop() || null;
  const countDone = (s, id) => s.completions.filter(c => c.protocol === id && c.kind !== 'bonus_week' && c.kind !== 'bonus_test').length;
  const doneDates = (s, id) => new Set(s.completions.filter(c => c.protocol === id && c.kind !== 'bonus_week' && c.kind !== 'bonus_test').map(c => c.date));
  function weekCount(s, id, wk) {
    const end = addDays(wk, 6);
    return s.completions.filter(c => c.protocol === id && (c.kind === 'normal' || c.kind === 'backfill') && c.date >= wk && c.date <= end).length;
  }
  const pausesInWeek = (s, wk) => s.pauses.filter(d => d >= wk && d <= addDays(wk, 6)).length;

  // ---------- capacity ----------
  function capacity(s, layer) {
    const used = round2(s.protocols.filter(p => p.layer === layer).reduce((a, p) => a + (p.effort || 0), 0));
    return { used, limit: s.settings.layer_limits[layer], over: used > s.settings.layer_limits[layer] + EPS };
  }
  function canMove(s, pid, layer) {
    if (!['base', 'l2', 'test'].includes(layer)) return { ok: true };
    const p = byId(s, pid);
    const others = s.protocols.filter(x => x.layer === layer && x.id !== pid).reduce((a, x) => a + (x.effort || 0), 0);
    const limit = s.settings.layer_limits[layer];
    const over = round2(others + p.effort - limit);
    if (over <= EPS) return { ok: true };
    const candidates = s.protocols.filter(x => x.layer === layer && x.id !== pid && x.effort >= over - EPS);
    return { ok: false, over, limit, candidates };
  }
  function moveProtocol(s, pid, layer, swapId) {
    const chk = canMove(s, pid, layer);
    if (!chk.ok && !swapId) return chk;
    if (!chk.ok && swapId) {
      const sw = byId(s, swapId);
      if (!chk.candidates.some(c => c.id === swapId)) return { ok: false, over: chk.over, candidates: chk.candidates };
      sw.layer = 'backlog'; sw.doctor = false;
    }
    const p = byId(s, pid);
    p.layer = layer; p.doctor = layer === 'doctor';
    if (layer !== 'backlog') p.queue_order = null;
    return { ok: true };
  }

  // ---------- weekly target (Layer 2) ----------
  function baseTarget(p) {
    if (p.target_override != null) return p.target_override;
    if (p.fixed_weekdays && p.fixed_weekdays.length) return p.fixed_weekdays.length;
    if (p.freq_per_week != null) return Math.ceil(0.5 * p.freq_per_week - EPS);
    return 1;
  }
  function weekTarget(s, p, wk) {
    const T = baseTarget(p), paused = pausesInWeek(s, wk);
    return paused ? Math.max(0, Math.ceil(T * (7 - paused) / 7 - EPS)) : T;
  }

  // ---------- completions ----------
  function addCompletion(s, o) {
    const c = Object.assign({ id: uid(), metric: null, note: '', week: null }, o);
    s.completions.push(c); return c;
  }
  function snapshotLevels(s, pid) { return { p: pid ? lvOf(s, pid) : null, all: overallLevel(s) }; }
  function levelEvents(s, pid, before) {
    const ev = [];
    if (pid && lvOf(s, pid) > before.p) ev.push({ kind: 'protocol', id: pid, level: lvOf(s, pid) });
    if (overallLevel(s) > before.all) ev.push({ kind: 'overall', level: overallLevel(s) });
    return ev;
  }
  function syncWeekBonus(s, p, date) {
    if (p.layer !== 'l2') return;
    const wk = weekStart(date);
    const has = s.completions.find(c => c.kind === 'bonus_week' && c.protocol === p.id && c.week === wk);
    const reached = weekCount(s, p.id, wk) >= weekTarget(s, p, wk);
    if (reached && !has) addCompletion(s, { protocol: p.id, date, xp: s.settings.bonus_l2_week_target, kind: 'bonus_week', week: wk });
    if (!reached && has) s.completions = s.completions.filter(c => c !== has);
  }
  // tap on a row: done <-> not done for that date
  function toggleDone(s, pid, date) {
    const p = byId(s, pid), before = snapshotLevels(s, pid);
    const ex = isDone(s, pid, date);
    if (ex) s.completions = s.completions.filter(c => c !== ex);
    else addCompletion(s, { protocol: pid, date, xp: Math.round(s.settings.xp_per_effort * p.effort), kind: date === today() ? 'normal' : 'backfill' });
    syncWeekBonus(s, p, date);
    return { done: !ex, events: levelEvents(s, pid, before) };
  }
  function addAsNeeded(s, pid, date) {
    const before = snapshotLevels(s, pid);
    addCompletion(s, { protocol: pid, date, xp: s.settings.xp_as_needed, kind: 'as_needed' });
    return { events: levelEvents(s, pid, before) };
  }
  function undoAsNeeded(s, pid, date) {
    const list = s.completions.filter(c => c.protocol === pid && c.date === date && c.kind === 'as_needed');
    if (list.length) s.completions = s.completions.filter(c => c !== list[list.length - 1]);
  }

  // ---------- tests ----------
  const activeTests = s => s.tests.filter(t => t.status === 'active');
  const testDay = (t, date) => diffDays(t.start, date) + 1;
  const testFinished = (t, date) => t.status === 'active' && testDay(t, date) > t.days;
  const testProtocolDone = (s, t) => s.completions.filter(c => c.protocol === t.protocol && c.metric != null && c.date >= t.start && c.date <= (t.end || addDays(t.start, t.days - 1)));
  function startTest(s, o) {
    const p = byId(s, o.pid);
    const chk = canMove(s, o.pid, 'test');
    if (!chk.ok) return { ok: false, err: `Test layer would be over by ${chk.over}` };
    p.layer = 'test'; p.doctor = false; p.queue_order = null;
    s.tests.push({ id: uid(), protocol: o.pid, start: o.start, days: o.days, metric: o.metric, baseline: o.baseline,
      hypothesis: o.hypothesis || '', status: 'active', end: null, verdict: null, learned: '' });
    return { ok: true };
  }
  function setMetric(s, testId, date, value, note) {
    const t = s.tests.find(x => x.id === testId), p = byId(s, t.protocol), before = snapshotLevels(s, p.id);
    const ex = isDone(s, p.id, date);
    if (ex) { ex.metric = value; if (note !== undefined) ex.note = note; }
    else addCompletion(s, { protocol: p.id, date, xp: Math.round(s.settings.xp_per_effort * p.effort), kind: date === today() ? 'normal' : 'backfill', metric: value, note: note || '' });
    return { events: levelEvents(s, p.id, before) };
  }
  function clearMetric(s, testId, date) {
    const t = s.tests.find(x => x.id === testId), ex = isDone(s, t.protocol, date);
    if (ex) s.completions = s.completions.filter(c => c !== ex);
  }
  function testStats(s, t, date) {
    const end = t.end || date;
    const lastDay = t.status === 'finished' ? t.end : addDays(t.start, t.days - 1);
    const stop = lastDay < end ? lastDay : end;
    const elapsed = Math.max(1, diffDays(t.start, stop) + 1);
    const logs = testProtocolDone(s, t).filter(c => c.date <= stop);
    const vals = logs.map(c => Number(c.metric)).filter(v => !isNaN(v));
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { logged: logs.length, elapsed, pct: logs.length / elapsed, avg, diff: (avg != null && t.baseline != null) ? avg - t.baseline : null, logs };
  }
  // verdict: 'keep_l2' | 'promote_base' | 'drop'
  function finishTest(s, testId, verdict, learned, swapId, date) {
    const t = s.tests.find(x => x.id === testId), p = byId(s, t.protocol);
    const layer = verdict === 'keep_l2' ? 'l2' : verdict === 'promote_base' ? 'base' : 'backlog';
    const before = snapshotLevels(s, p.id);
    const prev = p.layer;
    p.layer = 'backlog'; // free the Test slot before the capacity check
    const r = moveProtocol(s, p.id, layer, swapId);
    if (!r.ok) { p.layer = prev; return r; }
    t.status = 'finished'; t.end = date; t.verdict = verdict; t.learned = learned || '';
    addCompletion(s, { protocol: p.id, date, xp: s.settings.bonus_test_verdict, kind: 'bonus_test' });
    return { ok: true, events: levelEvents(s, p.id, before) };
  }

  // ---------- statistics ----------
  function windowDates(end, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i)); return out; }
  function completionPct(s, p, end) {
    if (p.type === 'as_needed') return null;
    if (p.layer === 'l2') {
      const dates = windowDates(end, 28), set = doneDates(s, p.id);
      const n = dates.filter(d => set.has(d)).length;
      return Math.min(1, n / (baseTarget(p) * 4));
    }
    const dates = windowDates(end, 30).filter(d => !s.pauses.includes(d)), set = doneDates(s, p.id);
    if (!dates.length) return null;
    return dates.filter(d => set.has(d)).length / dates.length;
  }

  const api = {
    pad, dstr, parse, today, addDays, weekday, weekStart, diffDays, uid, round2,
    DEFAULT_SETTINGS, normProtocol, normalizeState, stateFromLibrary,
    levelFromXp, xpAtLevel, levelProgress, xpOf, totalXp, lvOf, overallLevel, xpOnDate,
    byId, byCode, sortProts, inLayer, isDone, lastDone, countDone, doneDates, weekCount, pausesInWeek,
    capacity, canMove, moveProtocol, baseTarget, weekTarget,
    addCompletion, toggleDone, addAsNeeded, undoAsNeeded,
    activeTests, testDay, testFinished, startTest, setMetric, clearMetric, testStats, finishTest,
    windowDates, completionPct,
  };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
