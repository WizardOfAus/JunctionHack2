import { z } from 'zod';
import { agentConfig } from '@/lib/coach/agent';
import { cancelAgent } from '@/lib/coach/transport';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({error:'Origin not allowed'},{status:403});
  const input = z.object({capability:z.string().regex(/^koti-app-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)}).strict().safeParse(await request.json().catch(()=>null));
  if (!input.success) return Response.json({error:'Invalid cancellation request'},{status:400});
  const config=agentConfig();
  if (!config) return Response.json({stopped:true});
  try { await cancelAgent(config,input.data.capability); return Response.json({stopped:true}); }
  catch { return Response.json({error:'Could not confirm cancellation'},{status:502}); }
}
