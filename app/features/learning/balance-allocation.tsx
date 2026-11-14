'use client';

import { useId, useState, type PointerEvent } from 'react';
import { euro } from '@/lib/finance';
import styles from './balance-lesson.module.css';

type Part = 'bills' | 'reserve' | 'free';

/** One explanation shared by the diagram and its three keyboard/touch controls. */
export function BalanceAllocation({ reserve, room }: { reserve: number; room: number }) {
  const [selected, setSelected] = useState<Part | null>(null);
  const [hovered, setHovered] = useState<Part | null>(null);
  const descriptionId = useId();
  const active = hovered ?? selected;
  const parts = [
    { id: 'bills' as const, label: 'Rent', amount: 60000, detail: 'Rent has a job already: €600 for a regular essential.' },
    { id: 'reserve' as const, label: 'Reserve', amount: reserve, detail: `${euro(reserve)} stays in the account for surprises. Protected, not spent.` },
    { id: 'free' as const, label: 'Room', amount: room, detail: room ? `${euro(room)} remains after rent and reserve. You choose what it is for.` : 'Nothing is left unassigned. Your reserve still belongs to you.' },
  ];
  const partAt = (event: PointerEvent<HTMLDivElement>) => {
    const part = (event.target as HTMLElement).dataset.part;
    return parts.find(item => item.id === part)?.id ?? null;
  };

  return <>
    <div className={styles.cells} role="img" aria-label={`100 squares, €10 each. Rent €600. Reserve ${euro(reserve)}. Room ${euro(room)}. Use the colour buttons below to explore.`}
      onPointerMove={event => { if (event.pointerType === 'mouse') setHovered(partAt(event)); }}
      onPointerLeave={() => setHovered(null)} onPointerDown={event => { const part = partAt(event); if (part) setSelected(part); }}>
      {Array.from({ length: 100 }, (_, i) => {
        const part: Part = i < 60 ? 'bills' : i < 60 + reserve / 1000 ? 'reserve' : 'free';
        return <span aria-hidden="true" key={i} data-part={part} className={`${styles[part]} ${active && active !== part ? styles.dimmedCell : ''}`}/>;
      })}
    </div>
    <div className={styles.legend} role="group" aria-label="Explore the balance diagram">
      {parts.map(part => <button type="button" key={part.id} aria-pressed={selected === part.id} aria-describedby={descriptionId}
        className={active === part.id ? styles.activePart : undefined}
        onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(part.id); }} onPointerLeave={() => setHovered(null)}
        onClick={() => { setHovered(null); setSelected(part.id); }}>
        <span><i className={styles[part.id]}/>{part.label}</span><strong>{euro(part.amount)}</strong>
      </button>)}
    </div>
    <p id={descriptionId} className={styles.unit}>{parts.find(part => part.id === active)?.detail ?? 'Each square is €10. Hover or select a colour to explore.'}</p>
  </>;
}
