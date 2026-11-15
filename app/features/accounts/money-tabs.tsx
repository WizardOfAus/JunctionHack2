// Money sub-navigation: the overview and the accounts statement.
// WorkspaceLink works around Vinext's production next/link navigation bug.
import Link from '@/features/navigation/workspace-link';
import styles from './accounts.module.css';

export function MoneyTabs({ active }: { active: 'today' | 'accounts' }) {
  return <nav className={styles.tabs} aria-label="Money">
    <Link href="/money" aria-current={active === 'today' ? 'page' : undefined}>Overview</Link>
    <Link href="/accounts" aria-current={active === 'accounts' ? 'page' : undefined}>Accounts</Link>
  </nav>;
}
