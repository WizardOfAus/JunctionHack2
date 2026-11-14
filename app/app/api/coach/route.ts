import { z } from 'zod';
import { assumptionsSchema } from '@/lib/contracts';
import { provenance,transactions } from '@/lib/server-data';
import { forecast,summarise,euro,evaluateAsp,VERSION } from '@/lib/finance';
import { matchCategory,spendingCategories } from '@/lib/categories';
import { agentConfig, askAgent, AgentUnavailableError, CONVERSATION_ID_PATTERN } from '@/lib/coach/agent';
export async function POST(request:Request) {
  try {
    const body=z.object({question:z.string().min(1).max(1500),assumptions:assumptionsSchema,conversationId:z.string().regex(CONVERSATION_ID_PATTERN).optional()}).strict().parse(await request.json());
    const {assumptions:a}=body;const q=body.question.toLowerCase();
    if(!a.connected)return Response.json({text:'Your demo source is disconnected. Reconnect it in Your data to explore transactions.',mode:'demo',kind:'help',evidence:[]});
    const agent=agentConfig();
    if(agent) {
      // Live agent mode: the Flue agent answers. The server fixes the customer scope.
      const conversationId=body.conversationId??`koti-app-${crypto.randomUUID()}`;
      try {
        const reply=await askAgent(agent,{conversationId,customerId:provenance.customerId,question:body.question});
        return Response.json({text:reply.text,kind:'answer',mode:'agent',conversationId,evidence:[],account:provenance.accountId,dataThrough:'2026-08-31'});
      } catch(e) {
        if(e instanceof AgentUnavailableError) {console.error('Koti agent error:',e.message);return Response.json({error:'The AI coach is not available right now. Try again soon.'},{status:502});}
        throw e;
      }
    }
    const f=forecast(transactions,a);
    const matched=matchCategory(q);const isSpendingCategory=(spendingCategories as readonly string[]).includes(matched||'');
    let from='2026-06-01',to='2026-08-31';
    const months=['january','february','march','april','may','june','july','august'];
    const month=months.findIndex(m=>q.includes(m));
    if(month>=0&&!q.includes('june–august')&&!q.includes('june to august')) {const m=String(month+1).padStart(2,'0');from=`2026-${m}-01`;to=new Date(Date.UTC(2026,month+1,0)).toISOString().slice(0,10);}
    if(q.includes('last month')) {from='2026-08-01';to='2026-08-31';}
    const dates=q.match(/\d{4}-\d{2}-\d{2}/g);if(dates?.length===2){[from,to]=dates;}
    if(from>to||to>='2026-09-01'||from<'2024-10-01') return Response.json({mode:'demo',kind:'help',text:'Choose a period between 1 October 2024 and 31 August 2026. September is held out so it cannot influence coaching.',evidence:[]});
    let text='',kind='answer',category:string|undefined,evidence:string[]=[],reductionPercent:number|undefined;
    if(/asp/.test(q)) {const asp=evaluateAsp(a.aspOpenedOn,a.aspDeposits);text=asp.message+' The deposit amount and qualifying months are separate milestones; neither guarantees a mortgage.';kind='asp';}
    else if(/taxi|uber|rideshare/.test(q)) {if(month<0&&!dates){from='2026-08-01';to='2026-08-31';} const ts=transactions.filter(t=>t.tx_date>=from&&t.tx_date<=to&&t.mcc_code==='4121'&&t.amountCents<0);text=`Recognised taxi and rideshare spending was ${euro(ts.reduce((s,t)=>s-t.amountCents,0),2)} from ${from} to ${to}. This counts MCC 4121 only; rows without a merchant code cannot establish zero taxi spending.`;evidence=ts.map(t=>t.id);category='Transportation';}
    else if(/restaurant|eating|dining/.test(q)) {category='Restaurants';const s=summarise(transactions,from,to,category);evidence=s.evidence;const monthCount=(Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5,7))-Number(from.slice(5,7))+1;const average=Math.round(s.spentCents/monthCount); const percent=Number(q.match(/(\d{1,3})\s*%/)?.[1]||20);if(percent>100)return Response.json({mode:'demo',kind:'help',text:'Choose a spending reduction between 0% and 100%.',evidence:[]});reductionPercent=percent;text=`Restaurant spending was ${euro(s.spentCents,2)} from ${from} to ${to}, an average of ${euro(average,2)} per calendar month covered. A ${percent}% reduction would be ${euro(Math.round(average*percent/100),2)} per month. That is a projection, not money already saved.`;kind='scenario';}
    else if(/balance|safe|save|spend|reserve|buffer|room/.test(q)&&!isSpendingCategory) {text=`Your recorded balance is ${euro(f.balanceCents,2)}. After the projected costs and a protected reserve of ${euro(f.protectedCents)}, estimated extra room to allocate is ${euro(f.remainingCents,2)} over ${f.horizonDays} days. Existing saving transfers are already included. ${f.warnings[0]||'This is additional room above your estimated everyday spending, not a weekly income.'}`;kind='forecast';evidence=f.evidence;}
    else if(matched==='Invest Deposit') {category=matched;const ds=transactions.filter(t=>t.tx_date>=from&&t.tx_date<=to&&t.category===matched&&t.amountCents<0);text=`Investment deposits were ${euro(ds.reduce((s,t)=>s-t.amountCents,0),2)} from ${from} to ${to}, across ${ds.length} transfer${ds.length===1?'':'s'}. Their destination and current value are not in this data.`;evidence=ds.map(t=>t.id);}
    else {category=isSpendingCategory?matched:undefined;if(category||matched==='Salary'||/transactions|categories|overview/.test(q)) {const s=summarise(transactions,from,to,category);text=matched==='Salary'?`Recorded salary income was ${euro(s.incomeCents,2)} from ${from} to ${to}. Future salary remains an estimate until received.`:`${category||'Total consumption'} was ${euro(s.spentCents,2)} from ${from} to ${to}. Open the source rows to check the categories or correct a spending basket.`;evidence=s.evidence;} else {kind='help';text='This demo coach can calculate spending by category and period, recognised taxis, restaurant scenarios, your cash reserve and ASP progress. Try “Groceries in July” or “Restaurants from 2026-06-01 to 2026-08-31”. Open-ended AI coaching will be connected after the UI review.';}}
    return Response.json({text,kind,mode:'demo',category,from,to,evidence,reductionPercent,version:VERSION,account:'ACC004859',dataThrough:'2026-08-31'});
  }catch{return Response.json({error:'That question could not be processed. Shorten it and try again.'},{status:400});}
}
