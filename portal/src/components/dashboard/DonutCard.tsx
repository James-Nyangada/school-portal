import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export interface DonutDatum {
  label: string;
  value: number;
  color: string; // hex
}

interface DonutCardProps {
  title: string;
  subtitle?: string;
  data: DonutDatum[];
}

export function DonutCard({ title, subtitle, data }: DonutCardProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-full flex flex-col">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>

      <div className="h-48 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="60%"
              outerRadius="90%"
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="none" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — always BELOW the chart, never overlapping it */}
      <ul className="mt-4 grid grid-cols-2 gap-y-2 gap-x-4">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-gray-600">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: d.color }}
              />
              {d.label}
            </span>
            <span className="text-gray-400 text-xs">
              {d.value} · {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
