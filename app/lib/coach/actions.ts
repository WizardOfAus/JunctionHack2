// Actions under a coach answer follow the answer, not a default lesson.
import type { CoachAction } from '../journey/context';

const BILL = /\b(bill|surprise|unexpected|expense|emergency)\b/;
const LEARNING = /\b(learn|lesson|teach me)\b/;

/** Keeps the previews that match this question and shows the next lesson only for learning questions. */
export function answerActions(base: CoachAction[], intent: string, question: string): CoachAction[] {
  const q = question.toLowerCase();
  const lesson = base.find(a => a.type === 'lesson');
  let previews = base.filter(a => a.type === 'preview');
  // A surprise bill is previewed as an unexpected cost, whatever the goal.
  if (BILL.test(q)) previews = [{ type: 'preview', scenario: 'expense' }];
  const showLesson = !!lesson && (intent === 'journey' || LEARNING.test(q));
  return showLesson ? [lesson!, ...previews] : previews;
}
