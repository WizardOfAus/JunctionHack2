'use client';

import type { ComponentProps } from 'react';
import { useRouter } from 'next/navigation';

/** Native link semantics, with the same router path used by in-app actions.
 * Vinext beta's production next/link dynamic import loses navigation exports.
 * Keep this local workaround until the framework's production Link is fixed.
 */
export default function WorkspaceLink({ href, onClick, target, download, ...props }: ComponentProps<'a'> & { href: string }) {
  const router = useRouter();
  return <a {...props} href={href} target={target} download={download} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (target && target !== '_self') || download !== undefined || !href.startsWith('/') || href.startsWith('//')) return;
    event.preventDefault();
    router.push(href);
  }}/>;
}
