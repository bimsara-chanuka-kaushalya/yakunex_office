'use client';

export interface RoleDatum {
  label: string;
  value: number;
}

export function RoleDistributionChart({ data }: { data: RoleDatum[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex h-64 w-full flex-col justify-center gap-3.5 py-2" role="img" aria-label="Users by role">
      {data.map((entry) => {
        const pct = Math.round((entry.value / max) * 100);
        return (
          <div key={entry.label} className="grid grid-cols-[140px_1fr_36px] items-center gap-3 text-xs">
            <span className="truncate font-medium text-muted" title={entry.label}>
              {entry.label}
            </span>
            <div className="h-4 w-full overflow-hidden rounded-r-md bg-canvas">
              <div
                className="h-full rounded-r-md bg-[#D5A52E] transition-all duration-300"
                style={{ width: `${entry.value > 0 ? Math.max(pct, 6) : 0}%` }}
              />
            </div>
            <span className="text-right font-semibold tabular-nums text-text">{entry.value}</span>
          </div>
        );
      })}
    </div>
  );
}
