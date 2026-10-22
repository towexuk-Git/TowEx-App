import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJobFromText,driverSchedule,driverScheduleText,invoiceBatchOverview,VEHICLE_ZONES} from '../src/operations.js';
import {blankState,blankJob,autoDraftInvoices} from '../src/store.js';

test('OCR candidate extraction recognises labelled vehicle and addresses',()=>{
 const result=extractJobFromText('Collection: 1 Test Road, London UB3 1AA\nDelivery: Dealer, Southampton SO15 2AB\nVehicle: MINI Clubman\nReg: YK68 FTV\nClient: GCS Cars\nCollection Date: 2026-10-23 09:30');
 assert.equal(result.fields.registration,'YK68 FTV');
 assert.equal(result.fields.vehicle,'MINI Clubman');
 assert.equal(result.fields.pickup,'1 Test Road, London UB3 1AA');
 assert.equal(result.fields.dropoff,'Dealer, Southampton SO15 2AB');
 assert.equal(result.fields.collectionDate,'2026-10-23T09:30');
 assert.equal(result.fields.client,'GCS Cars');
});
test('No OCR data should be automatically marked verified',()=>{
 const result=extractJobFromText('Registration AB12 CDE');assert.ok(result.warnings.length);assert.equal(result.fields.pickup,'');
});
test('Schedules derive from the source jobs and reveal close appointments',()=>{
 const jobs=[{id:'1',driver:'Driver 1',status:'Scheduled',registration:'AB12 CDE',client:'A&R',pickup:'UB3',collectionDate:'2026-10-23T09:00',deliveryDate:''},{id:'2',driver:'Driver 1',status:'Confirmed',registration:'XY12 ZZZ',client:'GCS',pickup:'RG1',collectionDate:'2026-10-23T09:15',deliveryDate:''}];
 const s=driverSchedule({jobs},'Driver 1','2026-10-23');assert.equal(s.events.length,2);assert.equal(s.flags.length,1);assert.match(driverScheduleText(s,'Driver 1','2026-10-23'),/DRAFT/);
});
test('Three delivered vehicles per client cause one unissued draft only',()=>{
 const s=blankState();s.jobs=['AAA','BBB','CCC'].map((registration,i)=>({...blankJob(),id:String(i),registration,client:'Stellantis',status:'Delivered'}));
 assert.equal(invoiceBatchOverview(s)[0].count,3);autoDraftInvoices(s);autoDraftInvoices(s);assert.equal(s.invoices.length,1);assert.equal(s.invoices[0].status,'Draft');assert.equal(s.invoices[0].jobIds.length,3);
});
test('Two delivered vehicles can be configured as client threshold',()=>{
 const s=blankState();s.invoiceThresholds={'GCS Cars':2};s.jobs=['A','B'].map((registration,i)=>({...blankJob(),id:String(i),registration,client:'GCS Cars',status:'Delivered'}));autoDraftInvoices(s);assert.equal(s.invoices.length,1);
});
test('Collection and delivery regions include panels and wheels',()=>{assert.ok(VEHICLE_ZONES.includes('Front bumper'));assert.ok(VEHICLE_ZONES.includes('Left wheels'));});
import {changeJob,updateStatus,issueInvoice,saveConditionReport,renameInvoice} from '../src/store.js';
// The store test harness simulates local browser persistence without a server.
function withBrowserStore(fn){const prevWindow=globalThis.window;const prevLocal=globalThis.localStorage;const prevEvent=globalThis.CustomEvent;globalThis.window={dispatchEvent(){}};globalThis.localStorage={setItem(){}};globalThis.CustomEvent=class{constructor(type){this.type=type;}};try{fn();}finally{globalThis.window=prevWindow;globalThis.localStorage=prevLocal;globalThis.CustomEvent=prevEvent;}}
test('Collection and delivery status buttons require their respective condition report',()=>withBrowserStore(()=>{
 const s=blankState();const j={...blankJob(),id:'jobA',registration:'AB12 CDE',client:'GCS Cars'};changeJob(s,j);
 assert.throws(()=>updateStatus(s,'jobA','Collected'),/collection condition report/i);
 const photo={name:'evidence.jpg',dataUrl:'data:image/jpeg;base64,YWJj'};
 saveConditionReport(s,'jobA','collection',{damages:[{zone:'Front bumper',severity:'Chip',note:'Small chip'}],photos:[photo]});
 updateStatus(s,'jobA','Collected');
 assert.throws(()=>updateStatus(s,'jobA','Delivered'),/delivery condition report/i);
 saveConditionReport(s,'jobA','delivery',{damages:[],photos:[photo]});
 updateStatus(s,'jobA','Delivered');assert.equal(s.jobs[0].status,'Delivered');
}));
test('Draft auto-number must be replaced by an approved TX number before issue',()=>withBrowserStore(()=>{
 const s=blankState();s.jobs=[0,1,2].map(i=>({...blankJob(),id:String(i),client:'GCS Cars',status:'Delivered'}));autoDraftInvoices(s);
 assert.throws(()=>issueInvoice(s,s.invoices[0].id),/Assign a real invoice number/);
 renameInvoice(s,s.invoices[0].id,'TX-0155');issueInvoice(s,s.invoices[0].id);
 assert.equal(s.invoices[0].status,'Issued');
}));
