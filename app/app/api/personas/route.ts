import { listPersonas } from '@/lib/personas';
import { DEFAULT_PERSONA_ID } from '@/lib/contracts';
export async function GET(){return Response.json({defaultId:DEFAULT_PERSONA_ID,personas:listPersonas()});}
