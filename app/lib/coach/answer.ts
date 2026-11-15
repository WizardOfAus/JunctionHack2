// The coach answer, shared by /api/coach (JSON) and /api/coach/stream (server-sent progress).
import 'server-only';
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
import { historySchema,historyContext,resolveFollowUp } from '@/lib/coach/history';
import { answerActions } from '@/lib/coach/actions';
import { answerVisual } from '@/lib/coach/visuals';
import { CALCULATING_STEP,type CoachProgress } from '@/lib/coach/progress';
import { learnedFacts,memoryContext,rememberRequest } from '@/lib/memory/memory';
import { visitorId } from '@/lib/memory/scope';
import { listConnections, sessionId } from '@/lib/open-banking/server';
import { fullPicture, fullPictureContext } from '@/lib/open-banking/full-picture';
import { memoryStore } from '@/lib/memory/store';
import { personaIdSchema,DEFAULT_PERSONA_ID } from '@/lib/contracts';

export type CoachOptions={onProgress?:(event:CoachProgress)=>void;signal?:AbortSignal;onAdmitted?:(capability:string)=>void};
export async function coachResponse(request:Request,{onProgress,signal,onAdmitted}:CoachOptions={}):Promise<Response> {
  try {
    const body=z.object({question:z.string().min(1).max(1500),assumptions:assumptionsSchema,personaId:z.unknown().optional(),context:journeyContextSchema.optional(),history:historySchema.optional()}).strict().parse(await request.json());
    const history=body.history??[];
    const persona=await personaFromRequest(body.personaId);if(!persona) return unknownPersona();
    const transactions=persona.transactions,provenance={customerId:persona.customerId,accountId:persona.accountId};
    const {assumptions:a}=body;const q=body.question.toLowerCase();
    const context=body.context ?? defaultContext;
    const f=forecast(transactions,a,CLOCK,persona.customerId);
    const actions=journeyActions(context,q,!f.blocked&&a.connected);
    // Refined once the calculated intent is known (below); validation replies keep the base actions.
    let shownActions=actions;
    // Plain wording for the badge: the S-Bank Junction dataset is synthetic by design.
    const source={dataset:'S-Bank Junction 2026 dataset (synthetic)',customerLabel:`Customer ${persona.customerId.replace(/^CUST/,'')}`};
    // When the agent is configured but down, the calculated answers below still reply, with a note.
    let agentNote='';
    // Validation replies also use kind:'help'; preserve their actionable text during outages.
    let unsupported=false;
    const respond=(payload:Record<string,unknown>)=>Response.json({...payload,...(agentNote&&payload.mode==='demo'?{text:payload.kind==='help'?(unsupported?'The AI coach is not available right now.':payload.text):`${agentNote} ${payload.text}`,agentUnavailable:true}:{}),persona:persona.view,source,context,actions:shownActions});
    if(!a.connected)return respond({text:'Your demo source is disconnected. Reconnect it in Your data to explore transactions.',mode:'demo',kind:'help',evidence:[]});
    const recent=recentWindow();const profile=basketProfile(transactions);
    const readiness=loanReadiness({forecast:f,assumptions:a,mortgage:persona.view.mortgage,marketRate:latestMortgageRate(CLOCK)});
    const comparison=benchmarks({rows:transactions,salaryCents:f.salaryCents,age:persona.view.customer.age,tables:benchmarkTables,isSpending:isConsumption});
    // The app's own answer, when it can calculate one. The demo coach replies with it; the agent quotes it.
    // A short follow-up ("and in July?") borrows the previous question's topic when it has none of its own.
    const {calc}=resolveFollowUp(body.question,history,question=>calculatedAnswer({question,transactions,customerId:persona.customerId,assumptions:a,forecast:f,profile,readiness,mortgage:persona.view.mortgage,comparison,context,actions}));
    shownActions=answerActions(actions,calc.intent,q);
    // A small chart from the same calculation, shown inside the chat.
    const visual=answerVisual({calc,forecast:f,comparison,readiness,months:3,transactions,format:c=>euro(c),
      window:transactions.filter(t=>t.tx_date>=recent.from&&isConsumption(t)).map(t=>({category:t.category,basket:basketOf(t,a.corrections,profile),spentCents:-t.amountCents}))});
    // "Remember that …" is saved only after the person confirms it in the app.
    const remember=rememberRequest(body.question);
    if(remember) return respond({text:`Want me to remember this? “${remember}” You can see or remove it any time under What Pesä knows.`,kind:'remember',mode:'demo',rememberSuggestion:remember,evidence:[]});
    onProgress?.(CALCULATING_STEP);onProgress?.({type:'step-done',id:CALCULATING_STEP.id});
    const agent=agentConfig();
    if(agent) {
      // Live agent mode: the Flue agent answers. The server fixes the customer scope.
      try {
        // Basket figures come from the app's own rules, with the user's corrections, so the coach and the UI agree.
        const window=transactions.filter(t=>t.tx_date>=recent.from&&isConsumption(t));
        const appContext=coachJourneyContext(context,a,f)+"\n"+basketContext(window.map(t=>({category:t.category,basket:basketOf(t,a.corrections,profile),spentCents:-t.amountCents})),f.baskets,{months:3,period:recent.label,corrections:Object.keys(a.corrections).length,format:c=>euro(c)});
        // Application record, loan readiness and benchmarks, so the agent explains the app's figures instead of guessing.
        // What Pesä knows: derived facts plus what the person asked it to remember. Storage failures never block an answer.
        const personaKey=personaIdSchema.optional().safeParse(body.personaId).data??DEFAULT_PERSONA_ID;
        const owner=visitorId(request);
        const told=owner?await memoryStore().list({visitorId:owner,personaId:personaKey}).catch(()=>[]):[];
        const memory=memoryContext(learnedFacts({rows:transactions,forecast:f,comparison,mortgage:persona.view.mortgage,goal:context.goal,format:c=>euro(c)}),told);
        const bankSession=sessionId(request);
        const connections=bankSession?listConnections(bankSession,personaKey):[];
        const connectedContext=connections.length?fullPictureContext(fullPicture({forecast:f,connections,readiness,asOf:HISTORY_THROUGH}),c=>euro(c)):'';
        const reply=await askAgent(agent,{customerId:provenance.customerId,question:body.question,appContext:[historyContext(history),calculatedContext(calc),appContext,readinessContext(readiness,persona.view.mortgage,c=>euro(c)),benchmarkContext(comparison,c=>euro(c)),memory,connectedContext].filter(Boolean).join('\n\n')},{onProgress,signal,onAdmitted});
        // Source rows stay inspectable when the agent quotes an authoritative app calculation.
        const evidence=calc.authoritative?{evidence:calc.evidence,category:calc.category,basket:calc.basket,from:calc.from,to:calc.to}:{evidence:[]};
        return respond({text:reply.text,kind:'answer',mode:'agent',intent:calc.intent,visual:calc.authoritative?visual:null,...evidence,conversationId:reply.conversationId,account:provenance.accountId,dataThrough:HISTORY_THROUGH});
      } catch(e) {
        if(signal?.aborted) throw e;
        if(!(e instanceof AgentUnavailableError)) {
          console.error('Koti agent request failed:', e instanceof Error ? e.name : 'UnknownError');
          return Response.json({error:'The AI coach could not complete this request. Check the server configuration or try again.'},{status:502});
        }
        console.error('Koti agent error:',e.message);
        agentNote='The AI coach is not available right now, so this is a calculated answer.';
      }
    }
    if(calc.intent==='unsupported') unsupported=true;
    // The demo reply shows the calculation itself; intent and authority are agent-context details.
    const shown:Partial<typeof calc>={...calc};delete shown.intent;delete shown.authoritative;
    return respond({...shown,visual,mode:'demo',version:VERSION,account:provenance.accountId,dataThrough:HISTORY_THROUGH});
  }catch(error){if(error instanceof DemoDataUnavailableError)return demoDataUnavailable(error);return Response.json({error:'That question could not be processed. Shorten it and try again.'},{status:400});}
}
