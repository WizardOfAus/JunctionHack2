// App figures that the coach agent gets with each question.
// The agent must explain baskets with the same rules and numbers as the UI, so the app server
// calculates them here with app/lib/finance.ts (basketOf, forecast) and the agent only explains them.
// The agent has no copy of the basket rules.
import type { Basket } from '../finance';

/** Same names as the basket list on the Today screen (components/koti-app.tsx). */
export const basketNames: Record<Basket, string> = {
  regular: 'Everyday essentials',
  irregular: 'Life’s little surprises',
  flexible: 'Your kind of everyday',
};

/** One spending row, already put in a basket by the app (basketOf, with the user's corrections). */
export type BasketRow = { category: string; basket: Basket; spentCents: number };

export interface BasketContextOptions {
  /** Number of months the rows cover. Totals are monthly means over these months. */
  months: number;
  /** Period in words, for example "June–August 2026". */
  period: string;
  /** Number of basket corrections the user made in the app. */
  corrections: number;
  format: (cents: number) => string;
}

/**
 * Text block with the basket figures the app shows.
 * `totals` must be forecast(...).baskets, so the numbers are the same as on the Today screen.
 */
export function basketContext(rows: BasketRow[], totals: Record<Basket, number>, options: BasketContextOptions): string {
  const lines = [`Spending baskets, monthly mean of ${options.period} (calculated by the Koti app, as shown on the Today screen):`];
  for (const basket of ['regular', 'irregular', 'flexible'] as Basket[]) {
    const byCategory = new Map<string, number>();
    for (const row of rows) if (row.basket === basket) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.spentCents);
    const categories = [...byCategory]
      .sort((a, b) => b[1] - a[1])
      .map(([category, cents]) => `${category} ${options.format(Math.round(cents / options.months))}`);
    lines.push(`- ${basketNames[basket]} (${basket}): ${options.format(totals[basket])}. ${categories.length ? `Categories: ${categories.join(', ')}.` : 'No spending in this period.'}`);
  }
  lines.push(options.corrections
    ? `The user moved ${options.corrections} transaction(s) to another basket in the app. These figures include those changes.`
    : 'The user has not moved any transaction to another basket.');
  return lines.join('\n');
}
