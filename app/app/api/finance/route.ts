import { assumptionsSchema } from '@/lib/contracts';
import { forecast,evaluateAsp,depositReady,defaults } from '@/lib/finance';
import { demoData,demoDataUnavailable } from '@/lib/server-data';
export async function GET(){let data;try{data=await demoData();}catch(error){return demoDataUnavailable(error);}const {transactions,provenance}=data;const f=forecast(transactions,defaults);return Response.json({forecast:f,asp:evaluateAsp('',[]),goal:depositReady(defaults,f.challengeCents),provenance});}
export async function POST(request:Request){
  let data;try{data=await demoData();}catch(error){return demoDataUnavailable(error);}const {transactions,provenance}=data;
  try {const a=assumptionsSchema.parse(await request.json()); const f=forecast(transactions,a);return Response.json({forecast:f,asp:evaluateAsp(a.aspOpenedOn,a.aspDeposits),goal:depositReady(a,f.challengeCents),provenance});}
  catch{return Response.json({error:'Check the amounts and dates, then try again.'},{status:400});}
}
