import React, { useEffect, useState } from 'react';
import { Volume2, Mic } from 'lucide-react';
import { VisemeWeights } from '../../types/avatar';

interface Props {
  isSpeaking: boolean;
  isListening: boolean;
  isProcessing: boolean;
  getVisemes: (dt: number) => VisemeWeights;
}

const BAR_WEIGHTS = [0.35, 0.55, 0.8, 1.0, 0.9, 0.72, 0.95, 0.85, 0.6, 0.4];

export const VoiceWaveformVisualizer: React.FC<Props> = ({
  isSpeaking,
  isListening,
  isProcessing,
  getVisemes,
}) => {
  const [energy, setEnergy] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      const sample = getVisemes(0.05);
      setEnergy(sample.energy);
      setTick((t) => (t + 1) % 1000);
    }, 80);
    return () => clearInterval(id);
  }, [getVisemes]);

  const statusText = isListening
    ? 'Ouvindo sua voz...'
    : isProcessing
    ? 'Consultando base documental...'
    : isSpeaking
    ? 'Assistente IA falando (modalidade Voz sem Avatar)...'
    : 'Pronto para interação por voz ou texto';

  return (
    <div className="pr-voice-only-stage" aria-live="polite">
      <div className="pr-voice-bars" aria-hidden="true">
        {BAR_WEIGHTS.map((weight, idx) => {
          const wave = isSpeaking
            ? Math.max(0.22, energy * weight * (0.75 + 0.45 * Math.sin(tick * 0.45 + idx * 0.9)))
            : isListening
            ? 0.25 + 0.3 * Math.abs(Math.sin(tick * 0.35 + idx * 0.7))
            : isProcessing
            ? 0.2 + 0.15 * Math.abs(Math.sin(tick * 0.25 + idx * 0.6))
            : 0.14;
          const heightPx = Math.round(12 + wave * 58);
          return (
            <div
              key={idx}
              className="pr-voice-bar"
              style={{
                height: `${heightPx}px`,
                opacity: isSpeaking || isListening ? 0.95 : 0.45,
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          fontSize: '0.84rem',
          fontWeight: 600,
          color: '#0f6260',
        }}
      >
        {isListening ? <Mic size={16} /> : <Volume2 size={16} />}
        <span>{statusText}</span>
      </div>
      <div style={{ fontSize: '0.75rem', color: '#435b57' }}>
        Condição experimental sem representação visual de avatar (comparador H5)
      </div>
    </div>
  );
};
