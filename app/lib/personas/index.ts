import 'server-only';
import catalogue from '@/data/personas/catalogue.json';
import records from '@/data/personas/records.json';
import reference from '@/data/persona.json';
import homeApproved from '@/data/personas/home-approved.json';
import homeRejectedIncome from '@/data/personas/home-rejected-income.json';
import homeRecentApproval from '@/data/personas/home-recent-approval.json';
import homeRejectedCollateral from '@/data/personas/home-rejected-collateral.json';
import tightBudget from '@/data/personas/tight-budget.json';
import flexibleSpender from '@/data/personas/flexible-spender.json';
import irregularShocks from '@/data/personas/irregular-shocks.json';
import { CLOCK, historyOnly, type Clock, type Transaction } from '@/lib/finance';
import { personaView, type PersonaRecord } from './view';

// Static imports keep every persona inside the server bundle; nothing here reaches the browser.
const rowsById: Record<string,{transactions:unknown[]}> = {
  reference, 'home-approved':homeApproved, 'home-rejected-income':homeRejectedIncome,
  'home-recent-approval':homeRecentApproval, 'home-rejected-collateral':homeRejectedCollateral,
  'tight-budget':tightBudget, 'flexible-spender':flexibleSpender, 'irregular-shocks':irregularShocks,
};
const recordsById = records.personas as Record<string,PersonaRecord>;

/** Resolve an allowlisted persona ID (already validated by personaIdSchema) to its scoped rows and metadata. */
export function resolvePersona(id:string=catalogue.defaultId,clock:Clock=CLOCK) {
  const entry=catalogue.personas.find(p=>p.id===id);
  const record=recordsById[id];
  if(!entry||!record||!rowsById[id]||record.customerId!==entry.customerId) throw new Error(`Persona ${id} is not in the catalogue.`);
  const transactions=historyOnly(rowsById[id].transactions as Transaction[],clock,entry.customerId);
  return {customerId:entry.customerId,accountId:record.accountId,transactions,view:personaView(entry,record,clock)};
}

export function listPersonas(clock:Clock=CLOCK) {
  return catalogue.personas.map(entry=>personaView(entry,recordsById[entry.id],clock));
}
