"use client";

import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";

type MonthlyRow = {
  year_month: string;
  new_cases: number;
  completed_cases: number;
  invoice_amount: number;
  paid_amount: number;
};

const CHART_1 = "var(--color-chart-1)";
const CHART_2 = "var(--color-chart-2)";
const CHART_3 = "var(--color-chart-3)";
const CHART_8 = "var(--color-chart-8)";

const BAR_W = 48;
const BAR_GAP = 4;
const GROUP_W = BAR_W * 2 + BAR_GAP + 16;
const CHART_H = 160;
const PADDING = { top: 16, right: 16, bottom: 32, left: 48 };

export function MonthlyChart({ rows }: { rows: MonthlyRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>月次推移（過去12ヶ月）</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-s text-text-grey">データがありません。</p>
        </CardBody>
      </Card>
    );
  }

  const labels = rows.map((r) => {
    const [, m] = r.year_month.split("-");
    return `${m}月`;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>月次推移（過去12ヶ月）</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-[var(--space-l)]">
          <CaseCountChart rows={rows} labels={labels} />
          <AmountChart rows={rows} labels={labels} />
        </div>
        <div className="mt-m flex flex-wrap gap-l text-xs text-text-grey">
          <LegendItem color={CHART_1} label="新規案件数" />
          <LegendItem color={CHART_8} label="完了案件数" />
          <LegendItem color={CHART_2} label="請求額" dashed />
          <LegendItem color={CHART_3} label="入金額" dashed />
        </div>
      </CardBody>
    </Card>
  );
}

function CaseCountChart({ rows, labels }: { rows: MonthlyRow[]; labels: string[] }) {
  const maxVal = Math.max(...rows.flatMap((r) => [r.new_cases, r.completed_cases]), 1);
  const totalW = GROUP_W * rows.length + PADDING.left + PADDING.right;
  const totalH = CHART_H + PADDING.top + PADDING.bottom;
  const innerH = CHART_H;
  const scaleY = (v: number) => innerH - (v / maxVal) * innerH;

  return (
    <div>
      <p className="mb-xs text-xs text-text-grey">件数</p>
      <div className="overflow-x-auto">
        <svg width={totalW} height={totalH} className="text-xs">
          <g transform={`translate(${PADDING.left},${PADDING.top})`}>
            {/* Y grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = innerH - ratio * innerH;
              const val = Math.round(maxVal * ratio);
              return (
                <g key={ratio}>
                  <line x1={0} y1={y} x2={totalW - PADDING.left - PADDING.right} y2={y}
                    stroke="var(--color-border)" strokeWidth={1} />
                  <text x={-6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--color-text-grey)">
                    {val}
                  </text>
                </g>
              );
            })}
            {/* Bars */}
            {rows.map((row, i) => {
              const x = i * GROUP_W;
              const newH = (row.new_cases / maxVal) * innerH;
              const compH = (row.completed_cases / maxVal) * innerH;
              return (
                <g key={row.year_month}>
                  <rect x={x} y={scaleY(row.new_cases)} width={BAR_W} height={newH}
                    fill={CHART_1} opacity={0.85} />
                  <rect x={x + BAR_W + BAR_GAP} y={scaleY(row.completed_cases)} width={BAR_W} height={compH}
                    fill={CHART_8} opacity={0.85} />
                  <text x={x + BAR_W + BAR_GAP / 2} y={innerH + 18} textAnchor="middle"
                    fontSize={10} fill="var(--color-text-grey)">
                    {labels[i]}
                  </text>
                </g>
              );
            })}
            {/* X axis */}
            <line x1={0} y1={innerH} x2={totalW - PADDING.left - PADDING.right} y2={innerH}
              stroke="var(--color-border)" strokeWidth={1} />
          </g>
        </svg>
      </div>
    </div>
  );
}

function AmountChart({ rows, labels }: { rows: MonthlyRow[]; labels: string[] }) {
  const maxVal = Math.max(...rows.flatMap((r) => [r.invoice_amount, r.paid_amount]), 1);
  const totalW = GROUP_W * rows.length + PADDING.left + PADDING.right;
  const totalH = CHART_H + PADDING.top + PADDING.bottom;
  const innerH = CHART_H;
  const scaleY = (v: number) => innerH - (v / maxVal) * innerH;

  const pointsOf = (arr: number[]) =>
    arr
      .map((v, i) => `${i * GROUP_W + BAR_W},${scaleY(v)}`)
      .join(" ");

  return (
    <div>
      <p className="mb-xs text-xs text-text-grey">金額（円）</p>
      <div className="overflow-x-auto">
        <svg width={totalW} height={totalH} className="text-xs">
          <g transform={`translate(${PADDING.left},${PADDING.top})`}>
            {/* Y grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = innerH - ratio * innerH;
              const val = Math.round(maxVal * ratio);
              return (
                <g key={ratio}>
                  <line x1={0} y1={y} x2={totalW - PADDING.left - PADDING.right} y2={y}
                    stroke="var(--color-border)" strokeWidth={1} />
                  <text x={-6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--color-text-grey)">
                    {val >= 10000 ? `${Math.floor(val / 10000)}万` : String(val)}
                  </text>
                </g>
              );
            })}
            {/* Lines */}
            <polyline
              points={pointsOf(rows.map((r) => r.invoice_amount))}
              fill="none" stroke={CHART_2} strokeWidth={2} />
            <polyline
              points={pointsOf(rows.map((r) => r.paid_amount))}
              fill="none" stroke={CHART_3} strokeWidth={2} strokeDasharray="4 2" />
            {/* Dots */}
            {rows.map((row, i) => (
              <g key={row.year_month}>
                <circle cx={i * GROUP_W + BAR_W} cy={scaleY(row.invoice_amount)} r={3} fill={CHART_2} />
                <circle cx={i * GROUP_W + BAR_W} cy={scaleY(row.paid_amount)} r={3} fill={CHART_3} />
                <text x={i * GROUP_W + BAR_W} y={innerH + 18} textAnchor="middle"
                  fontSize={10} fill="var(--color-text-grey)">
                  {labels[i]}
                </text>
              </g>
            ))}
            {/* X axis */}
            <line x1={0} y1={innerH} x2={totalW - PADDING.left - PADDING.right} y2={innerH}
              stroke="var(--color-border)" strokeWidth={1} />
          </g>
        </svg>
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-xs">
      <svg width={20} height={10}>
        {dashed ? (
          <line x1={0} y1={5} x2={20} y2={5} stroke={color} strokeWidth={2} strokeDasharray="4 2" />
        ) : (
          <rect x={0} y={1} width={20} height={8} fill={color} opacity={0.85} />
        )}
      </svg>
      {label}
    </span>
  );
}
