import { COINS } from '@/lib/coins';

// Ring mark. Arc lengths encode the 30/15/15/10/10/10/10 split on r=40 (circumference 251.33).
export const ARCS = [
  { d: '70.40 180.93', o: 0 },
  { d: '32.70 218.63', o: -75.4 },
  { d: '32.70 218.63', o: -113.1 },
  { d: '20.13 231.19', o: -150.8 },
  { d: '20.13 231.19', o: -175.93 },
  { d: '20.13 231.19', o: -201.06 },
  { d: '20.13 231.19', o: -226.19 },
];

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <g fill="none" transform="rotate(-90 50 50)" stroke="var(--fg)" strokeWidth={10}>
        {ARCS.map((a, i) => <circle key={i} cx={50} cy={50} r={40} strokeDasharray={a.d} strokeDashoffset={a.o} />)}
      </g>
      <circle cx={50} cy={50} r={8} fill="var(--signal)" />
    </svg>
  );
}

export function Wordmark({ size = 24, mark = 28 }: { size?: number; mark?: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Mark size={mark} />
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, fontSize: size, lineHeight: 1, letterSpacing: '-0.03em' }}>diversifi</span>
    </span>
  );
}

export function TokenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx={50} cy={50} r={50} fill="#BFEFFF" />
      <circle cx={50} cy={50} r={30} fill="none" stroke="#0D0E10" strokeWidth={12} />
      <circle cx={50} cy={50} r={9} fill="#0D0E10" />
    </svg>
  );
}

export function DfiChip({ size = 16, className = 'chip' }: { size?: number; className?: string }) {
  return <span className={className} style={{ fontWeight: 600 }}><TokenIcon size={size} />DFiUSD</span>;
}

/** Static seven-coin bar at the target split, for diagrams. */
export function MiniBar({ height = 14, gap = 2, radius = 2, width }: { height?: number; gap?: number; radius?: number; width?: number }) {
  return (
    <span aria-hidden="true" className="minibar" style={{ height, gap, width, display: 'flex' }}>
      {COINS.map(c => <i key={c.t} style={{ flex: `${c.s} 1 0`, background: c.color, borderRadius: radius }} />)}
    </span>
  );
}

export function Ruler({ ticks = 21, style }: { ticks?: number; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className="ruler" style={style}>{Array.from({ length: ticks }, (_, i) => <i key={i} />)}</div>;
}

export function Crops() {
  return <><i aria-hidden="true" className="crop tl" /><i aria-hidden="true" className="crop tr" /><i aria-hidden="true" className="crop bl" /><i aria-hidden="true" className="crop br" /></>;
}
