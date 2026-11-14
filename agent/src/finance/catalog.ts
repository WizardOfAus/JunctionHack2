// The vocabulary of the S-Pankki Junction 2026 dataset (pinned revision
// fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f). Checked against all 3,626,755 rows.

export const CATEGORIES = [
	'Groceries', 'Restaurants', 'Transportation', 'Entertainment', 'Health',
	'Home & Tech', 'Lifestyle', 'Travel', 'Utilities', 'Housing', 'Salary',
	'Invest Deposit', 'Invest Withdraw', 'Other Income', 'Salary Sweep',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories of everyday card purchases (transaction_type = purchase). */
export const SPENDING_CATEGORIES = [
	'Groceries', 'Restaurants', 'Transportation', 'Entertainment', 'Health',
	'Home & Tech', 'Lifestyle', 'Travel',
] as const;
export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

export const TX_TYPES = [
	'purchase', 'utilities_payment', 'housing_payment', 'salary', 'investment_deposit',
	'other_income', 'salary_sweep', 'investment_withdrawal',
] as const;
export type TxType = (typeof TX_TYPES)[number];

/**
 * How the forecast treats each transaction type.
 * - income: earned income. Projected only when it repeats each month.
 * - commitment: bills. Projected when they repeat; otherwise sampled as spending.
 * - saving: existing saving transfers. Projected when they repeat.
 * - transfer_out: money moved to the customer's other account. Not consumption,
 *   but it lowers this account's balance, so it is projected when it repeats.
 * - spending: everyday purchases. Sampled from past weeks.
 * - irregular_income: one-off income and investment withdrawals. Never assumed.
 */
export type TxGroup = 'income' | 'commitment' | 'saving' | 'transfer_out' | 'spending' | 'irregular_income';

export const TYPE_GROUP: Record<TxType, TxGroup> = {
	salary: 'income',
	housing_payment: 'commitment',
	utilities_payment: 'commitment',
	investment_deposit: 'saving',
	salary_sweep: 'transfer_out',
	purchase: 'spending',
	other_income: 'irregular_income',
	investment_withdrawal: 'irregular_income',
};

export function groupOf(type: string): TxGroup | undefined {
	return (TYPE_GROUP as Record<string, TxGroup | undefined>)[type];
}

/** Merchant category codes that appear in the dataset (ISO 18245 names). */
export const MCC_LABELS: Record<string, string> = {
	'5411': 'Grocery stores and supermarkets',
	'5422': 'Meat and freezer stores',
	'5451': 'Dairy stores',
	'5499': 'Convenience and speciality food stores',
	'5812': 'Restaurants',
	'5813': 'Bars and pubs',
	'5814': 'Fast food and cafés',
	'4111': 'Local public transport',
	'4121': 'Taxis and rideshare',
	'5541': 'Service stations',
	'5542': 'Fuel dispensers',
	'7523': 'Parking',
	'7832': 'Cinemas',
	'7922': 'Theatre and event tickets',
	'7991': 'Tourist attractions',
	'7996': 'Amusement parks',
	'7999': 'Recreation services',
	'5912': 'Pharmacies',
	'8011': 'Doctors',
	'8021': 'Dentists',
	'8099': 'Health services',
	'5200': 'Home supply stores',
	'5251': 'Hardware stores',
	'5712': 'Furniture stores',
	'5732': 'Electronics stores',
	'5734': 'Software stores',
	'5651': 'Family clothing stores',
	'5691': 'Clothing stores',
	'5941': 'Sporting goods',
	'5942': 'Book stores',
	'5945': 'Toy and hobby stores',
	'5999': 'Miscellaneous retail',
	'4511': 'Airlines',
	'4722': 'Travel agencies',
	'7011': 'Hotels',
	'7512': 'Car rental',
};
export const MCC_CODES = Object.keys(MCC_LABELS) as [string, ...string[]];
