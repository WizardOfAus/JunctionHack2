import 'server-only';
import persona from '@/data/persona.json';
import { historyOnly, type Transaction } from './finance';
export const transactions=historyOnly(persona.transactions as Transaction[]);
export const provenance={customerId:persona.customerId,accountId:persona.accountId,sourceRevision:persona.sourceRevision,asOf:persona.asOf,source:'https://github.com/hackjunction/Junction-2026-S-pankki',statistics:persona.statistics};
