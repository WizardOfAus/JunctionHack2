import type { ReactNode } from 'react';
import KotiApp from '@/components/koti-app';
import { demoData } from '@/lib/server-data';
import { defaults, forecast } from '@/lib/finance';

// Keep the workspace mounted across routes so in-memory coaching and drafts survive.
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  let transactions;
  try { ({ transactions } = await demoData()); }
  catch (error) {
    console.error('Demo data unavailable:', error instanceof Error ? error.message : error);
    return <main role="alert" style={{ padding: '2rem', maxWidth: '36rem' }}><h1>The demo data is not available</h1><p>Koti could not load the demo account. Try again later.</p></main>;
  }
  return <><KotiApp initialForecast={forecast(transactions, defaults)} />{children}</>;
}
