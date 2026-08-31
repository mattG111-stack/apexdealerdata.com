"use client";

interface Props {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
}

export default function Sparkline({
  values,
  width = 200,
  height = 50,
  color = "#2E7DF6",
  showDots = true,
}: Props) {
  const clean = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (clean.length === 0) {
    return <div className="text-xs text-faint">No data</div>;
  }
  if (clean.length === 1) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="block">
        <circle cx={width / 2} cy={height / 2} r="4" fill={color} />
      </svg>
    );
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const dx = width / (clean.length - 1);

  const pts = clean.map((v, i) => {
    const x = i * dx;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fill = `${path} L${pts[pts.length - 1][0].toFixed(1)},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={fill} fill={`${color}15`} />
      <path d={path} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {showDots &&
        pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill={i === pts.length - 1 ? color : "#fff"} stroke={color} strokeWidth="1.5" />
        ))}
    </svg>
  );
}
