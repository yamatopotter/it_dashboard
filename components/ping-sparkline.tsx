"use client";

interface Props {
  data: (number | null)[];
  color?: string;
  /** unique suffix to avoid gradient ID collisions across cards */
  uid: string;
}

export function PingSparkline({ data, color = "var(--success)", uid }: Props) {
  const vals = data.filter((v): v is number => v !== null);
  if (vals.length < 3) return null;

  const W = 120;
  const H = 44;
  const PAD = 3;

  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  const pts = vals.map((v, i) => ({
    x: PAD + (i / (vals.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (v - minV) / range) * (H - PAD * 2),
  }));

  // Smooth cubic bezier path
  let linePath = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = (prev.x + curr.x) / 2;
    linePath += ` C ${cpx.toFixed(2)} ${prev.y.toFixed(2)}, ${cpx.toFixed(2)} ${curr.y.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
  }

  const last = pts[pts.length - 1];
  const first = pts[0];
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${H} L ${first.x.toFixed(2)} ${H} Z`;

  const gradId = `psg-${uid}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Current value dot */}
      <circle cx={last.x.toFixed(2)} cy={last.y.toFixed(2)} r="2.5"
        fill={color} />
    </svg>
  );
}
