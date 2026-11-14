import { personaIdSchema } from '@/lib/contracts';
import { DEMO_DATE } from '@/lib/finance';
import { resolvePersona } from './index';

export const unknownPersona=()=>Response.json({error:'Unknown demo persona. Choose one listed by /api/personas.'},{status:400});

/** Validates an optional top-level personaId; returns null when it is not allowlisted. */
export function personaFromRequest(value:unknown) {
  const parsed=personaIdSchema.optional().safeParse(value);
  return parsed.success?resolvePersona(parsed.data):null;
}

export function provenanceOf(persona:ReturnType<typeof resolvePersona>) {
  return {customerId:persona.customerId,accountId:persona.accountId,asOf:DEMO_DATE,sourceRevision:'fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f',source:'https://github.com/hackjunction/Junction-2026-S-pankki',synthetic:true};
}
