import { z } from 'zod';
const cents=z.number().int().min(0).max(100000000);
export const assumptionsSchema=z.object({
  reserveCents:cents,irregularReserveCents:cents,homePriceCents:cents.min(1000000),homeSavingsCents:cents,
  monthlyHomeCents:cents,allocationCents:cents,unexpectedCents:cents,restaurantReduction:z.number().int().min(0).max(100),
  incomeDelayDays:z.number().int().min(0).max(60),coverageConfirmed:z.boolean(),stale:z.boolean(),connected:z.boolean(),
  corrections:z.record(z.string().regex(/^row-\d+$/),z.enum(['regular','irregular','flexible'])).refine(x=>Object.keys(x).length<=1000),
  aspOpenedOn:z.union([z.literal(''),z.string().date()]).refine(x=>!x||x<='2026-09-01'),
  aspDeposits:z.array(z.object({date:z.string().date(),amountCents:cents})).max(360),
}).strict();
export const querySchema=z.object({from:z.string().date().default('2026-06-01'),to:z.string().date().default('2026-08-31'),category:z.string().max(50).optional(),basket:z.enum(['regular','irregular','flexible']).optional()}).strict().refine(x=>x.from<=x.to&&x.to<'2026-09-01','Choose a history period ending before 1 September 2026.');
