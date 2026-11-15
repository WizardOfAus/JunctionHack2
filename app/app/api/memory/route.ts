// What Pesä knows: facts learned from the account (derived each time) and things the person told it.
import { z } from 'zod';
import { assumptionsSchema, personaIdSchema, DEFAULT_PERSONA_ID } from '@/lib/contracts';
import { personaFromRequest, unknownPersona } from '@/lib/personas/request';
import { DemoDataUnavailableError, demoDataUnavailable } from '@/lib/server-data';
import { forecast, euro, isConsumption, CLOCK } from '@/lib/finance';
import { benchmarks } from '@/lib/benchmarks';
import { benchmarkTables } from '@/lib/benchmark-tables';
import { journeyContextSchema } from '@/lib/journey/context';
import { cleanTold, learnedFacts } from '@/lib/memory/memory';
import { memoryStore } from '@/lib/memory/store';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), personaId: z.unknown().optional(), assumptions: assumptionsSchema, goal: journeyContextSchema.shape.goal }).strict(),
  z.object({ action: z.literal('add'), personaId: z.unknown().optional(), text: z.string().min(1).max(400) }).strict(),
  z.object({ action: z.literal('delete'), personaId: z.unknown().optional(), id: z.string().uuid() }).strict(),
]);

export async function POST(request: Request) {
  try {
    const input = body.parse(await request.json());
    const key = personaIdSchema.optional().safeParse(input.personaId);
    if (!key.success) return unknownPersona();
    const personaId = key.data ?? DEFAULT_PERSONA_ID, store = memoryStore();
    if (input.action === 'add') {
      const text = cleanTold(input.text);
      if (!text) return Response.json({ error: 'Keep it to one short sentence (up to 200 characters).' }, { status: 400 });
      const memory = await store.add(personaId, text);
      return memory ? Response.json({ memory, storage: store.kind }) : Response.json({ error: 'Pesä can remember up to 30 things. Remove one first.' }, { status: 409 });
    }
    if (input.action === 'delete') { await store.remove(personaId, input.id); return Response.json({ ok: true }); }
    const persona = await personaFromRequest(input.personaId); if (!persona) return unknownPersona();
    const f = forecast(persona.transactions, input.assumptions, CLOCK, persona.customerId);
    const comparison = benchmarks({ rows: persona.transactions, salaryCents: f.salaryCents, age: persona.view.customer.age, tables: benchmarkTables, isSpending: isConsumption });
    return Response.json({
      learned: learnedFacts({ rows: persona.transactions, forecast: f, comparison, mortgage: persona.view.mortgage, goal: input.goal, format: c => euro(c) }),
      told: await store.list(personaId), storage: store.kind,
    });
  } catch (error) {
    if (error instanceof DemoDataUnavailableError) return demoDataUnavailable(error);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: 'Check the memory request and try again.' }, { status: 400 });
    console.error('Memory storage failed:', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'Pesä’s memory is not available right now.' }, { status: 503 });
  }
}
