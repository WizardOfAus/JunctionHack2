// Exact category strings in the pinned Junction dataset, with the words people use for them.
// Keep spellings identical to the CSV: filters compare with ===.
export const spendingCategories = ['Groceries','Restaurants','Housing','Utilities','Transportation','Health','Lifestyle','Entertainment','Home & Tech','Travel'] as const;
export const categories = [...spendingCategories,'Salary','Invest Deposit'] as const;
export type Category = typeof categories[number];

// Avoid bare "home" (home-savings questions) and "save"/"saving" (safe-to-save questions).
const synonyms: Record<Category,RegExp> = {
  Groceries:/grocer/,
  Restaurants:/restaurant|eating out|dining|takeaway/,
  Housing:/housing|\brent\b|mortgage payment/,
  Utilities:/utilit|electricity|water bill|internet bill/,
  Transportation:/transport|\bbus\b|\btrain\b|\btram\b|\bmetro\b|commut|\bfuel\b|petrol/,
  Health:/health|pharmac|doctor|dentist/,
  Lifestyle:/lifestyle|clothing|clothes/,
  Entertainment:/entertainment|cinema|concert|streaming/,
  'Home & Tech':/home (?:&|and) tech|electronics|gadget|appliance|furniture/,
  Travel:/travel|\btrip|flight|hotel|holiday|vacation/,
  Salary:/salary|income|\bpay ?day|wages/,
  'Invest Deposit':/invest/,
};

export function matchCategory(question:string): Category|undefined {
  const q=question.toLowerCase();
  return categories.find(c=>synonyms[c].test(q));
}
