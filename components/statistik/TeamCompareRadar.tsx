"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { RadarPoint } from "@/lib/statistik/team-compare";

/**
 * Lag-mot-lag-radar — samma normaliserade (z-score → 0–100) profil som
 * `TeamRadar`, men två lags serier överlagrade i stället för en mot ligasnittet.
 * Bara axlar båda lagen faktiskt har data för visas (ingen påhittad 50:a
 * för ett lag som saknar en metrik) — se `getTeamCompareRadar`.
 */
export function TeamCompareRadar({
  a,
  b,
  nameA,
  nameB,
  colorA,
  colorB,
}: {
  a: RadarPoint[];
  b: RadarPoint[];
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
}) {
  const bByMetric = new Map(b.map((p) => [p.metric, p]));
  const chartData = a
    .filter((p) => bByMetric.has(p.metric))
    .map((p) => {
      const other = bByMetric.get(p.metric)!;
      return { metric: p.metric, aValue: p.value, aRaw: p.raw, bValue: other.value, bRaw: other.raw };
    });

  if (chartData.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground text-center px-6">
        Ingen gemensam profildata för båda lagen ännu.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(_v, name, item) => {
            const row = (item as { payload?: (typeof chartData)[number] })?.payload;
            if (!row) return ["", ""];
            const isA = name === nameA;
            return [isA ? `${row.aRaw} (percentil ${row.aValue})` : `${row.bRaw} (percentil ${row.bValue})`, name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Radar name={nameA} dataKey="aValue" stroke={colorA} fill={colorA} fillOpacity={0.3} strokeWidth={2} />
        <Radar name={nameB} dataKey="bValue" stroke={colorB} fill={colorB} fillOpacity={0.3} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
