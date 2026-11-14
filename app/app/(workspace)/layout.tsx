import type { ReactNode } from 'react';
import KotiApp from '@/components/koti-app';
import { listPersonas, resolvePersona } from '@/lib/personas';
import { CLOCK } from '@/lib/finance';
import { defaults, forecast } from '@/lib/finance';

// Keep the workspace mounted across routes so in-memory coaching and drafts survive.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <><KotiApp personas={listPersonas()} initialForecast={forecast(resolvePersona().transactions, defaults, CLOCK, resolvePersona().customerId)} />{children}</>;
}
