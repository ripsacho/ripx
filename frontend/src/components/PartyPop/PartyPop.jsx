import React, { useEffect, useMemo, useState } from 'react';
import './PartyPop.css';

const LEFT_CANNON_PIECES = [
  { x: 100, y: -90, r: -40, d: 980, s: 1.05 },
  { x: 145, y: -130, r: -75, d: 1080, s: 1.15 },
  { x: 180, y: -85, r: -20, d: 920, s: 0.92 },
  { x: 215, y: -140, r: -62, d: 1140, s: 1.22 },
  { x: 250, y: -95, r: -10, d: 1000, s: 0.95 },
  { x: 130, y: -55, r: 5, d: 900, s: 0.88 },
  { x: 205, y: -55, r: -30, d: 940, s: 0.86 },
  { x: 165, y: -170, r: -95, d: 1210, s: 1.08 },
  { x: 270, y: -120, r: -35, d: 1180, s: 1.18 },
  { x: 245, y: -165, r: -90, d: 1280, s: 1.26 },
  { x: 120, y: -185, r: -110, d: 1250, s: 1.16 },
  { x: 300, y: -92, r: -25, d: 1120, s: 1.14 },
];

const RIGHT_CANNON_PIECES = [
  { x: -100, y: -90, r: 40, d: 980, s: 1.05 },
  { x: -145, y: -130, r: 75, d: 1080, s: 1.15 },
  { x: -180, y: -85, r: 20, d: 920, s: 0.92 },
  { x: -215, y: -140, r: 62, d: 1140, s: 1.22 },
  { x: -250, y: -95, r: 10, d: 1000, s: 0.95 },
  { x: -130, y: -55, r: -5, d: 900, s: 0.88 },
  { x: -205, y: -55, r: 30, d: 940, s: 0.86 },
  { x: -165, y: -170, r: 95, d: 1210, s: 1.08 },
  { x: -270, y: -120, r: 35, d: 1180, s: 1.18 },
  { x: -245, y: -165, r: 90, d: 1280, s: 1.26 },
  { x: -120, y: -185, r: 110, d: 1250, s: 1.16 },
  { x: -300, y: -92, r: 25, d: 1120, s: 1.14 },
];

const CENTER_SPARKS = [
  { x: -24, y: -86, r: -50, d: 720, s: 0.72 },
  { x: -6, y: -98, r: -15, d: 680, s: 0.66 },
  { x: 10, y: -90, r: 22, d: 690, s: 0.7 },
  { x: 28, y: -80, r: 48, d: 700, s: 0.74 },
  { x: -42, y: -72, r: -70, d: 760, s: 0.78 },
  { x: 44, y: -70, r: 66, d: 760, s: 0.78 },
  { x: 0, y: -110, r: 0, d: 780, s: 0.84 },
  { x: -18, y: -118, r: -20, d: 810, s: 0.86 },
  { x: 18, y: -118, r: 20, d: 810, s: 0.86 },
];

const STREAMERS = [
  { x: -320, y: -175, r: -130, d: 1520, s: 1.32 },
  { x: -250, y: -210, r: -118, d: 1480, s: 1.28 },
  { x: -195, y: -235, r: -108, d: 1600, s: 1.4 },
  { x: -145, y: -250, r: -98, d: 1540, s: 1.34 },
  { x: 145, y: -250, r: 98, d: 1540, s: 1.34 },
  { x: 195, y: -235, r: 108, d: 1600, s: 1.4 },
  { x: 250, y: -210, r: 118, d: 1480, s: 1.28 },
  { x: 320, y: -175, r: 130, d: 1520, s: 1.32 },
];

