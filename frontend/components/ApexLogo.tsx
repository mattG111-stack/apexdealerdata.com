/**
 * Apex mark — a chevron peak, in the green from apex-design.html.
 *
 * Placeholder for real brand assets. Kept deliberately simple so it can be
 * swapped for a designed mark without touching any page that uses it.
 */

export function ApexMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#22C55E" />
      <path
        d="M9 22 L16 10 L23 22"
        stroke="#06210F"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ApexLogo({ size = 36 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <ApexMark size={size} />
      <span
        style={{
          fontWeight: 800,
          fontSize: size * 0.55,
          letterSpacing: "-.04em",
          lineHeight: 1,
        }}
      >
        apex
      </span>
    </span>
  );
}
