import React, { useEffect, useState } from 'react';
import { APP_DEV_VERSION_LABEL } from '../../config/version';

interface AetherSplashScreenProps {
  /** Pré-desbloqueia Web Audio caso o usuário interaja com a tela durante a splash */
  onPreUnlockAudio?: () => void;
  /** Disparado ao concluir a transição suave de saída da splash */
  onEnter: () => void;
  /** Duração total da splash em milissegundos (padrão: 4000ms) */
  durationMs?: number;
  /** Rótulo da versão de desenvolvimento (padrão: dev v1) */
  versionLabel?: string;
}

const EXIT_TRANSITION_MS = 460;

const ETHER_MOTES = [
  { left: '14%', size: 3, delay: '0s', duration: '11s', opacity: 0.45 },
  { left: '28%', size: 2, delay: '2.4s', duration: '14s', opacity: 0.35 },
  { left: '43%', size: 3, delay: '1.1s', duration: '12.5s', opacity: 0.4 },
  { left: '61%', size: 2, delay: '3.6s', duration: '13s', opacity: 0.38 },
  { left: '76%', size: 3, delay: '0.7s', duration: '10.8s', opacity: 0.46 },
  { left: '88%', size: 2, delay: '4.2s', duration: '15s', opacity: 0.32 },
];

export const AetherSplashScreen: React.FC<AetherSplashScreenProps> = ({
  onPreUnlockAudio,
  onEnter,
  durationMs = 4000,
  versionLabel = APP_DEV_VERSION_LABEL,
}) => {
  const [isExiting, setIsExiting] = useState(false);

  const rawBase = import.meta.env.BASE_URL || './';
  const baseUrl = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const backdropSrc = `${baseUrl}splash/aether.jpeg`;
  const emblemSrc = `${baseUrl}splash/aether-emblem.png`;

  useEffect(() => {
    const exitDelay = Math.max(0, durationMs - EXIT_TRANSITION_MS);
    const fadeTimer = window.setTimeout(() => {
      setIsExiting(true);
    }, exitDelay);
    const doneTimer = window.setTimeout(() => {
      onEnter();
    }, durationMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [durationMs, onEnter]);

  return (
    <div
      id="aether-splash-screen"
      className={`aether-splash-root ${isExiting ? 'is-exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-labelledby="aether-splash-title"
      onPointerDown={() => onPreUnlockAudio?.()}
    >
      {/* Camada 1: Horizonte celeste de Éter (aether.jpeg) emergindo da noite primordial */}
      <div className="aether-splash-backdrop" aria-hidden="true">
        <img
          src={backdropSrc}
          alt=""
          className="aether-splash-backdrop-img"
          decoding="async"
          fetchPriority="high"
        />
        <div className="aether-splash-veil" />
        <div className="aether-splash-motes">
          {ETHER_MOTES.map((mote, idx) => (
            <span
              key={idx}
              className="aether-ether-mote"
              style={{
                left: mote.left,
                width: `${mote.size}px`,
                height: `${mote.size}px`,
                animationDelay: mote.delay,
                animationDuration: mote.duration,
                opacity: mote.opacity,
              }}
            />
          ))}
        </div>
      </div>

      {/* Camada 2: Centro minimalista com emblema de Éter e barra de progressão de 4s */}
      <div className="aether-splash-frame">
        <div className="aether-splash-top-meta" aria-hidden="true">
          <span className="aether-meta-origin">ÉREBO &amp; NIX</span>
          <span className="aether-meta-divider" />
          <span className="aether-meta-origin">CÉU SUPERIOR</span>
        </div>

        <main className="aether-splash-content">
          <div className="aether-splash-medallion">
            <div className="aether-orbit-ring aether-orbit-outer" aria-hidden="true" />
            <div className="aether-orbit-ring aether-orbit-inner" aria-hidden="true" />
            <div className="aether-medallion-portrait-wrap">
              <img
                src={emblemSrc}
                alt="Éter (Aither), personificação primordial do céu superior e luminoso"
                className="aether-medallion-portrait"
                decoding="async"
                fetchPriority="high"
              />
            </div>
          </div>

          <div className="aether-splash-epigraph">
            <span className="aether-epigraph-rule" aria-hidden="true" />
            <span>ΑΙΘΗΡ · ÉTER</span>
            <span className="aether-epigraph-rule" aria-hidden="true" />
          </div>

          <h1 id="aether-splash-title" className="aether-splash-title">
            AETHER
          </h1>

          <div className="aether-splash-progress-track" aria-hidden="true">
            <div
              className="aether-splash-progress-fill"
              style={{ animationDuration: `${durationMs}ms` }}
            />
          </div>
        </main>

        {/* Camada 3: Rodapé minimalista com versão de desenvolvimento */}
        <footer className="aether-splash-footer">
          <span className="aether-footer-studio">AETHER LIVE STUDIO</span>
          <span
            id="splash-dev-version"
            className="aether-dev-version"
            title="Versão de desenvolvimento (incrementada a cada atualização)"
          >
            {versionLabel}
          </span>
        </footer>
      </div>
    </div>
  );
};
