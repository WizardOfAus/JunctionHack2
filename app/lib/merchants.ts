// Merchant names for statement rows: real public names from OpenStreetMap, assigned to the dataset's
// synthetic merchant ids for the demo (data/overlays/merchants.csv). The transactions stay synthetic.
import 'server-only';
import merchantsCsv from '@/data/overlays/merchants.csv?raw';
import { parseCsv } from './csv';

export type MerchantInfo = { name: string; place: string; kind: string };
const byId = new Map(parseCsv(merchantsCsv).map(r => [r.merchant_id, { name: r.display_name, place: r.municipality, kind: r.mcc_description }]));
export const merchantInfo = (id: string): MerchantInfo | null => (id ? byId.get(id) ?? null : null);
export const MERCHANT_NOTE = 'Merchant names come from OpenStreetMap (ODbL) and are assigned to synthetic merchants; these businesses did not take part in the transactions.';
