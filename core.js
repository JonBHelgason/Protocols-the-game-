export const SCHEMA = 1;
export const layers = {base:'Base',l2:'Layer 2',test:'Test',backlog:'Backlog',as_needed:'As needed',doctor:'Doctor',archived:'Archived'};
export function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function shiftDay(key, days) { const d = new Date(key+'T12:00:00'); d.setDate(d.getDate()+days); return dateKey(d); }
export function dayDiff(a,b) { return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000); }
export function weekStart(key) { const day = new Date(key+'T12:00:00').getDay(); return shiftDay(key,-((day+6)%7)); }
export function level(xp, cost = 100) { return Math.floor((1+Math.sqrt(1+8*Math.max(0,xp)/cost))/2); }
export function xpFloor(l, cost = 100) { return cost*l*(l-1)/2; }
export function target(p) { return p.target_override ?? Math.ceil(.5*(p.freq_per_week ?? 7)); }
export function used(state, layer) { return state.protocols.filter(p=>p.layer===layer).reduce((n,p)=>n+p.effort,0); }
export function xp(state,id) { return [...state.completions,...state.bonuses].filter(c=>!id||c.protocol_id===id).reduce((n,c)=>n+c.xp,0); }
export function weekCount(state,id,date) { const start=weekStart(date); return new Set(state.completions.filter(c=>c.protocol_id===id&&c.date>=start&&c.date<=shiftDay(start,6)&&c.kind!=='as_needed').map(c=>c.date)).size; }
export function initial(library,today=dateKey()) { return {schema_version:SCHEMA,created_date:today,settings:structuredClone(library.settings),protocols:library.protocols.map(p=>({...p,created_date:today})),completions:[],bonuses:[],tests:[],pause_days:[]}; }
export function canMove(state,p,dest,swapId) {
  if (!(dest in layers)) return 'Choose a valid layer.';
  if (p.doctor && !['doctor','archived'].includes(dest)) return 'Doctor protocols stay outside the pyramid and earn no XP.';
  if (p.type==='as_needed'&&!['as_needed','archived'].includes(dest)) return 'As-needed protocols stay outside the pyramid.';
  if (dest==='doctor'&&!p.doctor) return 'Only doctor protocols belong in this section.';
  if (dest==='as_needed'&&p.type!=='as_needed') return 'This is a scheduled protocol.';
  if (dest in state.settings.layer_limits && dest!==p.layer) {
    const swap=state.protocols.find(x=>x.id===swapId&&x.layer===dest);
    const short=used(state,dest)+p.effort-(swap?.effort??0)-state.settings.layer_limits[dest];
    if(short>0) return `Needs ${short} more effort space in ${layers[dest]}. Choose a protocol to swap to backlog, or adjust the limit.`;
  }
  return null;
}
export function move(state,p,dest,swapId) { const error=canMove(state,p,dest,swapId); if(error) throw Error(error); const swap=state.protocols.find(x=>x.id===swapId&&x.layer===dest); if(swap) swap.layer='backlog'; p.layer=dest; }
export function toggleCompletion(state,p,date,today=dateKey(),metric=null,note='') {
  if(p.doctor||['archived','backlog','doctor'].includes(p.layer)) throw Error('Place this protocol in an active layer first.');
  if(dayDiff(date,today)<0||dayDiff(date,today)>state.settings.backfill_days) throw Error('Backfill is available for the last three days.');
  if(state.pause_days.includes(date)) throw Error('Resume this day before logging a completion.');
  if(p.paused) throw Error('Resume this protocol before logging.');
  const i=state.completions.findIndex(c=>c.protocol_id===p.id&&c.date===date&&c.kind!=='as_needed');
  if(i>=0&&p.type!=='as_needed') state.completions.splice(i,1);
  else state.completions.push({id:crypto.randomUUID(),protocol_id:p.id,date,xp:p.type==='as_needed'?state.settings.xp_as_needed:p.effort*state.settings.xp_per_effort,kind:p.type==='as_needed'?'as_needed':date===today?'normal':'backfill',metric_value:metric,note,layer:p.layer,test_id:state.tests.find(t=>t.protocol_id===p.id&&t.status==='active')?.id??null});
  if(p.layer==='l2') {
    const key=`week:${p.id}:${weekStart(date)}`;
    if(weekCount(state,p.id,date)>=target(p)) { if(!state.bonuses.some(b=>b.id===key)) state.bonuses.push({id:key,protocol_id:p.id,date,xp:state.settings.bonus_l2_week_target,kind:'weekly'}); }
    else state.bonuses=state.bonuses.filter(b=>b.id!==key);
  }
}
export function consistency(state,p,end=dateKey(),days=30) {
  const start=[shiftDay(end,1-days),state.created_date,p.created_date??state.created_date].sort().at(-1);
  let eligible=0,done=0;
  for(let d=start;d<=end;d=shiftDay(d,1)) {
    if(state.pause_days.includes(d)||p.pause_dates?.includes(d)||(p.paused&&d>=(p.paused_since||end))) continue;
    if(p.fixed_weekdays?.length&&!p.fixed_weekdays.includes(new Date(d+'T12:00:00').getDay())) continue;
    eligible++; if(state.completions.some(c=>c.protocol_id===p.id&&c.date===d)) done++;
  }
  return {done,eligible,percent:eligible?Math.round(done/eligible*100):0};
}
export function validateBackup(s) {
  if(!s||s.schema_version!==SCHEMA) throw Error('Unsupported backup schema. Expected version 1.');
  for(const key of ['protocols','completions','bonuses','tests','pause_days']) if(!Array.isArray(s[key])) throw Error(`Invalid backup: ${key}.`);
  const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  if(!s.settings||!s.settings.layer_limits||!['base','l2','test'].every(k=>finite(s.settings.layer_limits[k]))||!['xp_per_effort','bonus_l2_week_target','bonus_test_verdict','xp_as_needed','backfill_days'].every(k=>finite(s.settings[k]))||!finite(s.settings.level_cost_per_level)||s.settings.level_cost_per_level===0) throw Error('Invalid backup settings.');
  const ids=new Set();
  for(const p of s.protocols) { if(typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||!Array.isArray(p.codes)||!p.codes.every(c=>typeof c==='string')||!finite(p.effort)||!(p.layer in layers)||!['scheduled','as_needed'].includes(p.type)||typeof p.abstract!=='string') throw Error('Invalid protocol data.'); ids.add(p.id); }
  const isDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
  for(const p of s.protocols) {
    if(p.fixed_weekdays!=null&&(!Array.isArray(p.fixed_weekdays)||!p.fixed_weekdays.every(d=>Number.isInteger(d)&&d>=0&&d<=6))) throw Error('Invalid weekday schedule.');
    if(p.pause_dates!=null&&(!Array.isArray(p.pause_dates)||!p.pause_dates.every(isDate))) throw Error('Invalid protocol pause dates.');
    if(p.created_date!=null&&!isDate(p.created_date)) throw Error('Invalid protocol creation date.');
    if(p.freq_per_week!=null&&(!Number.isInteger(p.freq_per_week)||p.freq_per_week<1||p.freq_per_week>7)) throw Error('Invalid recommended frequency.');
    if(p.target_override!=null&&(!Number.isInteger(p.target_override)||p.target_override<1||p.target_override>7)) throw Error('Invalid weekly target.');
  }
  if(!isDate(s.created_date)||!s.pause_days.every(isDate)) throw Error('Invalid backup dates.');
  for(const c of [...s.completions,...s.bonuses]) if(!ids.has(c.protocol_id)||!isDate(c.date)||!finite(c.xp)) throw Error('Invalid completion or XP data.');
  for(const t of s.tests) if(!ids.has(t.protocol_id)||!['active','finished'].includes(t.status)||!isDate(t.start_date)||!Number.isInteger(t.planned_days)||t.planned_days<14||t.planned_days>28||!t.metric||typeof t.metric.name!=='string'||!['rating','number','boolean'].includes(t.metric.type)||(t.baseline!==null&&(typeof t.baseline!=='number'||!Number.isFinite(t.baseline)))||(t.status==='finished'&&(!isDate(t.end_date)||!['base','l2','backlog'].includes(t.verdict)))) throw Error('Invalid test data.');
  return s;
}
