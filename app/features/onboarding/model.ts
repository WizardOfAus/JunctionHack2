import { DEFAULT_PERSONA_ID, personaIdSchema, type PersonaId } from '../../lib/contracts';

export const goals = {
  understand: { title: 'Understand my money', description: 'See where it goes. Find out what is really available.', action: 'Explore my spending', planTitle: 'Make room for everyday life.' },
  buffer: { title: 'Build a safety net', description: 'Protect everyday life and feel ready for the unexpected.', action: 'Explore my buffer', planTitle: 'A little more breathing room.' },
  home: { title: 'Work towards a first home', description: 'Make space for a deposit, without squeezing out today.', action: 'Explore my home plan', planTitle: 'Your home. Your pace.' },
} as const;
export type GoalId = keyof typeof goals;
export type Journey = { version: 2; goal: GoalId; personaId: PersonaId };
// Keep the storage key so existing visitors migrate without losing their goal.
export const JOURNEY_STORAGE = 'koti-journey-v1';
export function parseJourney(value: unknown): Journey | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.goal !== 'string' || !Object.hasOwn(goals, candidate.goal)) return null;
  if (candidate.version === 1 && candidate.persona === 'junction-alex') return makeJourney(candidate.goal as GoalId);
  const persona = personaIdSchema.safeParse(candidate.personaId);
  if (candidate.version !== 2 || !persona.success) return null;
  return makeJourney(candidate.goal as GoalId, persona.data);
}
export function makeJourney(goal: GoalId, personaId: PersonaId = DEFAULT_PERSONA_ID): Journey {
  return { version: 2, goal, personaId };
}
