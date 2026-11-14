import type { ReactNode } from 'react';
import KotiApp from '@/components/koti-app';
import { listPersonas } from '@/lib/personas';
import { demoData, DemoDataUnavailableError } from '@/lib/server-data';
import { CLOCK } from '@/lib/finance';
import { defaults, forecast } from '@/lib/finance';

// Keep the workspace mounted across routes so in-memory coaching and drafts survive.
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  try {
    const persona=await demoData();
    return <><KotiApp personas={listPersonas()} initialForecast={forecast(persona.transactions,defaults,CLOCK,persona.customerId)} />{children}</>;
  } catch(error) {
    if(!(error instanceof DemoDataUnavailableError))throw error;
    return <main className="main-content"><h1>The demo data is not available</h1><p>The configured data source could not load. Please try again.</p><a href="/money">Retry the demo</a></main>;
  }
}
