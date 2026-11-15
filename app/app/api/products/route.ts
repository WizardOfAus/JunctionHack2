// Savings options explained neutrally, plus S-Bank's current terms with citations (live or a dated cache).
import { products } from '@/lib/products/catalogue';
import { sBankTerms } from '@/lib/products/live';

export async function GET() {
  return Response.json({ products, sBank: await sBankTerms(), label: 'Information, not investment advice.' });
}
