import type { Metadata } from 'next';
import { workspaceRoutes } from '@/features/navigation/routes';

export const metadata: Metadata = { title: workspaceRoutes.learn.title };

// The shared layout renders the selected screen while retaining workspace state.
export default function Page() { return null; }
