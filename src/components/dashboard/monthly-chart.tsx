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
const GRID = "var(--color-border)";
const AXIS_TEXT = "var(--color-text-grey)";

// SVG 座標系の単位（CSS px ではなくビューポート内の論理単位）。see: DESIGN.md §8.4
const BAR_W = 48;
const BAR_GAP = 4;
const GROUP_W = BAR_W * 2 + BAR_GAP + 16;
const CHART_H = 160;
const PAD = { top: 16, right: 16, bottom: 32, left: 48 };
const AXIS_FONT = 10;
const DOT_R = 3;

const GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;

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
        <div className="space-y-l">
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

function summarize(values: number[], unit: string, formatter: (n: number) => string): string {
  const total = values.reduce((sum, v) => sum + v, 0);
  const max = Math.max(...values, 0);
  return `合計 ${formatter(total)}${unit}、最大 ${formatter(max)}${unit}`;
}

function CaseCountChart({ rows, labels }: { rows: MonthlyRow[]; labels: string[] }) {
  const maxVal = Math.max(...rows.flatMap((r) => [r.new_cases, r.completed_cases]), 1);
  const innerW = GROUP_W * rows.length;
  const totalW = innerW + PAD.left + PAD.right;
  const totalH = CHART_H + PAD.top + PAD.bottom;
  const scaleY = (v: number) => CHART_H - (v / maxVal) * CHART_H;

  const ariaLabel =
    `月次の新規案件数と完了案件数の棒グラフ。新規は${summarize(rows.map((r) => r.new_cases), "件", (n) => n.toLocaleString("ja-JP"))}、` +
    `完了は${summarize(rows.map((r) => r.completed_cases), "件", (n) => n.toLocaleString("ja-JP"))}。`;

  return (
    <div>
      <p className="mb-xs text-xs text-text-grey">件数</p>
      <div className="overflow-x-auto">
        <svg
          width={totalW}
          height={totalH}
          role="img"
          aria-label={ariaLabel}
          className="text-xs"
        >
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {GRID_RATIOS.map((ratio) => {
              const y = CHART_H - ratio * CHART_H;
              const val = Math.round(maxVal * ratio);
              return (
                <g key={ratio}>
                  <line x1={0} y1={y} x2={innerW} y2={y} stroke={GRID} strokeWidth={1} />
                  <text x={-6} y={y + 4} textAnchor="end" fontSize={AXIS_FONT} fill={AXIS_TEXT}>
                    {val}
                  </text>
                </g>
              );
            })}
            {rows.map((row, i) => {
              const x = i * GROUP_W;
              const newH = (row.new_cases / maxVal) * CHART_H;
              const compH = (row.completed_cases / maxVal) * CHART_H;
              return (
                <g key={row.year_month}>
                  <rect x={x} y={scaleY(row.new_cases)} width={BAR_W} height={newH} fill={CHART_1}>
                    <title>{`${labels[i]} 新規 ${row.new_cases.toLocaleString("ja-JP")}件`}</title>
                  </rect>
                  <rect
                    x={x + BAR_W + BAR_GAP}
                    y={scaleY(row.completed_cases)}
                    width={BAR_W}
                    height={compH}
                    fill={CHART_8}
                  >
                    <title>{`${labels[i]} 完了 ${row.completed_cases.toLocaleString("ja-JP")}件`}</title>
                  </rect>
                  <text
                    x={x + BAR_W + BAR_GAP / 2}
                    y={CHART_H + 18}
                    textAnchor="middle"
                    fontSize={AXIS_FONT}
                    fill={AXIS_TEXT}
                  >
                    {labels[i]}
                  </text>
                </g>
              );
            })}
            <line x1={0} y1={CHART_H} x2={innerW} y2={CHART_H} stroke={GRID} strokeWidth={1} />
          </g>
        </svg>
      </div>
    </div>
  );
}

function AmountChart({ rows, labels }: { rows: MonthlyRow[]; labels: string[] }) {
  const maxVal = Math.max(...rows.flatMap((r) => [r.invoice_amount, r.paid_amount]), 1);
  const innerW = GROUP_W * rows.length;
  const totalW = innerW + PAD.left + PAD.right;
  const totalH = CHART_H + PAD.top + PAD.bottom;
  const scaleY = (v: number) => CHART_H - (v / maxVal) * CHART_H;
  const cx = (i: number) => i * GROUP_W + BAR_W;

  const pointsOf = (arr: number[]) => arr.map((v, i) => `${cx(i)},${scaleY(v)}`).join(" ");

  const ariaLabel =
    `月次の請求額と入金額の折れ線グラフ。請求額は${summarize(rows.map((r) => r.invoice_amount), "円", formatYenAxis)}、` +
    `入金額は${summarize(rows.map((r) => r.paid_amount), "円", formatYenAxis)}。`;

  return (
    <div>
      <p className="mb-xs text-xs text-text-grey">金額（円）</p>
      <div className="overflow-x-auto">
        <svg
          width={totalW}
          height={totalH}
          role="img"
          aria-label={ariaLabel}
          className="text-xs"
        >
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {GRID_RATIOS.map((ratio) => {
              const y = CHART_H - ratio * CHART_H;
              const val = Math.round(maxVal * ratio);
              return (
                <g key={ratio}>
                  <line x1={0} y1={y} x2={innerW} y2={y} stroke={GRID} strokeWidth={1} />
                  <text x={-6} y={y + 4} textAnchor="end" fontSize={AXIS_FONT} fill={AXIS_TEXT}>
                    {formatYenAxis(val)}
                  </text>
                </g>
              );
            })}
            <polyline
              points={pointsOf(rows.map((r) => r.invoice_amount))}
              fill="none"
              stroke={CHART_2}
              strokeWidth={2}
            />
            <polyline
              points={pointsOf(rows.map((r) => r.paid_amount))}
              fill="none"
              stroke={CHART_3}
              strokeWidth={2}
              strokeDasharray="4 2"
            />
            {rows.map((row, i) => (
              <g key={row.year_month}>
                <circle cx={cx(i)} cy={scaleY(row.invoice_amount)} r={DOT_R} fill={CHART_2}>
                  <title>{`${labels[i]} 請求額 ${row.invoice_amount.toLocaleString("ja-JP")}円`}</title>
                </circle>
                <circle cx={cx(i)} cy={scaleY(row.paid_amount)} r={DOT_R} fill={CHART_3}>
                  <title>{`${labels[i]} 入金額 ${row.paid_amount.toLocaleString("ja-JP")}円`}</title>
                </circle>
                <text
                  x={cx(i)}
                  y={CHART_H + 18}
                  textAnchor="middle"
                  fontSize={AXIS_FONT}
                  fill={AXIS_TEXT}
                >
                  {labels[i]}
                </text>
              </g>
            ))}
            <line x1={0} y1={CHART_H} x2={innerW} y2={CHART_H} stroke={GRID} strokeWidth={1} />
          </g>
        </svg>
      </div>
    </div>
  );
}

function formatYenAxis(val: number): string {
  return val >= 10000 ? `${Math.floor(val / 10000)}万` : String(val);
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-xs">
      <svg width={20} height={10} aria-hidden="true">
        {dashed ? (
          <line x1={0} y1={5} x2={20} y2={5} stroke={color} strokeWidth={2} strokeDasharray="4 2" />
        ) : (
          <rect x={0} y={1} width={20} height={8} fill={color} />
        )}
      </svg>
      {label}
    </span>
  );
}
