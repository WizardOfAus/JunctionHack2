// Banks a person can connect: the built-in Demo bank, plus Finnish sandbox banks via Enable Banking when configured.
import { DEMO_BANK } from '@/lib/open-banking/demo-bank';
import { enableBanking } from '@/lib/open-banking/server';
import type { Bank } from '@/lib/open-banking/types';

let cache: { at: number; banks: Bank[] } | null = null;
export async function GET() {
  const client = enableBanking();
  let live: Bank[] = [], note: string | null = null;
  if (client) {
    try {
      if (!cache || Date.now() - cache.at > 3600000) cache = { at: Date.now(), banks: await client.banks('FI') };
      live = cache.banks;
    } catch { note = 'Live bank sandbox is not reachable right now; the Demo bank still works.'; }
  } else note = 'Live bank sandbox is not configured on this server; the Demo bank still works.';
  return Response.json({ banks: [DEMO_BANK, ...live], liveAvailable: live.length > 0, note });
}
