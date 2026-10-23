import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoutes,chooseRoute,createSchedulePlan,reviewSchedule,releasedScheduleText} from '../src/schedule-plans.js';
import {blankState,blankJob,changeJob,saveDraftSchedule,latestSchedule,amendSchedule,submitSchedule,approveSchedule,releaseSchedule,loadState} from '../src/store.js';

const routes='M4 / faster | 60 | 70\nM3 / reasonable | 80 | 90';
function fixture(){
 const s=blankState();
 s.jobs=[
  {...blankJob(),id:'j1',registration:'AA11 AAA',client:'A&R Automobiles',driver:'Driver 1',status:'Scheduled',pickup:'Slough SL1',collectionDate:'2026-10-23T09:00'},
  {...blankJob(),id:'j2',registration:'BB22 BBB',client:'GCS Cars',driver:'Driver 1',status:'Scheduled',pickup:'Kettering NN15',collectionDate:'2026-10-23T12:00'},
 ];return s;
}
function configured(s){
 saveDraftSchedule(s,'Driver 1','2026-10-23');const p=latestSchedule(s,'Driver 1','2026-10-23');
 amendSchedule(s,p.id,{origin:'UB3',shiftStart:'07:00',routeMode:'fastest',maxShiftHours:9.5,stops:p.stops.map(x=>({...x,routeText:routes,handlingMinutes:'20'}))});
 return latestSchedule(s,'Driver 1','2026-10-23');
}
function browser(fn){const old=[globalThis.localStorage,globalThis.window,globalThis.CustomEvent];
 const data=new Map();globalThis.localStorage={setItem(k,v){data.set(k,v);},getItem(k){return data.get(k)||null;}};
 globalThis.window={dispatchEvent(){}};globalThis.CustomEvent=class{constructor(t){this.type=t;}};
 try{return fn();}finally{[globalThis.localStorage,globalThis.window,globalThis.CustomEvent]=old;}}

test('Route comparison selects minimum measured minutes or ~75% reasonable distance',()=>{
 const {routes:r,errors}=parseRoutes('Fast A | 100 | 90\nMid B | 140 | 100\nLong C | 150 | 110');
 assert.deepEqual(errors,[]);assert.equal(chooseRoute(r,'fastest').via,'Fast A');
 assert.equal(chooseRoute(r,'mid').via,'Mid B');
 assert.equal(chooseRoute(r.slice(0,1),'fastest'),null);
 assert.equal(chooseRoute([{via:'X',miles:90,minutes:30},{via:'Y',miles:90,minutes:31}],'mid'),null);
});
test('Invalid or unspecified distances and time do not become made-up route metrics',()=>{
 const parsed=parseRoutes('M6 | unknown | 72\nA40 | 63 |');
 assert.equal(parsed.routes.length,0);assert.equal(parsed.errors.length,2);
});
test('Schedule draft uses only source register appointments',()=>{
 const s=fixture();const p=createSchedulePlan(s,'Driver 1','2026-10-23','r1');
 assert.equal(p.status,'Draft');assert.deepEqual(p.stops.map(x=>x.registration),['AA11 AAA','BB22 BBB']);
 assert.deepEqual(p.stops.map(x=>x.targetTime),['09:00','12:00']);
 assert.equal(reviewSchedule(s,p).errors.some(x=>x.includes('Driver start location')),true);
});
test('Approving and releasing requires admin, completeness and prior submission',()=>browser(()=>{
 const s=fixture();const p=configured(s);
 assert.equal(reviewSchedule(s,p).errors.length,0);
 assert.throws(()=>releaseSchedule(s,p.id,{role:'admin',name:'Admin'}),/approval/i);
 assert.throws(()=>approveSchedule(s,p.id,{role:'admin',name:'Admin'}),/submitted/i);
 submitSchedule(s,p.id);
 assert.throws(()=>approveSchedule(s,p.id,{role:'driver',name:'Driver'}),/Admin authority/);
 approveSchedule(s,p.id,{role:'admin',name:'Dispatcher'});
 assert.equal(latestSchedule(s,'Driver 1','2026-10-23').status,'Approved');
 assert.throws(()=>releaseSchedule(s,p.id,{role:'driver',name:'Driver'}),/Admin authority/);
 releaseSchedule(s,p.id,{role:'admin',name:'Dispatcher'});
 assert.match(releasedScheduleText(p,s),/APPROVED DRIVER RUN/);
 assert.match(releasedScheduleText(p,s),/M4 \/ faster/);
 assert.equal(loadState().schedulePlans[0].status,'Released');
}));
test('Editing an approved schedule invalidates approval',()=>browser(()=>{
 const s=fixture(),p=configured(s);submitSchedule(s,p.id);approveSchedule(s,p.id,{role:'admin',name:'Admin'});
 amendSchedule(s,p.id,{shiftStart:'06:45'});
 assert.equal(p.status,'Draft');assert.equal(p.approvedAt,'');
 assert.throws(()=>releaseSchedule(s,p.id,{role:'admin',name:'Admin'}),/approval/i);
}));
test('A changed job invalidates released schedule, preventing old instructions from being copied',()=>browser(()=>{
 const s=fixture(),p=configured(s);submitSchedule(s,p.id);approveSchedule(s,p.id,{role:'admin',name:'Admin'});releaseSchedule(s,p.id,{role:'admin',name:'Admin'});
 changeJob(s,{...s.jobs[0],pickup:'New collection depot, SL2'});
 assert.equal(p.status,'Needs revision');
 assert.throws(()=>releasedScheduleText(p,s),/Only a released/);
}));
test('Late arrival is blocked even if the itinerary is otherwise complete',()=>browser(()=>{
 const s=fixture(),p=configured(s);
 amendSchedule(s,p.id,{shiftStart:'08:30'});
 assert.match(reviewSchedule(s,p).errors.join(' '),/after the target/i);
 submitSchedule(s,p.id);
 assert.throws(()=>approveSchedule(s,p.id,{role:'admin',name:'Admin'}),/Cannot approve/i);
}));
test('Relay notes must be independently verified before approval',()=>browser(()=>{
 const s=fixture(),p=configured(s);
 amendSchedule(s,p.id,{relayNotes:'Driver 2 picks up at UB3'});
 assert.match(reviewSchedule(s,p).errors.join(' '),/relay/i);
 amendSchedule(s,p.id,{relayChecked:true});
 assert.equal(reviewSchedule(s,p).errors.length,0);
}));
test('Legacy state without schedulePlans remains valid on read',()=>browser(()=>{
 const s=fixture();delete s.schedulePlans;
 localStorage.setItem('towex.operations.v1',JSON.stringify(s));
 assert.deepEqual(loadState().schedulePlans,[]);
}));
