import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { Koti } from './agents/koti.ts';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

// Talk to Koti with one POST per message. The last path part is the conversation id.
// Send initialData on the first message to bind the conversation to one customer:
//
//   curl -X POST http://localhost:5180/agents/koti/demo-1 \
//     -H 'content-type: application/json' \
//     -d '{"kind":"user","body":"How much did I spend on taxis in August?","initialData":{"customerId":"CUST04859"}}'
//
// The Koti app calls this route from its server (app/lib/coach/agent.ts), never from the browser.
// If KOTI_AGENT_TOKEN is set, every request must send "Authorization: Bearer <token>".
// Set it before other people can reach this server.
const token = process.env.KOTI_AGENT_TOKEN?.trim();
if (token) app.use('/agents/*', bearerAuth({ token }));

app.route('/agents/koti', createAgentRouter(Koti));

export default app;
