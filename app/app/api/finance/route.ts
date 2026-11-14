import { assumptionsSchema } from '@/lib/contracts';
import { forecast,evaluateAsp,depositReady,defaults,CLOCK } from '@/lib/finance';
import { personaFromRequest,provenanceOf,unknownPersona } from '@/lib/personas/request';
import { loanReadiness } from '@/lib/loan-readiness';
import { latestMortgageRate } from '@/lib/market-rates';
function respond(persona:NonNullable<ReturnType<typeof personaFromRequest>>,a:typeof defaults){
  const f=forecast(persona.transactions,a,CLOCK,persona.customerId);
  return Response.json({forecast:f,asp:evaluateAsp(a.aspOpenedOn,a.aspDeposits),goal:depositReady(a,f.challengeCents),provenance:provenanceOf(persona),persona:persona.view,
    loanReadiness:loanReadiness({forecast:f,assumptions:a,mortgage:persona.view.mortgage,marketRate:latestMortgageRate(CLOCK)})});
}
export async function GET(request:Request){
  const persona=personaFromRequest(new URL(request.url).searchParams.get('personaId')??undefined);
  return persona?respond(persona,defaults):unknownPersona();
}
export async function POST(request:Request){
  try {
    // personaId sits beside the assumption fields at the top level of this request.
    const {personaId,...fields}=await request.json() as Record<string,unknown>;
    const persona=personaFromRequest(personaId);if(!persona) return unknownPersona();
    return respond(persona,assumptionsSchema.parse(fields));
  }
  catch{return Response.json({error:'Check the amounts and dates, then try again.'},{status:400});}
}
