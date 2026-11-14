import { z } from 'zod';
import { DATA_START, DEMO_DATE, HISTORY_THROUGH, recentWindow } from './finance';
const readable=(iso:string)=>new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const cents=z.number().int().min(0).max(100000000);
export const assumptionsSchema=z.object({
  reserveCents:cents,irregularReserveCents:cents,homePriceCents:cents.min(1000000),homeSavingsCents:cents,
  monthlyHomeCents:cents,allocationCents:cents,unexpectedCents:cents,restaurantReduction:z.number().int().min(0).max(100),
  incomeDelayDays:z.number().int().min(0).max(60),coverageConfirmed:z.boolean(),stale:z.boolean(),connected:z.boolean(),
  corrections:z.record(z.string().regex(/^row-\d+$/),z.enum(['regular','irregular','flexible'])).refine(x=>Object.keys(x).length<=1000),
  aspOpenedOn:z.union([z.literal(''),z.string().date()]).refine(x=>!x||x<=DEMO_DATE),
  aspDeposits:z.array(z.object({date:z.string().date(),amountCents:cents})).max(360),
}).strict();
export const querySchema=z.object({from:z.string().date().default(recentWindow().from),to:z.string().date().default(recentWindow().to),category:z.string().max(50).optional(),basket:z.enum(['regular','irregular','flexible']).optional()}).strict().refine(x=>x.from<=x.to&&x.from>=DATA_START&&x.to<=HISTORY_THROUGH,`Choose a history period between ${readable(DATA_START)} and ${readable(HISTORY_THROUGH)}.`);
