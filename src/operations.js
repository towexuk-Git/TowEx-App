/** Prototype helpers. OCR is probabilistic; every extracted value requires human review. */
export const VEHICLE_ZONES = [
  'Front bumper','Bonnet','Windscreen','Roof','Boot / tailgate','Rear bumper',
  'Left front wing','Left front door','Left rear door / quarter',
  'Right front wing','Right front door','Right rear door / quarter',
  'Left wheels','Right wheels','Interior','Other'
];

const UK_REG = /\b(?:[A-Z]{2}\s?\d{2}\s?[A-Z]{3}|[A-Z]{1,3}\s?\d{1,4}\s?[A-Z]{1,3}|[A-Z]\d{1,3}\s?[A-Z]{3})\b/i;
const POSTCODE = /\b(?:GIR\s?0AA|(?:[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}))\b/ig;
const ADDRESS_LABELS = {
  pickup: /(?:collection\s*(?:address|from|location)?|collect\s*(?:from|at)|pick[- ]?up\s*(?:address|from)?|from)\s*[:\-]?\s*(.+)/i,
  dropoff: /(?:delivery\s*(?:address|to|location)?|deliver\s*(?:to|at)|drop[- ]?off\s*(?:address|to)?|to)\s*[:\-]?\s*(.+)/i,
};
const squeeze = s => (s||'').replace(/\s+/g,' ').trim();
export function extractJobFromText(raw){
 const text=String(raw||'');
 const lines=text.split(/\r?\n/).map(squeeze).filter(Boolean);
 const out={registration:'',vehicle:'',pickup:'',dropoff:'',collectionDate:'',client:'',notes:''};
 const reg=text.toUpperCase().match(UK_REG);
 if(reg)out.registration=reg[0].replace(/\s+/g,' ');
 for(const line of lines){
  const v=line.match(/(?:make\s*\/\s*model|vehicle|car\s*model)\s*[:\-]\s*(.+)/i);
  if(v)out.vehicle=squeeze(v[1]);
  const c=line.match(/(?:customer|client|dealer)\s*[:\-]\s*(.+)/i);
  if(c)out.client=squeeze(c[1]);
  for(const [key,pattern]of Object.entries(ADDRESS_LABELS)){
   const hit=line.match(pattern);if(hit && hit[1] && hit[1].length>4 && !out[key])out[key]=squeeze(hit[1]);
  }
 }
 // Only infer labelled ISO dates, never guess ambiguous DD/MM/YYYY or timezones.
 const when=text.match(/(?:collection\s*(?:date|time)|collect\s*on)\s*[:\-]?\s*(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/i);
 if(when)out.collectionDate=when[1]+(when[2]?'T'+when[2]:'');
 const codes=[...new Set([...text.toUpperCase().matchAll(POSTCODE)].map(x=>x[0].replace(/\s+/g,' ').trim()))];
 // Postcodes can only prompt manual verification, not establish direction.
 return {fields:out,postcodes:codes,rawText:text,warnings:['OCR may misread vehicle registration, dates, contact information or addresses. Confirm every field before saving.']};
}
export function driverSchedule(state,driver,date){
 const events=[]; const missing=[];
 for(const j of state.jobs||[]){
  if(j.driver!==driver || ['Cancelled','Rejected'].includes(j.status))continue;
  const pickup=j.collectionDate||'';const dropoff=j.deliveryDate||'';
  if(pickup.startsWith(date)) events.push({jobId:j.id,registration:j.registration||'REG TBC',client:j.client,type:'Collect',at:pickup,address:j.pickup,status:j.status});
  if(dropoff.startsWith(date)) events.push({jobId:j.id,registration:j.registration||'REG TBC',client:j.client,type:'Deliver',at:dropoff,address:j.dropoff,status:j.status});
  if(!pickup&&!dropoff && !['Delivered'].includes(j.status))missing.push({jobId:j.id,registration:j.registration||'REG TBC'});
 }
 events.sort((a,b)=>a.at.localeCompare(b.at)||a.type.localeCompare(b.type));
 const flags=[];
 for(let i=1;i<events.length;i++){
  const a=Date.parse(events[i-1].at); const b=Date.parse(events[i].at);
  if(Number.isFinite(a)&&Number.isFinite(b)&&(b-a)<30*60000){flags.push(`${events[i-1].registration} and ${events[i].registration}: appointments less than 30 minutes apart. Verify journey time.`);}
 }
 return {events,missing,flags};
}
export function driverScheduleText(s,driver,date){
 const lines=[`TowEx — ${driver} — ${date}`];
 s.events.forEach(e=>lines.push(`${e.at.slice(11,16)||'Time TBC'} ${e.type.toUpperCase()} ${e.registration} (${e.client}) — ${e.address||'Address TBC'} [${e.status}]`));
 if(!s.events.length)lines.push('No timed jobs scheduled.');
 s.flags.forEach(x=>lines.push(`CHECK: ${x}`));
 if(s.missing.length)lines.push(`Unscheduled assigned jobs: ${s.missing.map(x=>x.registration).join(', ')}`);
 lines.push('DRAFT — travel times, access windows, route sequence and driver hours require manual confirmation.');
 return lines.join('\n');
}
export function invoiceBatchOverview(state){
 const clients=[...new Set((state.jobs||[]).filter(j=>j.status==='Delivered'&&!j.invoiceId).map(j=>j.client).filter(Boolean))];
 const draftedIds=new Set((state.invoices||[]).filter(i=>i.status==='Draft').flatMap(i=>i.jobIds));
 return clients.map(client=>{
  const jobs=state.jobs.filter(j=>j.client===client&&j.status==='Delivered'&&!j.invoiceId&&!draftedIds.has(j.id));
  const threshold=Number(state.invoiceThresholds?.[client]||state.defaultInvoiceThreshold||3);
  return {client,jobIds:jobs.map(j=>j.id),count:jobs.length,threshold,ready:jobs.length>=threshold};
 }).filter(x=>x.count).sort((a,b)=>Number(b.ready)-Number(a.ready)||b.count-a.count||a.client.localeCompare(b.client));
}
export function stageReportStatus(job,stage){const r=job.conditionReports?.[stage];return !!r?.completedAt;}
