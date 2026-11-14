import type { Forecast } from '../../lib/finance';

export function dateLabel(iso: string, year = false) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}

// The historical analysis period comes from the same server calculation as the totals.
export function analysisPeriod(f: Forecast) {
  return f.recentPeriod;
}

export function outlook(f: Forecast) {
  if (f.blocked) return { kind: 'paused', title: 'A clearer picture starts with your data.', detail: f.warnings[0] || 'Review account coverage before using the forecast.' } as const;
  const lowest = f.points.reduce<Forecast['points'][number] | undefined>((best, point) => !best || point.balanceCents < best.balanceCents ? point : best, undefined);
  if (f.minimumCents < f.protectedCents) return { kind: 'attention', title: 'Your reserve could come under pressure.', detail: `The forecast dips below your protected amount${lowest ? ` around ${dateLabel(lowest.date)}` : ''}. Review the timing before adding extra saving.` } as const;
  if (f.remainingCents <= 0) return { kind: 'steady', title: 'Your money already has a job.', detail: 'There is no extra room in this forecast after protection and any planned allocation. You can explore without committing to a change.' } as const;
  return { kind: 'steady', title: 'A little room for what comes next.', detail: `Your projected balance stays above your reserve over the next ${f.horizonDays} days. Explore the timing before choosing your next step.` } as const;
}
