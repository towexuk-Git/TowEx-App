import {driverSchedule} from './operations.js';

export const ROUTE_MODES = {
  fastest: 'Shortest travel time',
  mid: 'Mid-length practical route (75% of reasonable distance range)',
};
const validClock = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes = clock => {const [h,m]=clock.split(':').map(Number);return h*60+m;};
const clock = value => `${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;

/** Each line: Via / description | measured miles | verified travel minutes.
 * These measurements are manually entered and must be checked against a real mapping service.
 */
export function parseRoutes(text){
  const routes=[]; const errors=[];
  String(text||'').split(/\r?\n/).forEach((raw,i)=>{
    if(!raw.trim())return;
    const fields=raw.split('|').map(x=>x.trim());
    const miles=Number(fields[1]), travelMinutes=Number(fields[2]);
    if(fields.length!==3||!fields[0]||!fields[1]||!fields[2]||!Number.isFinite(miles)||!Number.isFinite(travelMinutes)||miles<=0||travelMinutes<=0){
      errors.push(`Route option ${i+1}: use Via | miles | minutes (positive measured values).`);return;
    }
    routes.push({via:fields[0],miles,minutes:travelMinutes});
  });
  return {routes,errors};
}

/** Compare only supplied, defensible route alternatives; NEVER invent road routes or ETAs. */
export function chooseRoute(routes,mode){
  if(!Array.isArray(routes)||routes.length<2)return null;
  if(!routes.every(r=>Number.isFinite(r.miles)&&r.miles>0&&Number.isFinite(r.minutes)&&r.minutes>0))return null;
  if(mode==='fastest')return [...routes].sort((a,b)=>a.minutes-b.minutes||a.miles-b.miles)[0];
  if(mode==='mid'){
    const distances=routes.map(r=>r.miles),short=Math.min(...distances),long=Math.max(...distances);
    if(short===long)return null;
    const target=short+(long-short)*0.75;
    return [...routes].sort((a,b)=>Math.abs(a.miles-target)-Math.abs(b.miles-target)||a.minutes-b.minutes)[0];
  }
  return null;
}
export function sourceEvents(state,driver,date){
  return driverSchedule(state,driver,date).events.map(e=>({jobId:e.jobId,type:e.type,registration:e.registration,client:e.client,at:e.at,address:e.address}));
}
export function sourceSignature(state,driver,date){return JSON.stringify(sourceEvents(state,driver,date));}
export function createSchedulePlan(state,driver,date,id){
  const events=sourceEvents(state,driver,date);
  if(!events.length)throw new Error('No dated collections or deliveries for this driver. Enter appointments in the Job Register.');
  return {id,driver,date,origin:'',shiftStart:'',maxShiftHours:9.5,routeMode:'fastest',relayNotes:'',relayChecked:false,
    stops:events.map(e=>({...e,targetTime:e.at.length>=16?e.at.slice(11,16):'',handlingMinutes:'',routeText:''})),
    status:'Draft',sourceAtCreation:sourceSignature(state,driver,date),approvedSource:null,
    approvedBy:'',approvedAt:'',releasedBy:'',releasedAt:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
}

/** Plan quality gate: no release unless each leg has mapped comparisons and timings are feasible. */
export function reviewSchedule(state,plan){
  const errors=[],warnings=[],timeline=[];
  if(!plan || !Array.isArray(plan.stops))return {errors:['Plan not found.'],warnings,timeline};
  if(sourceSignature(state,plan.driver,plan.date)!==plan.sourceAtCreation) errors.push('Jobs, driver assignments or appointments changed. Rebuild this draft from the Job Register.');
  if(!plan.origin?.trim())errors.push('Driver start location is required.');
  if(!validClock(plan.shiftStart))errors.push('Driver shift start time is required.');
  if(!(Number(plan.maxShiftHours)>0&&Number(plan.maxShiftHours)<=24))errors.push('Enter a valid maximum shift length.');
  if(!Object.hasOwn(ROUTE_MODES,plan.routeMode))errors.push('Choose a route comparison method.');
  if(!plan.stops.length)errors.push('Schedule has no stops.');
  if(plan.relayNotes?.trim()&&!plan.relayChecked)errors.push('Relay / baton arrangements require a separate manual check.');
  let departure=validClock(plan.shiftStart)?minutes(plan.shiftStart):null;
  for(let i=0;i<plan.stops.length;i++){
    const stop=plan.stops[i],label=`Stop ${i+1} ${stop.registration||'REG TBC'}`;
    if(!stop.address?.trim())errors.push(`${label}: collection/delivery address is missing.`);
    if(!validClock(stop.targetTime))errors.push(`${label}: verify a target appointment time.`);
    const handling=Number(stop.handlingMinutes);
    if(String(stop.handlingMinutes).trim()===''||!Number.isFinite(handling)||handling<=0)errors.push(`${label}: allow positive inspection/handover time.`);
    const parsed=parseRoutes(stop.routeText);
    parsed.errors.forEach(e=>errors.push(`${label}: ${e}`));
    if(parsed.routes.length<2)errors.push(`${label}: compare at least two checked road routes from ${i?'the previous stop':'the driver start point'}.`);
    const route=chooseRoute(parsed.routes,plan.routeMode);
    if(!route)errors.push(`${label}: no usable route comparison for selected policy.`);
    if(departure!==null&&route){
      const arrival=departure+route.minutes;
      const target=validClock(stop.targetTime)?minutes(stop.targetTime):null;
      if(target!==null && arrival>target)errors.push(`${label}: estimated arrival ${clock(arrival)} is after the target ${stop.targetTime}.`);
      const start=target===null?arrival:Math.max(arrival,target);
      const finish=start+(handling>0?handling:0);
      timeline.push({index:i,via:route.via,miles:route.miles,minutes:route.minutes,arrival:clock(arrival),start:clock(start),finish:clock(finish),late:target!==null&&arrival>target});
      departure=finish;
    }else departure=null;
  }
  if(departure!==null&&validClock(plan.shiftStart)&&Number(plan.maxShiftHours)>0){
    const used=departure-minutes(plan.shiftStart);
    if(used>Number(plan.maxShiftHours)*60)errors.push(`Estimated shift ${Math.ceil(used)} minutes exceeds planning limit ${plan.maxShiftHours} hours.`);
  }
  const missing=driverSchedule(state,plan.driver,plan.date).missing;
  if(missing.length)warnings.push(`${missing.length} assigned job(s) have no collection or delivery date and are not included.`);
  warnings.push('Traffic, road restrictions, public transport, parking, opening hours and relay timing have NOT been checked against live providers. All route options are manually entered.');
  return {errors,warnings,timeline};
}
export function releasedScheduleText(plan,state){
  if(plan?.status!=='Released'||!plan.releasedAt)throw new Error('Only a released admin-approved schedule can be copied for drivers.');
  const review=reviewSchedule(state,plan);
  if(review.errors.length)throw new Error('This schedule is no longer valid; rebuild and reapprove before sharing.');
  const lines=[`TowEx — APPROVED DRIVER RUN — ${plan.driver} — ${plan.date}`,
    `Start: ${plan.shiftStart} at ${plan.origin}`,`Route policy: ${ROUTE_MODES[plan.routeMode]}`];
  plan.stops.forEach((s,i)=>{const t=review.timeline[i];lines.push(`${i+1}. ${s.targetTime} ${s.type.toUpperCase()} ${s.registration} — ${s.address}`);
    lines.push(`   Route via ${t.via} · ${t.miles} mi · ${t.minutes} min estimated · arrival ${t.arrival} · handling ${s.handlingMinutes} min`);});
  if(plan.relayNotes)lines.push(`Relay: ${plan.relayNotes}`);
  lines.push(`Admin approved: ${plan.approvedAt} · released: ${plan.releasedAt}`,'Traffic/ETAs must be rechecked before departure.');
  return lines.join('\n');
}
