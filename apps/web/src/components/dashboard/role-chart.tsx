'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface RoleDatum {
  label: string;
  value: number;
}

const BRAND_GOLD = '#D5A52E';

export function RoleDistributionChart({ data }: { data: RoleDatum[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Users by role">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
          <CartesianGrid horizontal={false} stroke="#E4E6EA" strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} tick={{ fill: '#737780', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tick={{ fill: '#737780', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(213, 165, 46, 0.08)' }}
            contentStyle={{
              background: 'rgb(var(--surface))',
              border: '1px solid rgb(var(--border))',
              borderRadius: 12,
              fontSize: 12,
              color: 'rgb(var(--text))',
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={BRAND_GOLD} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
