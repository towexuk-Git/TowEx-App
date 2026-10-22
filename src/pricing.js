/** TowEx job pricing. Monetary calculations stay in pennies to avoid float drift. */
const penny = n => Math.round((Number(n) || 0) * 100);
const pounds = n => Number((n / 100).toFixed(2));
const roundedMiles = n => Math.max(0, Number(n) || 0);

export function movementFee(job) {
  const miles = roundedMiles(job.billableMiles);
  if (job.manualFee !== '' && job.manualFee !== null && job.manualFee !== undefined) return Math.max(0, Number(job.manualFee) || 0);
  if (job.movementType === 'management') return 80;
  const stellantis = (job.client || '').trim().toLowerCase().includes('stellantis');
  const urgent = !stellantis && ['urgent', 'same-day'].includes(job.serviceLevel);
  const minimum = urgent ? 100 : 80;
  const extraRate = urgent ? 1.2 : 1;
  return pounds(penny(minimum) + penny(Math.max(0, miles - 60) * extraRate));
}

export function jobCharges(job) {
  const movement = movementFee(job);
  const saving = Math.max(0, (Number(job.preNegotiatedPrice) || 0) - (Number(job.negotiatedPrice) || 0));
  const negotiation = job.chargeNegotiation ? pounds(penny(saving * 0.2)) : 0;
  const stellantis = (job.client || '').trim().toLowerCase().includes('stellantis');
  const handover = !stellantis && job.chargeHandover ? 30 : 0;
  const appraisal = job.chargeAppraisal ? 20 : 0;
  const evTime = pounds(penny(Math.max(0, Number(job.evMinutes) || 0) / 60 * 20));
  const expenses = pounds(penny(Math.max(0, Number(job.fuelCost) || 0) + Math.max(0, Number(job.electricityCost) || 0) + Math.max(0, Number(job.otherExpenses) || 0)));
  const subtotal = pounds([movement,negotiation,handover,appraisal,evTime,expenses].reduce((sum,n) => sum + penny(n),0));
  return {movement, negotiation, handover, appraisal, evTime, expenses, subtotal};
}
export function invoiceTotal(jobs) {return pounds(jobs.reduce((sum, j) => sum + penny(jobCharges(j).subtotal), 0));}
export const money = n => new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP'}).format(Number(n)||0);
