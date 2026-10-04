import React from "react";

import { type ArtColors, type ArtStatus, US, artSvgStyle, useArtColors } from "./artColors";
import { arc, fmt, pt, round1, type Point } from "./geometry";

export interface HipInput {
  /** Угол костной крыши α, градусы. */
  alpha: number | null;
  /** Угол хрящевой крыши β, градусы. */
  beta: number | null;
  status: ArtStatus;
  /** Тип сустава по Графу: «Ia», «IIa»… */
  type?: string | null;
}

export interface HipUltrasoundProps {
  left: HipInput;
  right: HipInput;
}

/** Сектор датчика: вершина над снимком, раскрыв 62°…118°. */
const AP: Point = [70, -30];
const RAD = 140;
const A0 = (62 * Math.PI) / 180;
const A1 = (118 * Math.PI) / 180;
const S0: Point = [AP[0] + RAD * Math.cos(A0), AP[1] + RAD * Math.sin(A0)];
const S1: Point = [AP[0] + RAD * Math.cos(A1), AP[1] + RAD * Math.sin(A1)];
const SECTOR = `M${pt(AP)} L${pt(S0)} A${RAD} ${RAD} 0 0 1 ${pt(S1)} Z`;

/** Нижний край подвздошной кости — вершина угла α. */
const PX = 50;
const PY = 82;

