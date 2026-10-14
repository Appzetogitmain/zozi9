import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { sliceColors, iconFor } from "./spinTheme";

const SIZE = 320;
const C = SIZE / 2;
const R = 148;

const polar = (angleDeg, radius) => {
  const rad = (angleDeg * Math.PI) / 180;
  return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
};

const slicePath = (start, end) => {
  const [x1, y1] = polar(start, R);
  const [x2, y2] = polar(end, R);
  const large = end - start > 180 ? 1 : 0;
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
};

// Up to two short lines so the label fits between the hub and the rim
const splitLabel = (label) => {
  const clean = String(label || "").trim();
  if (clean.length <= 9) return [clean];
  const words = clean.split(/\s+/);
  if (words.length >= 2) {
    let best = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i += 1) {
      const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    return [words.slice(0, best).join(" "), words.slice(best).join(" ")].map((l) =>
      l.length > 10 ? `${l.slice(0, 9)}…` : l,
    );
  }
  return [`${clean.slice(0, 9)}…`];
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Visual wheel only. It never decides the result: the parent passes the slice index that the
 * SERVER returned and the wheel animates to it.
 *
 * ref API:
 *   startWaiting()            - spin continuously while the request is in flight
 *   landOn(index, onDone)     - decelerate and stop on slice `index`, then call onDone
 *   stop()                    - stop immediately (request failed)
 */
const SpinWheel = forwardRef(function SpinWheel({ slices = [], disabled = false, onSpinClick }, ref) {
  const [angle, setAngle] = useState(0);
  const [transition, setTransition] = useState("none");
  const angleRef = useRef(0);
  const rafRef = useRef(null);
  const doneRef = useRef(null);
  const finishTimer = useRef(null);

  const count = slices.length;
  const seg = count > 0 ? 360 / count : 360;

  const colors = useMemo(() => slices.map((s, i) => sliceColors(s, i)), [slices]);

  const stopRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  useEffect(
    () => () => {
      stopRaf();
      clearTimeout(finishTimer.current);
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    startWaiting() {
      if (prefersReducedMotion()) return;
      stopRaf();
      setTransition("none");
      let last = performance.now();
      const tick = (now) => {
        const dt = now - last;
        last = now;
        angleRef.current += (360 / 1100) * dt; // one turn per ~1.1s
        setAngle(angleRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },

    stop() {
      stopRaf();
    },

    landOn(index, onDone) {
      stopRaf();
      clearTimeout(finishTimer.current);
      const reduced = prefersReducedMotion();
      const current = angleRef.current;
      // rotate so the centre of slice `index` ends up under the pointer (top).
      // The random offset only moves the needle inside the winning slice - purely cosmetic.
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      const wanted = -(index * seg) + jitter;
      const delta = (((wanted - current) % 360) + 360) % 360;
      const turns = reduced ? 1 : 5;
      const target = current + turns * 360 + delta;
      const duration = reduced ? 700 : 4600;

      doneRef.current = onDone || null;
      angleRef.current = target;
      setTransition("none");
      // two frames so the browser commits the starting angle before the transition begins
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransition(`transform ${duration}ms cubic-bezier(0.12, 0.7, 0.1, 1)`);
          setAngle(target);
        });
      });
      finishTimer.current = setTimeout(() => {
        doneRef.current?.();
        doneRef.current = null;
      }, duration + 120);
    },
  }));

  if (count < 2) return null;

  const baseSize = count > 8 ? 11 : count > 6 ? 12 : 13.5;
  const lines = slices.map((slice) => splitLabel(slice.label));
  // shrink long lines so they stay inside the ~68px band between hub and icon
  const fonts = lines.map((ls) => {
    const longest = Math.max(...ls.map((l) => l.length), 1);
    return Math.max(9, Math.min(baseSize, 68 / (longest * 0.62)));
  });

  return (
    <div className="relative mx-auto w-full max-w-[320px] aspect-square select-none">
      {/* pointer */}
      <div
        className="absolute left-1/2 -top-1 z-20 -translate-x-1/2 drop-shadow-[0_4px_6px_rgba(0,0,0,0.3)]"
        aria-hidden="true"
      >
        <svg width="34" height="40" viewBox="0 0 34 40">
          <path d="M17 38 L3 8 Q17 -4 31 8 Z" fill="var(--brand-900)" />
          <circle cx="17" cy="12" r="5" fill="#fff" />
        </svg>
      </div>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-full w-full"
        role="img"
        aria-label={`Prize wheel with ${count} rewards: ${slices.map((s) => s.label).join(", ")}`}
      >
        {/* rim */}
        <circle cx={C} cy={C} r={R + 10} fill="var(--brand-900)" />
        {Array.from({ length: 24 }).map((_, i) => {
          const [x, y] = polar((360 / 24) * i, R + 5);
          return <circle key={i} cx={x} cy={y} r="2.2" fill={i % 2 ? "#fff" : "var(--brand-200)"} />;
        })}

        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition,
            willChange: "transform",
          }}
        >
          {slices.map((slice, i) => {
            const center = -90 + i * seg;
            const start = center - seg / 2;
            const end = center + seg / 2;
            const { fill, text } = colors[i];
            return (
              <g key={slice.id}>
                <path d={slicePath(start, end)} fill={fill} stroke="#fff" strokeWidth="2" />
                <g transform={`rotate(${center} ${C} ${C})`}>
                  {lines[i].map((line, lineIndex) => (
                    <text
                      key={lineIndex}
                      x={C + R * 0.52}
                      y={C + (lineIndex - (lines[i].length - 1) / 2) * fonts[i] * 1.18}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={text}
                      fontSize={fonts[i]}
                      fontWeight="800"
                      style={{ fontFamily: "inherit" }}
                    >
                      {line}
                    </text>
                  ))}
                  <text
                    x={C + R * 0.86}
                    y={C}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={18}
                    transform={`rotate(90 ${C + R * 0.86} ${C})`}
                  >
                    {iconFor(slice)}
                  </text>
                </g>
              </g>
            );
          })}
        </g>

        {/* hub */}
        <circle cx={C} cy={C} r="38" fill="#fff" stroke="var(--brand-900)" strokeWidth="5" />
      </svg>

      <button
        type="button"
        onClick={onSpinClick}
        disabled={disabled}
        aria-label="Spin the wheel"
        className="absolute left-1/2 top-1/2 z-10 flex h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-[11px] font-black uppercase tracking-wider text-white shadow-lg transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-70"
      >
        Spin
      </button>
    </div>
  );
});

export default SpinWheel;
