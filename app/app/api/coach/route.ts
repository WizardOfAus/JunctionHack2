import { DemoDataUnavailableError, demoDataUnavailable } from '@/lib/server-data';
import { z } from 'zod';
import { assumptionsSchema } from '@/lib/contracts';
import { personaFromRequest,unknownPersona } from '@/lib/personas/request';
import { forecast,euro,basketOf,basketProfile,isConsumption,recentWindow,HISTORY_THROUGH,VERSION,CLOCK } from '@/lib/finance';
import { loanReadiness,readinessContext } from '@/lib/loan-readiness';
import { benchmarks,benchmarkContext } from '@/lib/benchmarks';
import { benchmarkTables } from '@/lib/benchmark-tables';
import { latestMortgageRate } from '@/lib/market-rates';
import { agentConfig, askAgent, AgentUnavailableError } from '@/lib/coach/agent';
import { journeyContextSchema, defaultContext, journeyActions, coachJourneyContext } from '@/lib/journey/context';
import { basketContext } from '@/lib/coach/context';
import { calculatedAnswer,calculatedContext } from '@/lib/coach/calculated';
export async function POST(request:Request) {
  try {
    const body=z.object({question:z.string().min(1).max(1500),assumptions:assumptionsSchema,personaId:z.unknown().optional(),context:journeyContextSchema.optional()}).strict().parse(await request.json());
    const persona=await personaFromRequest(body.personaId);if(!persona) return unknownPersona();
    const transactions=persona.transactions,provenance={customerId:persona.customerId,accountId:persona.accountId};
    const {assumptions:a}=body;const q=body.question.toLowerCase();
    const context=body.context ?? defaultContext;
    const f=forecast(transactions,a,CLOCK,persona.customerId);
    const actions=journeyActions(context,q,!f.blocked&&a.connected);
    // Plain wording for the badge: the S-Bank Junction dataset is synthetic by design.
    const source={dataset:'S-Bank Junction 2026 dataset (synthetic)',customerLabel:`Customer ${persona.customerId.replace(/^CUST/,'')}`};
    // When the agent is configured but down, the calculated answers below still reply, with a note.
    let agentNote='';
    // Validation replies also use kind:'help'; preserve their actionable text during outages.
    let unsupported=false;
    const respond=(payload:Record<string,unknown>)=>Response.json({...payload,...(agentNote&&payload.mode==='demo'?{text:payload.kind==='help'?(unsupported?'The AI coach is not available right now.':payload.text):`${agentNote} ${payload.text}`,agentUnavailable:true}:{}),persona:persona.view,source,context,actions});
    if(!a.connected)return respond({text:'Your demo source is disconnected. Reconnect it in Your data to explore transactions.',mode:'demo',kind:'help',evidence:[]});
    const recent=recentWindow();const profile=basketProfile(transactions);
    const readiness=loanReadiness({forecast:f,assumptions:a,mortgage:persona.view.mortgage,marketRate:latestMortgageRate(CLOCK)});
    const comparison=benchmarks({rows:transactions,salaryCents:f.salaryCents,age:persona.view.customer.age,tables:benchmarkTables,isSpending:isConsumption});
    // The app's own answer, when it can calculate one. The demo coach replies with it; the agent quotes it.
    const calc=calculatedAnswer({question:body.question,transactions,customerId:persona.customerId,assumptions:a,forecast:f,profile,readiness,mortgage:persona.view.mortgage,comparison,context,actions});
    const agent=agentConfig();
    if(agent) {
      // Live agent mode: the Flue agent answers. The server fixes the customer scope.
      try {
        // Basket figures come from the app's own rules, with the user's corrections, so the coach and the UI agree.
        const window=transactions.filter(t=>t.tx_date>=recent.from&&isConsumption(t));
        const appContext=coachJourneyContext(context,a,f)+"\n"+basketContext(window.map(t=>({category:t.category,basket:basketOf(t,a.corrections,profile),spentCents:-t.amountCents})),f.baskets,{months:3,period:recent.label,corrections:Object.keys(a.corrections).length,format:c=>euro(c)});
        // Application record, loan readiness and benchmarks, so the agent explains the app's figures instead of guessing.
        const reply=await askAgent(agent,{customerId:provenance.customerId,question:body.question,appContext:[calculatedContext(calc),appContext,readinessContext(readiness,persona.view.mortgage,c=>euro(c)),benchmarkContext(comparison,c=>euro(c))].filter(Boolean).join('\n\n')});
        // Source rows stay inspectable when the agent quotes an authoritative app calculation.
        const evidence=calc.authoritative?{evidence:calc.evidence,category:calc.category,basket:calc.basket,from:calc.from,to:calc.to}:{evidence:[]};
        return respond({text:reply.text,kind:'answer',mode:'agent',intent:calc.intent,...evidence,conversationId:reply.conversationId,account:provenance.accountId,dataThrough:HISTORY_THROUGH});
      } catch(e) {
        if(!(e instanceof AgentUnavailableError)) {
          console.error('Koti agent request failed:', e instanceof Error ? e.name : 'UnknownError');
          return Response.json({error:'The AI coach could not complete this request. Check the server configuration or try again.'},{status:502});
        }
        console.error('Koti agent error:',e.message);
        agentNote='The AI coach is not available right now, so this is a calculated answer.';
      }
    }
    if(calc.intent==='unsupported') unsupported=true;
    const {intent:_intent,authoritative:_authoritative,...shown}=calc;
    return respond({...shown,mode:'demo',version:VERSION,account:provenance.accountId,dataThrough:HISTORY_THROUGH});
  }catch(error){if(error instanceof DemoDataUnavailableError)return demoDataUnavailable(error);return Response.json({error:'That question could not be processed. Shorten it and try again.'},{status:400});}
}
