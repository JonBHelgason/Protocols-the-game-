'use strict';
// Run: node tests/logic.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../logic.js');

// load starter library (library.js defines const LIBRARY)
const libSrc = fs.readFileSync(path.join(__dirname, '..', 'library.js'), 'utf8');
const LIBRARY = new Function(libSrc + '; return LIBRARY;')();

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('level formula: 100 XP -> 2, 300 XP -> 3, 1000 XP -> 5, 4500 XP -> 10', () => {
  assert.strictEqual(L.levelFromXp(0), 1);
  assert.strictEqual(L.levelFromXp(99), 1);
  assert.strictEqual(L.levelFromXp(100), 2);
  assert.strictEqual(L.levelFromXp(299), 2);
  assert.strictEqual(L.levelFromXp(300), 3);
  assert.strictEqual(L.levelFromXp(1000), 5);
  assert.strictEqual(L.levelFromXp(4500), 10);
});
t('level formula matches 50*L*(L-1) for L=1..60', () => {
  for (let lv = 1; lv <= 60; lv++) {
    const xp = 50 * lv * (lv - 1);
    assert.strictEqual(L.xpAtLevel(lv), xp);
    assert.strictEqual(L.levelFromXp(xp), lv, 'at ' + xp);
    if (xp > 0) assert.strictEqual(L.levelFromXp(xp - 5), lv - 1);
  }
});

const S = () => L.stateFromLibrary(LIBRARY);

