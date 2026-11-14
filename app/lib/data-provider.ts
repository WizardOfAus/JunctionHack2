import { DemoDataUnavailableError, type PersonaRecord } from './supabase-data';
import type { Transaction } from './finance';

export type DataSource = 'bundled' | 'supabase';
export function dataSource(env: Record<string, unknown>): DataSource {
  const value=env.KOTI_DATA_SOURCE;
  if(value===undefined||value===''||value==='bundled')return 'bundled';
  if(value==='supabase')return 'supabase';
  throw new DemoDataUnavailableError('KOTI_DATA_SOURCE must be bundled or supabase.');
}

type ScopedPersona = {customerId:string;accountId:string;transactions:Transaction[]};
/** Validate the remote copy against the pinned, allowlisted artifact, once per cached load. */
export function verifyCopy(expected:ScopedPersona, remote:PersonaRecord, revision:string, asOf:string) {
  if(remote.customerId!==expected.customerId||remote.accountId!==expected.accountId)throw new DemoDataUnavailableError('Supabase persona identity does not match the catalogue.');
  if(remote.sourceRevision!==revision||remote.asOf!==asOf)throw new DemoDataUnavailableError('Supabase source revision or demo clock is stale. Regenerate the seed.');
  if(remote.transactions.length!==expected.transactions.length)throw new DemoDataUnavailableError('Supabase row count does not match the audited persona. Regenerate the seed.');
  const byId=new Map(remote.transactions.map(row=>[row.id,row]));
  if(byId.size!==remote.transactions.length)throw new DemoDataUnavailableError('Supabase returned duplicate transaction IDs.');
  for(const row of expected.transactions){
    const copy=byId.get(row.id);
    if(!copy||Object.entries(row).some(([key,value])=>(copy as unknown as Record<string,unknown>)[key]!==value))throw new DemoDataUnavailableError('Supabase transactions differ from the audited persona. Regenerate the seed.');
  }
  // Restore audited chronological order even if a transport changed the row ordering.
  return expected.transactions.map(row=>byId.get(row.id)!);
}

/** Cache by allowlisted persona; failed requests evict only their own entry. */
export function createPersonaLoader<T extends ScopedPersona>(resolve:(id?:string)=>T,fetchRemote:(customerId:string)=>Promise<PersonaRecord>,revision:string,asOf:string) {
  const cache=new Map<string,Promise<T>>();
  return (id:string|undefined,source:DataSource):Promise<T>=>{
    const expected=resolve(id); // identity is always resolved before any network call
    if(source==='bundled')return Promise.resolve(expected);
    let pending=cache.get(expected.customerId);
    if(!pending){
      pending=Promise.resolve().then(()=>fetchRemote(expected.customerId)).then(remote=>({...expected,transactions:verifyCopy(expected,remote,revision,asOf)})).catch(error=>{cache.delete(expected.customerId);throw error;});
      cache.set(expected.customerId,pending);
    }
    return pending;
  };
}
