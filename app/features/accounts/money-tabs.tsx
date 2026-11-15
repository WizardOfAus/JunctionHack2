// Money sub-navigation: the overview and the accounts statement.
import Link from 'next/link';
import styles from './accounts.module.css';

export function MoneyTabs({ active }: { active: 'today' | 'accounts' }) {
  return <nav className={styles.tabs} aria-label="Money">
    <Link href="/money" aria-current={active === 'today' ? 'page' : undefined}>Overview</Link>
    <Link href="/accounts" aria-current={active === 'accounts' ? 'page' : undefined}>Accounts</Link>
  </nav>;
}
