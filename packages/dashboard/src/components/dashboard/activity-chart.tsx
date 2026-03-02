'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  type TooltipProps,
} from 'recharts';

const PURPLE      = '#8B5CF6';
const PURPLE_DIM  = '#6D28D930';
const BORDER      = '#1a1a1f';
const FG          = '#e4e4e7';
const MUTED       = '#52525b';
const BG          = '#0c0c0e';

interface ActivityChartProps {
  data: { day: string; count: number }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: BG,
      border: `1px solid ${BORDER}`,
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 12,
      color: FG,
    }}>
      <p style={{ color: MUTED, marginBottom: 4, fontSize: 11 }}>{label}</p>
      <p style={{ color: PURPLE, fontWeight: 600 }}>{payload[0].value} messages</p>
    </div>
  );
}

export function ActivityChart({ data, label = '7 days' }: ActivityChartProps) {
  const today = new Date().toISOString().slice(0, 10);

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    isToday: d.day === today,
  }));

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
        <h2 className="text-sm font-medium">Activity</h2>
        <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{label}</span>
      </div>
      <div className="p-4">
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={formatted}
              margin={{ top: 8, right: 4, left: -24, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="2 4" stroke={BORDER} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: MUTED }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: MUTED }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: PURPLE_DIM }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {formatted.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.count === 0 ? '#1a1a1f' : entry.isToday ? PURPLE : '#6D28D9'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
