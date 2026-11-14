import { z } from 'zod';
import type { Assumptions, Forecast } from '../finance';

export const lessonIds = ['balance', 'reserve', 'scenario'] as const;
export type LessonId = typeof lessonIds[number];
export const journeyContextSchema = z.object({
  goal: z.enum(['understand', 'buffer', 'home']),
  completedLessonIds: z.array(z.enum(lessonIds)).max(3).refine(ids => new Set(ids).size === ids.length),
  screen: z.enum(['money', 'learn', 'coach', 'plan']),
}).strict();
export type JourneyContext = z.infer<typeof journeyContextSchema>;
export const defaultContext: JourneyContext = { goal: 'understand', completedLessonIds: [], screen: 'coach' };
export const coachActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lesson'), lessonId: z.enum(lessonIds) }).strict(),
  z.object({ type: z.literal('preview'), scenario: z.enum(['expense', 'payday', 'spending']), reductionPercent: z.number().int().min(0).max(100).optional() }).strict(),
]);
export type CoachAction = z.infer<typeof coachActionSchema>;

export function nextLesson(context: JourneyContext): LessonId | null {
  // The foundations come first; the next step then follows the user's direction.
  const order: LessonId[] = context.goal === 'home' ? ['balance', 'scenario', 'reserve'] : ['balance', 'reserve', 'scenario'];
  return order.find(id => !context.completedLessonIds.includes(id)) ?? null;
}
export function journeyActions(context: JourneyContext, question: string, available: boolean): CoachAction[] {
  const actions: CoachAction[] = [];
  const lessonId = nextLesson(context);
  if (lessonId) actions.push({ type: 'lesson', lessonId });
  if (!available) return actions;
  const q = question.toLowerCase();
  const reduction = q.match(/(\d{1,3})\s*%/);
  if (/restaurant|eating|dining/.test(q) && (!reduction || Number(reduction[1]) <= 100)) {
    actions.push({ type: 'preview', scenario: 'spending', reductionPercent: reduction ? Number(reduction[1]) : 20 });
  } else if (/payday|salary.*(late|delay)/.test(q)) actions.push({ type: 'preview', scenario: 'payday' });
  else if (/what.*next|suggest|recommend|plan|scenario|buffer|surprise/.test(q)) actions.push({ type: 'preview', scenario: context.goal === 'home' ? 'spending' : 'expense' });
  return actions;
}
export function scenarioContext(a: Assumptions) {
  return { unexpectedCents: a.unexpectedCents, incomeDelayDays: a.incomeDelayDays, restaurantReduction: a.restaurantReduction, allocationCents: a.allocationCents };
}
/** Only validated context and server-calculated facts enter the agent's context block. */
export function coachJourneyContext(context: JourneyContext, a: Assumptions, f: Forecast) {
  return JSON.stringify({
    journey: context, scenario: scenarioContext(a), assumptions: a,
    forecast: { asOf: f.asOf, dataThrough: f.dataThrough, balanceCents: f.balanceCents, minimumCents: f.minimumCents, protectedCents: f.protectedCents, remainingCents: f.remainingCents, blocked: f.blocked, warnings: f.warnings },
    nextLesson: nextLesson(context),
    instructions: 'Amounts are integer euro cents from the finance engine. Explain these supplied facts; do not recalculate balances or promise approval. Lesson completion is browser-reported learning progress, not a financial fact. Scenario values are editable assumptions, not events. Recommend learning and a preview; never claim to apply a plan or move money. Action buttons are validated separately by the application.',
  });
}
