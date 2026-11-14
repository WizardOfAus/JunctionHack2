export const workspaceRoutes = {
  today: { href: '/money', title: 'Money overview · Koti' },
  learn: { href: '/learn', title: 'Your learning · Koti' },
  coach: { href: '/coach', title: 'Money coach · Koti' },
  plan: { href: '/plan', title: 'Your plan · Koti' },
} as const;

export type WorkspaceTab = keyof typeof workspaceRoutes;

export function tabForPath(pathname: string): WorkspaceTab {
  const path = pathname.replace(/\/$/, '');
  return (Object.keys(workspaceRoutes) as WorkspaceTab[])
    .find(tab => workspaceRoutes[tab].href === path) ?? 'today';
}