t('library loads: 42 protocols, 47 codes', () => {
  const s = S();
  assert.strictEqual(s.protocols.length, 42);
  assert.strictEqual(s.protocols.reduce((a, p) => a + p.codes.length, 0), 47);
});
t('starting capacity: base 5, l2 4.5, test 0', () => {
  const s = S();
  assert.strictEqual(L.capacity(s, 'base').used, 5);
  assert.strictEqual(L.capacity(s, 'l2').used, 4.5);
  assert.strictEqual(L.capacity(s, 'test').used, 0);
});
t('weekly target = ceil(0.5 * f): 7->4, 3->2, override 3', () => {
  const s = S();
  assert.strictEqual(L.baseTarget(L.byId(s, 'SP2')), 4);
  assert.strictEqual(L.baseTarget(L.byId(s, 'NP7')), 2);
  assert.strictEqual(L.baseTarget(L.byId(s, 'EP4')), 2);
  assert.strictEqual(L.baseTarget(L.byId(s, 'EP2')), 3);
});
t('date helpers: Monday start of week, 2026-11-15 is Sunday', () => {
  assert.strictEqual(L.weekday('2026-11-15'), 6);
  assert.strictEqual(L.weekStart('2026-11-15'), '2026-11-09');
  assert.strictEqual(L.addDays('2026-11-30', 1), '2026-12-01');
});
t('toggle gives XP once, undo removes it', () => {
  const s = S(), d = L.today();
  const r = L.toggleDone(s, 'SP1', d);
  assert.strictEqual(r.done, true);
  assert.strictEqual(L.xpOf(s, 'SP1'), 10);
  const r2 = L.toggleDone(s, 'SP1', d);
  assert.strictEqual(r2.done, false);
  assert.strictEqual(L.xpOf(s, 'SP1'), 0);
});
t('XP uses effort: effort 0.5 -> 5 XP; level up after 10 completions at effort 1', () => {
  const s = S();
  L.toggleDone(s, 'NP2', L.today());
  assert.strictEqual(L.xpOf(s, 'NP2'), 5);
  let ev = [];
  for (let i = 0; i < 10; i++) ev = L.toggleDone(s, 'SP1', L.addDays(L.today(), -i)).events;
  assert.strictEqual(L.lvOf(s, 'SP1'), 2);
  assert.ok(ev.some(e => e.kind === 'protocol' && e.level === 2));
});
t('backfill kind for past dates', () => {
  const s = S();
  L.toggleDone(s, 'SP1', L.addDays(L.today(), -1));
  assert.strictEqual(s.completions[0].kind, 'backfill');
});
t('L2 weekly bonus +20 once, removed on undo', () => {
  const s = S(), wk = L.weekStart(L.today());
  // NP7: target 2, effort 0.5
  L.toggleDone(s, 'NP7', wk);
  assert.strictEqual(L.xpOf(s, 'NP7'), 5);
  L.toggleDone(s, 'NP7', L.addDays(wk, 1));
  assert.strictEqual(L.xpOf(s, 'NP7'), 5 + 5 + 20);
  L.toggleDone(s, 'NP7', L.addDays(wk, 2));
  assert.strictEqual(L.xpOf(s, 'NP7'), 5 + 5 + 5 + 20);
  L.toggleDone(s, 'NP7', L.addDays(wk, 2));
  L.toggleDone(s, 'NP7', L.addDays(wk, 1));
  assert.strictEqual(L.xpOf(s, 'NP7'), 5);
});
t('pause day shrinks the weekly target', () => {
  const s = S(), wk = L.weekStart(L.today()), sp2 = L.byId(s, 'SP2');
  assert.strictEqual(L.weekTarget(s, sp2, wk), 4);
  s.pauses.push(wk); s.pauses.push(L.addDays(wk, 1)); // 2 pause days: ceil(4*5/7)=3
  assert.strictEqual(L.weekTarget(s, sp2, wk), 3);
});
t('as-needed: +5 per tap, several per day, undo', () => {
  const s = S(), d = L.today();
  L.addAsNeeded(s, 'SC1', d); L.addAsNeeded(s, 'SC1', d);
  assert.strictEqual(L.xpOf(s, 'SC1'), 10);
  L.undoAsNeeded(s, 'SC1', d);
  assert.strictEqual(L.xpOf(s, 'SC1'), 5);
});
t('move blocked when over limit, offers swap; swap works', () => {
  const s = S();
  // base is full (5). Moving SC4 (effort 1) into base is over by 1.
  const r = L.moveProtocol(s, 'SC4', 'base');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.over, 1);
  assert.ok(r.candidates.length > 0 && r.candidates.every(c => c.effort >= 1));
  const r2 = L.moveProtocol(s, 'SC4', 'base', r.candidates[0].id);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(L.byId(s, r.candidates[0].id).layer, 'backlog');
  assert.strictEqual(L.capacity(s, 'base').used, 5);
});
t('move within limit works and keeps XP', () => {
  const s = S();
  L.toggleDone(s, 'NP6', L.today());
  const r = L.moveProtocol(s, 'NP6', 'backlog');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(L.xpOf(s, 'NP6'), 5);
});
t('test flow: start, log metric, verdict gives +50 XP and moves protocol', () => {
  const s = S(), d = L.today();
  const r = L.startTest(s, { pid: 'SC2', start: d, days: 14, metric: { name: 'Energy', type: 'rating', unit: '' }, baseline: 3, hypothesis: 'more energy' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(L.byId(s, 'SC2').layer, 'test');
  const test = L.activeTests(s)[0];
  L.setMetric(s, test.id, d, 4, 'ok');
  L.setMetric(s, test.id, d, 5, 'better'); // replaces, no second XP
  assert.strictEqual(L.xpOf(s, 'SC2'), 10);
  const st = L.testStats(s, test, d);
  assert.strictEqual(st.logged, 1);
  assert.strictEqual(st.avg, 5);
  assert.strictEqual(st.diff, 2);
  const f = L.finishTest(s, test.id, 'drop', 'not for me', null, d);
  assert.strictEqual(f.ok, true);
  assert.strictEqual(L.byId(s, 'SC2').layer, 'backlog');
  assert.strictEqual(L.xpOf(s, 'SC2'), 60);
  assert.strictEqual(test.status, 'finished');
});
t('test layer limit 2: third test refused', () => {
  const s = S(), d = L.today(), m = { name: 'x', type: 'rating', unit: '' };
  assert.ok(L.startTest(s, { pid: 'SC2', start: d, days: 14, metric: m, baseline: null }).ok);
  assert.ok(L.startTest(s, { pid: 'SP11', start: d, days: 14, metric: m, baseline: null }).ok);
  assert.strictEqual(L.startTest(s, { pid: 'SC5', start: d, days: 14, metric: m, baseline: null }).ok, false);
});
t('verdict promote to full base needs a swap', () => {
  const s = S(), d = L.today();
  L.startTest(s, { pid: 'SC2', start: d, days: 14, metric: { name: 'x', type: 'rating', unit: '' }, baseline: null });
  const test = L.activeTests(s)[0];
  const r = L.finishTest(s, test.id, 'promote_base', '', null, d);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(L.byId(s, 'SC2').layer, 'test'); // unchanged
  assert.strictEqual(test.status, 'active');
  const r2 = L.finishTest(s, test.id, 'promote_base', '', r.candidates[0].id, d);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(L.byId(s, 'SC2').layer, 'base');
});
t('test finished flag after planned days', () => {
  const s = S(), d = L.today();
  L.startTest(s, { pid: 'SC2', start: L.addDays(d, -14), days: 14, metric: { name: 'x', type: 'rating', unit: '' }, baseline: null });
  const test = L.activeTests(s)[0];
  assert.strictEqual(L.testDay(test, d), 15);
  assert.strictEqual(L.testFinished(test, d), true);
  assert.strictEqual(L.testFinished(test, L.addDays(d, -1)), false);
});
t('changing effort later does not change old XP', () => {
  const s = S();
  L.toggleDone(s, 'SP1', L.today());
  L.byId(s, 'SP1').effort = 2;
  assert.strictEqual(L.xpOf(s, 'SP1'), 10);
  L.toggleDone(s, 'SP1', L.addDays(L.today(), -1));
  assert.strictEqual(L.xpOf(s, 'SP1'), 30);
});
t('completion % base: 3 of 30 days', () => {
  const s = S(), d = L.today();
  for (let i = 0; i < 3; i++) L.toggleDone(s, 'SP4', L.addDays(d, -i));
  assert.ok(Math.abs(L.completionPct(s, L.byId(s, 'SP4'), d) - 0.1) < 1e-9);
  s.pauses.push(L.addDays(d, -10));
  assert.ok(Math.abs(L.completionPct(s, L.byId(s, 'SP4'), d) - 3 / 29) < 1e-9);
});

console.log(`\n${n} tests passed`);
