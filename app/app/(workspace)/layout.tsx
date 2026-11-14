import type { ReactNode } from 'react';
import KotiApp from '@/components/koti-app';
import { transactions } from '@/lib/server-data';
import { defaults, forecast } from '@/lib/finance';

// Keep the workspace mounted across routes so in-memory coaching and drafts survive.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <><KotiApp initialForecast={forecast(transactions, defaults)} />{children}</>;
}
