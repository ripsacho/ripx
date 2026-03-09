/**
 * NotFound (404) Component
 *
 * Advanced tech-themed 404: particles, glitch, terminal cursor, staggered text.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getShopDomain } from '../../services';
import { getNotFoundHome } from '../../utils/notFoundHome';
import PageShell from '../Shared/PageShell';
import styles from './NotFound.module.css';

const PARTICLE_COUNT = 24;
const ROUTE_TEXT = 'ROUTE NOT FOUND';

function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const { homePath, homeLabel } = getNotFoundHome(getShopDomain(), location.pathname);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Page not found - RipX';
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(t);
  }, []);

  const displayPath = location.pathname || '/';

  return (
    <PageShell>
      <div className={styles.wrapper}>
        <div className={styles.bg} aria-hidden="true">
          <div className={styles.grid} />
          <div className={styles.grid2} />
          <div className={styles.gradient} />
          <div className={styles.gradientOrb} />
          <div className={styles.circuitLine} />
          <div className={styles.circuitLine2} />
          <div className={styles.scanline} />
          <div className={styles.scanline2} />
          <div className={styles.noise} />
          {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
            <div
              key={i}
              className={styles.particle}
              style={{
                '--i': i,
                '--x': `${(i * 7 + 13) % 100}%`,
                '--delay': `${(i * 0.4) % 5}s`,
                '--dur': `${8 + (i % 5)}s`,
                '--size': `${4 + (i % 5)}px`,
              }}
            />
          ))}
        </div>

        <div className={`${styles.content} ${mounted ? styles.visible : ''}`}>
          <div className={styles.codeBlock}>
            <span className={styles.prompt}>&gt;</span>
            <span className={styles.command}> locate </span>
            <span className={styles.path}>&quot;{displayPath}&quot;</span>
            <span className={styles.cursor} />
          </div>

          <div className={styles.errorCodeWrap}>
            <span className={styles.errorCodeGlow} aria-hidden="true">
              404
            </span>
            <span className={styles.errorCode} data-text="404">
              404
            </span>
          </div>

          <p className={styles.title}>
            {ROUTE_TEXT.split('').map((char, i) => (
              <span key={i} className={styles.titleChar} style={{ '--char-i': i }}>
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </p>
          <p className={styles.subtitle}>
            The requested resource does not exist or has been moved.
          </p>

          <div className={styles.pathDisplay}>
            <span className={styles.pathLabel}>path:</span>
            <code className={styles.pathValue}>{displayPath}</code>
            <span className={styles.pathShimmer} />
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => navigate(homePath)}
              aria-label={homeLabel}
            >
              <span className={styles.btnShine} />
              <span className={styles.btnGlow} />
              <span className={styles.btnText}>{homeLabel}</span>
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => window.history.back()}
              aria-label="Go back to previous page"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default NotFound;
