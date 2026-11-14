// Illustrative lesson money only. Authoritative account forecasts stay server-side.
export const practice = { balanceCents: 120000, billsCents: 65000, reserveCents: 35000 };
export function lessonRoom(balanceCents: number, billsCents: number, reserveCents: number) {
  return Math.max(0, balanceCents - billsCents - reserveCents);
}
export function checkPrediction(answerCents: number | null) {
  return answerCents === lessonRoom(practice.balanceCents, practice.billsCents, practice.reserveCents);
}