/** Снимок одного сустава по Графу: подвздошная кость, костная и хрящевая крыши, головка бедра. */
function hipImage(
  id: string,
  seed: number,
  x: number,
  side: "L" | "R",
  input: HipInput,
  c: ArtColors,
): React.ReactNode {
  const mir = side === "L";
  const transform = mir ? `translate(${x + 140},0) scale(-1,1)` : `translate(${x},0)`;
  const page = (p: Point): Point => [mir ? x + 140 - p[0] : x + p[0], p[1]];

  if (input.alpha == null) {
    return (
      <>
        <g transform={transform}>
          <path d={SECTOR} fill={US.bg} stroke={c.ruleStrong} strokeWidth={1} />
        </g>
        <text x={x + 70} y={58} textAnchor="middle" fill={US.mid} fontSize={10}>
          нет данных
        </text>
      </>
    );
  }

  const { alpha, beta } = input;
  const col = US[input.status];
  const ar = (alpha * Math.PI) / 180;
  const dir: Point = [Math.sin(ar), -Math.cos(ar)];
  const R: Point = [PX + dir[0] * 30, PY + dir[1] * 30];
  const head: Point = alpha >= 60 ? [PX + 20, PY + 7] : [PX + 22, PY + 10];
  const aDir = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  const am = (((aDir - 90) / 2) * Math.PI) / 180;
  const ta = page([PX + 20 * Math.cos(am), PY + 20 * Math.sin(am)]);

  // хрящевая крыша: от пересечения с базовой линией (Q) через край (R) к лимбусу (Lb)
  let cartilage: { d: Point; Q: Point; Lb: Point; tb: Point; beta: number } | null = null;
  if (beta != null && beta > 0) {
    const br = (beta * Math.PI) / 180;
    const d: Point = [Math.sin(br), Math.cos(br)];
    const Q: Point = [PX, R[1] + ((PX - R[0]) / d[0]) * d[1]];
    const Lb: Point = [R[0] + d[0] * 24, R[1] + d[1] * 24];
    const bm = (((180 - beta) / 2) * Math.PI) / 180;
    cartilage = { d, Q, Lb, tb: page([PX + 19 * Math.cos(bm), Q[1] + 19 * Math.sin(bm)]), beta };
  }

  return (
    <>
      <defs>
        <clipPath id={`${id}c`}>
          <path d={SECTOR} />
        </clipPath>
        <filter id={`${id}n`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={seed} />
          <feColorMatrix values="0 0 0 0 .9  0 0 0 0 .95  0 0 0 0 .96  0 0 0 .9 -.25" />
        </filter>
        <radialGradient id={`${id}v`} cx={70} cy={40} r={100} gradientUnits="userSpaceOnUse">
          <stop offset={0.55} stopColor="#000" stopOpacity={0} />
          <stop offset={1} stopColor="#000" stopOpacity={0.75} />
        </radialGradient>
      </defs>
      <g transform={transform}>
        <g clipPath={`url(#${id}c)`}>
          <rect x={-40} y={-40} width={220} height={190} fill={US.bg} />
          <rect x={-40} y={-40} width={220} height={190} filter={`url(#${id}n)`} opacity={0.42} />
          <path d="M-20 12 C40 6 100 6 160 12" fill="none" stroke={US.mid} strokeWidth={3} opacity={0.5} />
          <path d="M-20 20 C40 15 100 15 160 21" fill="none" stroke={US.mid} strokeWidth={1.5} opacity={0.35} />
          <path d={`M${PX - 6} 6 L${PX - 6} ${PY}`} fill="none" stroke="#000" strokeWidth={8} opacity={0.35} />
          <path d={`M${PX} 6 L${PX} ${PY}`} fill="none" stroke={US.echo} strokeWidth={3.2} />
          <path
            d={`M${PX} ${PY} Q${round1((PX + R[0]) / 2)} ${round1((PY + R[1]) / 2 + 4)} ${pt(R)}`}
            fill="none"
            stroke={US.echo}
            strokeWidth={2.6}
          />
          {cartilage && (
            <path
              d={`M${pt(R)} Q${round1(R[0] + 10)} ${round1(R[1] + 4)} ${pt(cartilage.Lb)}`}
              fill="none"
              stroke={US.mid}
              strokeWidth={2}
            />
          )}
          <circle
            cx={head[0]}
            cy={head[1]}
            r={17}
            fill="#05080a"
            stroke="#9fb1b4"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
          <circle cx={head[0]} cy={head[1]} r={17} filter={`url(#${id}n)`} opacity={0.18} />
          <rect x={-40} y={-40} width={220} height={190} fill={`url(#${id}v)`} />
        </g>
        <path d={SECTOR} fill="none" stroke={c.ruleStrong} strokeWidth={1} />
        <line x1={PX} y1={0} x2={PX} y2={108} stroke={US.echo} strokeWidth={0.9} strokeDasharray="3 2" opacity={0.85} />
        <line
          x1={PX}
          y1={PY}
          x2={round1(PX + dir[0] * 44)}
          y2={round1(PY + dir[1] * 44)}
          stroke={col}
          strokeWidth={1.6}
        />
        {cartilage && (
          <line
            x1={round1(cartilage.Q[0])}
            y1={round1(cartilage.Q[1])}
            x2={round1(cartilage.Lb[0] + cartilage.d[0] * 6)}
            y2={round1(cartilage.Lb[1] + cartilage.d[1] * 6)}
            stroke={US.mid}
            strokeWidth={1.1}
          />
        )}
        <path d={arc(PX, PY, 13, aDir, -90)} stroke={col} fill="none" strokeWidth={1.4} />
        {cartilage && (
          <path
            d={arc(PX, cartilage.Q[1], 12, 90 - cartilage.beta, 90)}
            stroke={US.mid}
            fill="none"
            strokeWidth={1.1}
          />
        )}
      </g>
      <text x={round1(ta[0])} y={round1(ta[1] + 3)} textAnchor="middle" fill={col} fontSize={10} fontWeight={600}>
        α
      </text>
      {cartilage && (
        <text
          x={round1(cartilage.tb[0])}
          y={round1(cartilage.tb[1] + 3)}
          textAnchor="middle"
          fill={US.mid}
          fontSize={10}
          fontWeight={500}
        >
          β
        </text>
      )}
    </>
  );
}

const angle = (v: number | null): string => (v != null ? `${fmt(v)}°` : "—");

const hipText = (h: HipInput): string =>
  h.alpha == null && h.beta == null
    ? `${h.type ? `${h.type}, ` : ""}нет данных`
    : `${h.type ? `${h.type}, ` : ""}α ${angle(h.alpha)}, β ${angle(h.beta)}`;

/**
 * УЗИ тазобедренных суставов по Графу: два снимка, левый — зеркально. Снимок
 * всегда тёмный; линия и дуга α — цветом оценки, хрящевая крыша и β — серым.
 */
export const HipUltrasound: React.FC<HipUltrasoundProps> = ({ left, right }) => {
  const c = useArtColors();
  const id = React.useId().replace(/:/g, "");
  const caption = (x: number, side: string, h: HipInput) => (
    <>
      <text x={x} y={125} textAnchor="middle" fill={c.muted} fontSize={10.5}>
        {h.type ? `${side} · ${h.type}` : side}
      </text>
      {(h.alpha != null || h.beta != null) && (
        <text x={x} y={137} textAnchor="middle" fill={c.ink} fontSize={10.5} fontWeight={500}>
          {`α ${angle(h.alpha)} · β ${angle(h.beta)}`}
        </text>
      )}
    </>
  );

  return (
    <svg
      viewBox="0 0 296 140"
      role="img"
      aria-label={`УЗИ тазобедренных суставов по Графу: левый — ${hipText(left)}; правый — ${hipText(right)}`}
      style={artSvgStyle}
    >
      {hipImage(`${id}L`, 7, 4, "L", left, c)}
      {hipImage(`${id}R`, 14, 152, "R", right, c)}
      {caption(74, "Левый", left)}
      {caption(222, "Правый", right)}
    </svg>
  );
};
