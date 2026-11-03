interface SparkProps {
  values: number[];
  /** Cor CSS, padrão var(--info). */
  color?: string;
  height?: number;
  label?: string;
}

/** Sparkline SVG com área, linha de referência e ponto final. */
export function Spark({ values, color = "var(--info)", height = 34, label }: SparkProps) {
  const w = 200;
  const h = height;
  if (values.length < 2) {
    return <div className="dim">sem histórico</div>;
  }
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => [(i / (n - 1)) * w, h - 2 - (v / max) * (h - 4)] as const);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[n - 1];
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ height }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <line className="grid-l" x1={0} x2={w} y1={h / 2} y2={h / 2} />
      <polygon className="area" fill={color} points={`0,${h} ${line} ${w},${h}`} />
      <polyline fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" points={line} />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}
