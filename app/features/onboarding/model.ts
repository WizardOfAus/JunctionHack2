export const goals = {
  understand: { title: 'Understand my money', description: 'See where it goes. Find out what is really available.', action: 'Explore my spending', planTitle: 'Make room for everyday life.' },
  buffer: { title: 'Build a safety net', description: 'Protect everyday life and feel ready for the unexpected.', action: 'Explore my buffer', planTitle: 'A little more breathing room.' },
  home: { title: 'Work towards a first home', description: 'Make space for a deposit, without squeezing out today.', action: 'Explore my home plan', planTitle: 'Your home. Your pace.' },
} as const;
export type GoalId = keyof typeof goals;
export type Journey = { version: 1; goal: GoalId; persona: 'junction-alex' };
export const JOURNEY_STORAGE = 'koti-journey-v1';
export function parseJourney(value: unknown): Journey | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || candidate.persona !== 'junction-alex' || typeof candidate.goal !== 'string' || !Object.hasOwn(goals, candidate.goal)) return null;
  return { version: 1, goal: candidate.goal as GoalId, persona: 'junction-alex' };
}
// A goal changes the experience, never the server-owned account identity.
export function makeJourney(goal: GoalId): Journey {
  return { version: 1, goal, persona: 'junction-alex' };
}
