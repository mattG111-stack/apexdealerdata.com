"use client";

/**
 * A car in its market: kilometres across, price up, one dot per comparable car.
 *
 * This exists because a dealer reads a picture faster than a table, and because
 * the number on its own hides the thing that matters — how tight the cloud is.
 * Twelve dots in a band tells you the price is solid; twelve scattered across
 * $20,000 tells you it isn't, and no single figure conveys that.
 *
 * Encoding, deliberately restrained — three variables, no more:
 *   position   kilometres and price
 *   fill       sold (solid) vs still listed (hollow)
 *   ring       carries a fitted extra (canopy / hard lid / tow bar)
 *   the target car is the green marker with a halo
 *
 * Extras are shown but never priced into the picture: measured across 2,630
 * utes, a canopy is worth about $600 and a tow bar nothing, so the ring is there
 * to explain a gap, not to claim a premium.
 *
 * Plain SVG rather than a charting library: it's a scatter with 20 points, and
 * a dependency would cost more than it saves.
 */

interface Point {
  kms: number;
  price: number;
  year?: number | null;
  variant?: string | null;
  sold?: boolean;
  extras?: number;
}

export function CompScatter({
  points, targetKms, targetPrice, valueMid,
}: {
  points: Point[];
  targetKms?: number | null;
  targetPrice?: number | null;
  valueMid?: number | null;
}) {
  const usable = points.filter((p) => p.kms > 0 && p.price > 0);
  if (usable.length < 2) return null;

  const W = 640, H = 300;
  const PAD = { t: 16, r: 16, b: 34, l: 62 };

  const allKms = [...usable.map((p) => p.kms), targetKms || 0].filter(Boolean);
  const allPrice = [
    ...usable.map((p) => p.price),
    targetPrice || 0, valueMid || 0,
  ].filter(Boolean);

  const kMin = Math.min(...allKms), kMax = Math.max(...allKms);
  const pMin = Math.min(...allPrice), pMax = Math.max(...allPrice);
  // Pad the ranges so nothing sits welded to an axis.
  const kPad = (kMax - kMin) * 0.08 || 1000;
  const pPad = (pMax - pMin) * 0.12 || 1000;

  const x = (v: number) =>
    PAD.l + ((v - (kMin - kPad)) / ((kMax + kPad) - (kMin - kPad))) * (W - PAD.l - PAD.r);
  const y = (v: number) =>
    H - PAD.b - ((v - (pMin - pPad)) / ((pMax + pPad) - (pMin - pPad))) * (H - PAD.t - PAD.b);

  const ticksY = 4, ticksX = 4;
  const yVals = Array.from({ length: ticksY + 1 }, (_, i) =>
    (pMin - pPad) + (i / ticksY) * ((pMax + pPad) - (pMin - pPad)));
  const xVals = Array.from({ length: ticksX + 1 }, (_, i) =>
    (kMin - kPad) + (i / ticksX) * ((kMax + kPad) - (kMin - kPad)));

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
           aria-label="Comparable cars by kilometres and price"
           style={{ display: "block", maxWidth: "100%" }}>
        {/* grid */}
        {yVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)}
                  stroke="#EEF2F7" strokeWidth={1} />
            <text x={PAD.l - 9} y={y(v) + 4} textAnchor="end"
                  fontSize={11} fill="#8894A6"
                  style={{ fontVariantNumeric: "tabular-nums" }}>
              ${Math.round(v / 1000)}k
            </text>
          </g>
        ))}
        {xVals.map((v, i) => (
          <text key={i} x={x(v)} y={H - 12} textAnchor="middle"
                fontSize={11} fill="#8894A6"
                style={{ fontVariantNumeric: "tabular-nums" }}>
            {Math.round(v / 1000)}k
          </text>
        ))}

        {/* what we say it's worth */}
        {valueMid != null && (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(valueMid)} y2={y(valueMid)}
                  stroke="#22C55E" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - PAD.r} y={y(valueMid) - 7} textAnchor="end"
                  fontSize={11} fontWeight={800} fill="#12805A">
              our read ${Math.round(valueMid).toLocaleString()}
            </text>
          </>
        )}

        {/* comps */}
        {usable.map((p, i) => (
          <circle
            key={i} cx={x(p.kms)} cy={y(p.price)} r={5}
            fill={p.sold ? "#5A6B82" : "#FFFFFF"}
            stroke={p.extras ? "#F59E0B" : "#5A6B82"}
            strokeWidth={p.extras ? 2 : 1.4}
            opacity={0.9}
          >
            <title>
              {`${p.year ?? ""} ${p.variant ?? ""} — $${Math.round(p.price).toLocaleString()}`
                + ` at ${Math.round(p.kms / 1000)}k km`
                + (p.sold ? " (sold)" : " (listed)")
                + (p.extras ? ` · ${p.extras} extra${p.extras > 1 ? "s" : ""}` : "")}
            </title>
          </circle>
        ))}

        {/* the car being priced */}
        {targetKms != null && targetPrice != null && (
          <>
            <circle cx={x(targetKms)} cy={y(targetPrice)} r={11}
                    fill="#22C55E" opacity={0.18} />
            <circle cx={x(targetKms)} cy={y(targetPrice)} r={6}
                    fill="#22C55E" stroke="#06210F" strokeWidth={1.5} />
          </>
        )}
      </svg>

      <figcaption style={{ display: "flex", gap: 16, flexWrap: "wrap",
                           marginTop: 8, fontSize: 12, color: "#7A8698" }}>
        <Key swatch={<span style={dot("#5A6B82", "#5A6B82")} />}>sold</Key>
        <Key swatch={<span style={dot("#FFFFFF", "#5A6B82")} />}>listed</Key>
        <Key swatch={<span style={dot("#FFFFFF", "#F59E0B")} />}>has extras</Key>
        {targetKms != null && (
          <Key swatch={<span style={dot("#22C55E", "#06210F")} />}>this car</Key>
        )}
        <span style={{ marginLeft: "auto" }}>kilometres →</span>
      </figcaption>
    </figure>
  );
}

function dot(fill: string, stroke: string): React.CSSProperties {
  return {
    display: "inline-block", width: 10, height: 10, borderRadius: 999,
    background: fill, border: `2px solid ${stroke}`, marginRight: 6,
    verticalAlign: "-1px",
  };
}

function Key({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return <span>{swatch}{children}</span>;
}