const TOP_RAIN = [
  { x: -360, y: 245, r: 180, d: 1700, s: 1.12 },
  { x: -300, y: 260, r: 150, d: 1780, s: 1.08 },
  { x: -240, y: 235, r: 130, d: 1650, s: 1.05 },
  { x: -170, y: 255, r: 118, d: 1740, s: 1.1 },
  { x: -110, y: 235, r: 106, d: 1680, s: 1.02 },
  { x: -55, y: 260, r: 98, d: 1820, s: 1.08 },
  { x: 0, y: 240, r: 92, d: 1760, s: 1.04 },
  { x: 55, y: 260, r: 82, d: 1830, s: 1.08 },
  { x: 110, y: 235, r: 72, d: 1700, s: 1.03 },
  { x: 170, y: 255, r: 58, d: 1760, s: 1.1 },
  { x: 240, y: 235, r: 45, d: 1660, s: 1.06 },
  { x: 300, y: 260, r: 32, d: 1780, s: 1.09 },
  { x: 360, y: 245, r: 18, d: 1700, s: 1.12 },
];

const COMETS = [
  { x: -410, y: -240, r: -24, d: 1220, s: 1.08 },
  { x: -290, y: -290, r: -8, d: 1320, s: 1.02 },
  { x: 0, y: -335, r: 0, d: 1160, s: 1.14 },
  { x: 290, y: -290, r: 8, d: 1320, s: 1.02 },
  { x: 410, y: -240, r: 24, d: 1220, s: 1.08 },
];

const RAYS = [
  { x: 0, y: -240, r: 0, d: 700, s: 1 },
  { x: 120, y: -225, r: 22, d: 740, s: 1 },
  { x: 205, y: -188, r: 40, d: 780, s: 0.96 },
  { x: 250, y: -120, r: 62, d: 820, s: 0.94 },
  { x: -120, y: -225, r: -22, d: 740, s: 1 },
  { x: -205, y: -188, r: -40, d: 780, s: 0.96 },
  { x: -250, y: -120, r: -62, d: 820, s: 0.94 },
];

const TWINKLES = [
  { x: -230, y: -210, r: -20, d: 920, s: 1.02 },
  { x: -160, y: -265, r: -5, d: 990, s: 0.95 },
  { x: -62, y: -238, r: 12, d: 940, s: 1.08 },
  { x: 0, y: -280, r: 0, d: 970, s: 1.14 },
  { x: 66, y: -238, r: -12, d: 940, s: 1.08 },
  { x: 164, y: -265, r: 5, d: 990, s: 0.95 },
  { x: 233, y: -210, r: 20, d: 920, s: 1.02 },
];

const FIREWORKS = [
  { x: 23, y: 31, s: 0.9, d: 120 },
  { x: 77, y: 31, s: 0.94, d: 210 },
  { x: 50, y: 22, s: 1.02, d: 300 },
];

const ORBITS = [
  { x: -170, y: -145, r: -42, d: 980, s: 1.02 },
  { x: 0, y: -188, r: 0, d: 920, s: 1.08 },
  { x: 170, y: -145, r: 42, d: 980, s: 1.02 },
];

function varyPieces(arr, seed, magnitude = 1) {
  return arr.map((p, idx) => {
    const t = seed * 0.001 + idx * 1.67;
    const wobbleX = Math.sin(t) * 18 * magnitude;
    const wobbleY = Math.cos(t * 1.12) * 12 * magnitude;
    const wobbleR = Math.sin(t * 0.9) * 8 * magnitude;
    const wobbleD = Math.round(Math.abs(Math.cos(t * 0.77)) * 120 * magnitude);
    return {
      ...p,
      x: p.x + wobbleX,
      y: p.y + wobbleY,
      r: p.r + wobbleR,
      d: p.d + wobbleD,
    };
  });
}

