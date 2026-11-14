import 'server-only';
import { env } from 'cloudflare:workers';
import { resolvePersona } from './personas';
import { DEMO_DATE } from './finance';
import { dataSource, createPersonaLoader } from './data-provider';
import { DemoDataUnavailableError, fetchPersona, readConfig } from './supabase-data';

export { DemoDataUnavailableError };
const SOURCE_REVISION='fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f';
const load=createPersonaLoader(resolvePersona,customerId=>fetchPersona(readConfig(env as unknown as Record<string,unknown>),customerId),SOURCE_REVISION,DEMO_DATE);

/** One resolver for workspace bootstrap and all APIs. No implicit remote-to-bundled fallback. */
export function demoData(personaId?:string) {
  return load(personaId,dataSource(env as unknown as Record<string,unknown>));
}
export function demoDataUnavailable(error:unknown) {
  // Do not log credentials, request URLs, response bodies or arbitrary transport errors.
  console.error('Demo data unavailable:',error instanceof DemoDataUnavailableError?error.message:'Unexpected data provider failure.');
  return Response.json({error:'The selected demo data is not available at the moment. Try again later.'},{status:503});
}
