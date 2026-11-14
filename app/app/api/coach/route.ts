import { DemoDataUnavailableError, demoDataUnavailable } from '@/lib/server-data';
import { z } from 'zod';
import { assumptionsSchema } from '@/lib/contracts';
import { personaFromRequest,unknownPersona } from '@/lib/personas/request';
import { forecast,summarise,euro,evaluateAsp,basketOf,basketProfile,isConsumption,type Basket,recentWindow,latestMonthPeriod,DATA_START,HISTORY_THROUGH,VERSION,CLOCK } from '@/lib/finance';
const readable=(iso:string)=>new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
import { matchCategory,spendingCategories } from '@/lib/categories';
import { agentConfig, askAgent, AgentUnavailableError } from '@/lib/coach/agent';
import { journeyContextSchema, defaultContext, journeyActions, coachJourneyContext } from '@/lib/journey/context';
import { basketContext } from '@/lib/coach/context';
export async function POST(request:Request) {
  try {
    const body=z.object({question:z.string().min(1).max(1500),assumptions:assumptionsSchema,personaId:z.unknown().optional(),context:journeyContextSchema.optional()}).strict().parse(await request.json());
    const persona=await personaFromRequest(body.personaId);if(!persona) return unknownPersona();
    const transactions=persona.transactions,provenance={customerId:persona.customerId,accountId:persona.accountId};
    const {assumptions:a}=body;const q=body.question.toLowerCase();
    const context=body.context ?? defaultContext;
    const f=forecast(transactions,a,CLOCK,persona.customerId);
    const actions=journeyActions(context,q,!f.blocked&&a.connected);
    const respond=(payload:Record<string,unknown>)=>Response.json({...payload,persona:persona.view,context,actions});
    if(!a.connected)return respond({text:'Your demo source is disconnected. Reconnect it in Your data to explore transactions.',mode:'demo',kind:'help',evidence:[]});
    const recent=recentWindow();const profile=basketProfile(transactions);
    const agent=agentConfig();
    if(agent) {
      // Live agent mode: the Flue agent answers. The server fixes the customer scope.
      try {
        // Basket figures come from the app's own rules, with the user's corrections, so the coach and the UI agree.
        const window=transactions.filter(t=>t.tx_date>=recent.from&&isConsumption(t));
        const appContext=coachJourneyContext(context,a,f)+"\n"+basketContext(window.map(t=>({category:t.category,basket:basketOf(t,a.corrections,profile),spentCents:-t.amountCents})),f.baskets,{months:3,period:recent.label,corrections:Object.keys(a.corrections).length,format:c=>euro(c)});
        const reply=await askAgent(agent,{customerId:provenance.customerId,question:body.question,appContext});
        return respond({text:reply.text,kind:'answer',mode:'agent',conversationId:reply.conversationId,evidence:[],account:provenance.accountId,dataThrough:HISTORY_THROUGH});
      } catch(e) {
        if(e instanceof AgentUnavailableError) {console.error('Koti agent error:',e.message);return Response.json({error:'The AI coach is not available right now. Try again soon.'},{status:502});}
        throw e;
      }
    }
    const matched=matchCategory(q);const isSpendingCategory=(spendingCategories as readonly string[]).includes(matched||'');
    let {from,to}=recent;
    const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
    const month=months.findIndex(m=>q.includes(m));
    // A month name means its latest complete occurrence in the history; the default window's own label keeps the default.
    if(month>=0&&!q.includes(recent.label.toLowerCase().split(' ')[0])) ({from,to}=latestMonthPeriod(month));
    const lastMonth=latestMonthPeriod(Number(HISTORY_THROUGH.slice(5,7))-1);
    if(q.includes('last month')) ({from,to}=lastMonth);
    const dates=q.match(/\d{4}-\d{2}-\d{2}/g);if(dates?.length===2){[from,to]=dates;}
    if(from>to||to>HISTORY_THROUGH||from<DATA_START) return respond({mode:'demo',kind:'help',text:`Choose a period between ${readable(DATA_START)} and ${readable(HISTORY_THROUGH)}. The data ends there.`,evidence:[]});
    let basket:Basket|undefined;
    let text='',kind='answer',category:string|undefined,evidence:string[]=[],reductionPercent:number|undefined;
    if(/what.*next|recommend.*lesson|learn next|where.*start/.test(q)) {const next=actions.find(action=>action.type==='lesson');text=next?.type==='lesson'?`Your direction is ${context.goal==='home'?'a first home':context.goal==='buffer'?'building a safety net':'understanding your money'}. Your next discovery is ${next.lessonId==='balance'?'how a balance differs from spending room':next.lessonId==='reserve'?'how a reserve protects everyday life':'how a small change affects a forecast'}. Try it, then preview a change against this account. Nothing changes in your plan until you choose to apply it.`:'You have completed the foundations. Try a scenario against your current plan, or revisit a lesson whenever you want.';kind='journey';}
    else if(/basket/.test(q)) {({from,to}=recent);basket=/irregular/.test(q)?'irregular':/regular|essential/.test(q)?'regular':'flexible';text=`Your ${basket} basket averages ${euro(f.baskets[basket],2)} per month over ${recent.label}, using your current classification corrections. These groups help you inspect patterns; they do not decide which spending matters to you.`;kind='basket';evidence=transactions.filter(t=>t.tx_date>=recent.from&&isConsumption(t)&&basketOf(t,a.corrections,profile)===basket).map(t=>t.id);}
    else if(/asp/.test(q)) {const asp=evaluateAsp(a.aspOpenedOn,a.aspDeposits);text=asp.message+' The deposit amount and qualifying months are separate milestones; neither guarantees a mortgage.';kind='asp';}
    else if(/taxi|uber|rideshare/.test(q)) {if(month<0&&!dates) ({from,to}=lastMonth); const ts=transactions.filter(t=>t.tx_date>=from&&t.tx_date<=to&&t.mcc_code==='4121'&&t.amountCents<0);text=`Recognised taxi and rideshare spending was ${euro(ts.reduce((s,t)=>s-t.amountCents,0),2)} from ${from} to ${to}. This counts MCC 4121 only; rows without a merchant code cannot establish zero taxi spending.`;evidence=ts.map(t=>t.id);category='Transportation';}
    else if(/restaurant|eating|dining/.test(q)) {category='Restaurants';const s=summarise(transactions,from,to,category,CLOCK,persona.customerId);evidence=s.evidence;const monthCount=(Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5,7))-Number(from.slice(5,7))+1;const average=Math.round(s.spentCents/monthCount); const percent=Number(q.match(/(\d{1,3})\s*%/)?.[1]||20);if(percent>100)return respond({mode:'demo',kind:'help',text:'Choose a spending reduction between 0% and 100%.',evidence:[]});reductionPercent=percent;text=`Restaurant spending was ${euro(s.spentCents,2)} from ${from} to ${to}, an average of ${euro(average,2)} per calendar month covered. A ${percent}% reduction would be ${euro(Math.round(average*percent/100),2)} per month. That is a projection, not money already saved.`;kind='scenario';}
    else if(/balance|safe|save|spend|reserve|buffer|room/.test(q)&&!isSpendingCategory) {text=`Your recorded balance is ${euro(f.balanceCents,2)}. After the projected costs and a protected reserve of ${euro(f.protectedCents)}, estimated extra room to allocate is ${euro(f.remainingCents,2)} over ${f.horizonDays} days. Existing saving transfers are already included. ${f.warnings.join(' ')||'This is additional room above your estimated everyday spending, not a weekly income.'}`;kind='forecast';evidence=f.evidence;}
    else if(matched==='Invest Deposit') {category=matched;const ds=transactions.filter(t=>t.tx_date>=from&&t.tx_date<=to&&t.category===matched&&t.amountCents<0);text=`Investment deposits were ${euro(ds.reduce((s,t)=>s-t.amountCents,0),2)} from ${from} to ${to}, across ${ds.length} transfer${ds.length===1?'':'s'}. Their destination and current value are not in this data.`;evidence=ds.map(t=>t.id);}
    else {category=isSpendingCategory?matched:undefined;if(category||matched==='Salary'||/transactions|categories|overview/.test(q)) {const s=summarise(transactions,from,to,category,CLOCK,persona.customerId);text=matched==='Salary'?`Recorded salary income was ${euro(s.incomeCents,2)} from ${from} to ${to}. Future salary remains an estimate until received.`:`${category||'Total consumption'} was ${euro(s.spentCents,2)} from ${from} to ${to}. Open the source rows to check the categories or correct a spending basket.`;evidence=s.evidence;} else {kind='help';text='This demo coach can calculate spending by category and period, recognised taxis, restaurant scenarios, your cash reserve and ASP progress. Try “What should I learn next?” or “Restaurants last month”. Open-ended AI coaching will be connected after the UI review.';}}
    return respond({text,kind,mode:'demo',category,basket,from,to,evidence,reductionPercent,version:VERSION,account:provenance.accountId,dataThrough:HISTORY_THROUGH});
  }catch(error){if(error instanceof DemoDataUnavailableError)return demoDataUnavailable(error);return Response.json({error:'That question could not be processed. Shorten it and try again.'},{status:400});}
}