function PartyPop({
  active,
  onComplete,
  duration,
  variant = 'full',
  palette = 'rainbow',
  styleMode = 'dynamic',
}) {
  const isSubtle = variant === 'subtle';
  const isUltra = variant === 'ultra';
  const isCinematic = styleMode === 'cinematic';
  const [burstSeed, setBurstSeed] = useState(1);
  const resolvedDuration =
    duration || (isSubtle ? (isCinematic ? 1200 : 900) : isUltra ? 2550 : 1950);
  const ultraBoost = isUltra
    ? arr =>
        arr.concat(
          arr.map((p, idx) => ({
            ...p,
            x: p.x * 1.12 + (idx % 2 === 0 ? 26 : -26),
            y: p.y * 1.08,
            d: p.d + 260 + idx * 12,
            s: (p.s || 1) * 1.18,
          }))
        )
    : arr => arr;
  const withMotion = (arr, seed, magnitude = 1) =>
    isCinematic ? arr : varyPieces(arr, seed, magnitude);
  const leftPieces = useMemo(
    () =>
      withMotion(
        isSubtle
          ? LEFT_CANNON_PIECES.slice(0, isCinematic ? 3 : 4)
          : ultraBoost(LEFT_CANNON_PIECES).slice(0, isCinematic ? 9 : undefined),
        burstSeed,
        isSubtle ? 0.45 : isUltra ? 1.25 : 1
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const rightPieces = useMemo(
    () =>
      withMotion(
        isSubtle
          ? RIGHT_CANNON_PIECES.slice(0, isCinematic ? 3 : 4)
          : ultraBoost(RIGHT_CANNON_PIECES).slice(0, isCinematic ? 9 : undefined),
        burstSeed + 17,
        isSubtle ? 0.45 : isUltra ? 1.25 : 1
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const sparks = useMemo(
    () =>
      withMotion(
        isSubtle
          ? CENTER_SPARKS.slice(0, 2)
          : ultraBoost(CENTER_SPARKS).slice(0, isCinematic ? 5 : undefined),
        burstSeed + 33,
        isSubtle ? 0.5 : isUltra ? 1.35 : 1
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const streamers = useMemo(
    () =>
      withMotion(
        isSubtle ? [] : isCinematic ? ultraBoost(STREAMERS).slice(0, 3) : ultraBoost(STREAMERS),
        burstSeed + 49,
        isUltra ? 1.2 : 0.95
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const topRain = useMemo(
    () =>
      withMotion(
        isSubtle ? [] : isCinematic ? ultraBoost(TOP_RAIN).slice(0, 6) : ultraBoost(TOP_RAIN),
        burstSeed + 65,
        isUltra ? 1.2 : 0.95
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const comets = useMemo(
    () =>
      withMotion(
        isSubtle ? [] : isCinematic ? ultraBoost(COMETS).slice(0, 2) : ultraBoost(COMETS),
        burstSeed + 81,
        isUltra ? 1.32 : 1.05
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const rays = useMemo(
    () =>
      withMotion(
        isSubtle ? RAYS.slice(0, 2) : isCinematic ? ultraBoost(RAYS).slice(0, 4) : ultraBoost(RAYS),
        burstSeed + 97,
        isSubtle ? 0.68 : isUltra ? 1.35 : 1.08
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const twinkles = useMemo(
    () =>
      withMotion(
        isSubtle
          ? TWINKLES.slice(1, 4)
          : isCinematic
            ? ultraBoost(TWINKLES).slice(0, 4)
            : ultraBoost(TWINKLES),
        burstSeed + 113,
        isSubtle ? 0.62 : isUltra ? 1.3 : 1
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const orbits = useMemo(
    () =>
      withMotion(
        isSubtle ? ORBITS.slice(0, isCinematic ? 1 : 2) : isUltra ? ORBITS.concat(ORBITS) : ORBITS,
        burstSeed + 129,
        isSubtle ? 0.55 : isUltra ? 1.35 : 1
      ),
    [burstSeed, isSubtle, isUltra, isCinematic]
  );
  const fireworks = useMemo(
    () => (isUltra ? (isCinematic ? FIREWORKS.slice(0, 2) : FIREWORKS) : []),
    [isUltra, isCinematic]
  );

  useEffect(() => {
    if (!active) return undefined;
    setBurstSeed(Date.now());
    const timer = setTimeout(() => {
      if (typeof onComplete === 'function') onComplete();
    }, resolvedDuration);
    return () => clearTimeout(timer);
  }, [active, onComplete, resolvedDuration]);

  if (!active) return null;

  return (
    <div
      className={`party-pop-overlay party-pop-overlay-${isSubtle ? 'subtle' : isUltra ? 'ultra' : 'full'} party-pop-style-${isCinematic ? 'cinematic' : 'dynamic'} party-pop-overlay-${palette === 'brand' ? 'brand' : 'rainbow'}`}
      aria-hidden
    >
      <div className="party-pop-backdrop" />
      <div className="party-pop-lens-flare" />
      <div className="party-pop-glow" />
      <div className="party-pop-aura party-pop-aura-left" />
      <div className="party-pop-aura party-pop-aura-right" />
      <div className="party-pop-ring" />
      <div className="party-pop-ring party-pop-ring-secondary" />
      <div className="party-pop-ring party-pop-ring-tertiary" />
      {isUltra ? <div className="party-pop-ring party-pop-ring-quaternary" /> : null}
      <div className="party-pop-burst">🎉</div>
      <div className="party-pop-burst party-pop-burst-secondary">🥳</div>
      <div className="party-pop-burst party-pop-burst-tertiary">✨</div>
      {isUltra ? <div className="party-pop-burst party-pop-burst-ultra">🚀</div> : null}
      {orbits.map((p, idx) => (
        <span
          key={`orbit-${p.x}-${p.y}-${idx}`}
          className="party-pop-orbit"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
      {fireworks.length > 0
        ? fireworks.map((f, idx) => (
            <svg
              key={`firework-${idx}`}
              className="party-pop-firework"
              viewBox="0 0 100 100"
              style={{
                '--party-fw-x': `${f.x}%`,
                '--party-fw-y': `${f.y}%`,
                '--party-fw-s': f.s,
                '--party-fw-d': `${f.d}ms`,
              }}
              aria-hidden
            >
              <g>
                <circle className="party-pop-firework-core" cx="50" cy="50" r="5" />
                <path className="party-pop-firework-ray" d="M50 50 L50 10" />
                <path className="party-pop-firework-ray" d="M50 50 L84 18" />
                <path className="party-pop-firework-ray" d="M50 50 L92 50" />
                <path className="party-pop-firework-ray" d="M50 50 L84 82" />
                <path className="party-pop-firework-ray" d="M50 50 L50 92" />
                <path className="party-pop-firework-ray" d="M50 50 L16 82" />
                <path className="party-pop-firework-ray" d="M50 50 L8 50" />
                <path className="party-pop-firework-ray" d="M50 50 L16 18" />
              </g>
              <path className="party-pop-firework-trail" d="M50 98 Q46 84 49 70 Q52 58 50 50" />
            </svg>
          ))
        : null}
      {rays.map((p, idx) => (
        <span
          key={`ray-${p.x}-${p.y}-${idx}`}
          className="party-pop-ray"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
      {comets.map((p, idx) => (
        <span
          key={`comet-${p.x}-${p.y}-${idx}`}
          className="party-pop-piece party-pop-comet"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
      {leftPieces.map((p, idx) => (
        <span
          key={`left-${p.x}-${p.y}-${idx}`}
          className="party-pop-piece"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
      {rightPieces.map((p, idx) => (
        <span
          key={`right-${p.x}-${p.y}-${idx}`}
          className="party-pop-piece"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
      {streamers.map((p, idx) => (
        <span
          key={`streamer-${p.x}-${p.y}-${idx}`}
          className="party-pop-piece party-pop-streamer"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
      {topRain.map((p, idx) => (
        <span
          key={`rain-${p.x}-${p.y}-${idx}`}
          className="party-pop-piece party-pop-rain"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
      {sparks.map((p, idx) => (
        <span
          key={`spark-${p.x}-${p.y}-${idx}`}
          className="party-pop-piece party-pop-spark"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
      {twinkles.map((p, idx) => (
        <span
          key={`twinkle-${p.x}-${p.y}-${idx}`}
          className="party-pop-piece party-pop-twinkle"
          style={{
            '--party-x': `${p.x}px`,
            '--party-y': `${p.y}px`,
            '--party-r': `${p.r}deg`,
            '--party-d': `${p.d}ms`,
            '--party-s': p.s,
          }}
        />
      ))}
    </div>
  );
}

export default PartyPop;
