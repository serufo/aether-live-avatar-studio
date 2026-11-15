import React, { useEffect, useRef } from 'react';
import {
  AvatarProfile,
  EmotionState,
  GestureState,
  VisemeWeights,
} from '../../types/avatar';

interface Props {
  avatar: AvatarProfile;
  emotion: EmotionState;
  gesture: GestureState;
  getVisemes: (dt: number) => VisemeWeights;
}

export const AvatarEngine2D: React.FC<Props> = ({
  avatar,
  emotion,
  gesture,
  getVisemes,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ avatar, emotion, gesture, getVisemes });

  useEffect(() => {
    stateRef.current = { avatar, emotion, gesture, getVisemes };
  }, [avatar, emotion, gesture, getVisemes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pointerX = 0;
    let pointerY = 0;
    let springX = 0;
    let springY = 0;
    let velX = 0;
    let velY = 0;

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    };
    window.addEventListener('mousemove', onMouseMove);

    let lastTime = performance.now();
    let animId = 0;

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      const {
        avatar: curAvatar,
        emotion: curEmotion,
        gesture: curGesture,
        getVisemes: sampleFn,
      } = stateRef.current;
      const cfg = curAvatar.visual2D;
      const v = sampleFn(dt);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Física de Mola 2D (Live2D-style Spring Damping)
      const stiffness = 12 * (0.4 + cfg.physicsSpring);
      const damping = 0.82;
      velX = (velX + (pointerX - springX) * stiffness * dt) * damping;
      velY = (velY + (pointerY - springY) * stiffness * dt) * damping;
      springX += velX;
      springY += velY;

      const cx = w * 0.5;
      const cy = h * 0.48;
      const scale = Math.min(w, h) / 620;

      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      const accent = curEmotion === 'alert' ? '#ff3b5c' : cfg.primaryColor;
      const secondary = cfg.secondaryColor;

      // Halo Acústico Reativo no Fundo
      const auraRadius = 195 + v.energy * 55;
      const grad = ctx.createRadialGradient(0, -15, 25, 0, -15, auraRadius);
      grad.addColorStop(0, `${accent}44`);
      grad.addColorStop(0.6, `${secondary}18`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, -15, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // Anéis Vetoriais de Sincronia
      ctx.strokeStyle = `${accent}55`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -15, 165 + Math.sin(t * 2.5) * 6 + v.energy * 22, 0, Math.PI * 2);
      ctx.stroke();

      const breathY = Math.sin(t * 2.2) * 5;
      const headOffsetX = springX * 22;
      const headOffsetY = springY * 14 + breathY;

      // Camada 1: Cabelo Traseiro (Com balanço de física)
      ctx.save();
      ctx.translate(headOffsetX * 0.7, headOffsetY * 0.8);
      ctx.fillStyle = cfg.hairColor;
      ctx.beginPath();
      ctx.moveTo(-105, -90);
      ctx.bezierCurveTo(-140 - velX * 35, 20, -125 - velX * 50, 130, -70, 155);
      ctx.lineTo(70, 155);
      ctx.bezierCurveTo(125 - velX * 50, 130, 140 - velX * 35, 20, 105, -90);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Camada 2: Torso & Jaqueta Técnica 2D
      ctx.save();
      ctx.translate(springX * 8, breathY * 0.7);
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-135, 240);
      ctx.quadraticCurveTo(-125, 115, -55, 95);
      ctx.lineTo(55, 95);
      ctx.quadraticCurveTo(125, 115, 135, 240);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Gola Cyber Luminosa
      ctx.fillStyle = `${accent}33`;
      ctx.beginPath();
      ctx.moveTo(-62, 95);
      ctx.lineTo(-22, 165);
      ctx.lineTo(0, 145);
      ctx.lineTo(22, 165);
      ctx.lineTo(62, 95);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Pescoço
      ctx.fillStyle = cfg.skinTone;
      ctx.fillRect(-26, 42, 52, 68);
      ctx.restore();

      // Camada 3: Cabeça e Rosto 2D
      ctx.save();
      const nodOffset =
        curGesture === 'nod' || v.energy > 0.2 ? Math.sin(t * 7.5) * 6 : 0;
      ctx.translate(headOffsetX, headOffsetY + nodOffset);
      ctx.rotate(springX * 0.06 + (curEmotion === 'thinking' ? 0.05 : 0));

      // Contorno do Rosto Estilizado
      ctx.fillStyle = cfg.skinTone;
      ctx.strokeStyle = `${accent}88`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-82, -75);
      ctx.bezierCurveTo(-86, 5, -62, 62, 0, 80);
      ctx.bezierCurveTo(62, 62, 86, 5, 82, -75);
      ctx.bezierCurveTo(80, -135, -80, -135, -82, -75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Blush / Iluminação Subcutânea Suave
      ctx.fillStyle =
        curEmotion === 'alert' ? 'rgba(255,59,92,0.22)' : 'rgba(244,114,182,0.16)';
      ctx.beginPath();
      ctx.ellipse(-46, 12, 16, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(46, 12, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Olhos Expressivos em Camadas (Esclera, Íris com Gradiente, Pupila e Brilho)
      const eyeOpen = Math.max(0.08, 1 - v.eyeBlink);
      const drawEye = (ex: number) => {
        ctx.save();
        ctx.translate(ex, -14);
        ctx.scale(1, eyeOpen);

        // Esclera
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Íris com rastreamento de mouse
        const gx = springX * 6;
        const gy = springY * 4;
        ctx.fillStyle = curEmotion === 'alert' ? '#ff3b5c' : cfg.eyeColor;
        ctx.beginPath();
        ctx.arc(gx, gy, 11.5, 0, Math.PI * 2);
        ctx.fill();

        // Pupila
        ctx.fillStyle = '#090d16';
        ctx.beginPath();
        ctx.arc(gx, gy, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // Catchlight (Brilho Anime/Estúdio)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(gx - 4, gy - 4, 3.2, 0, Math.PI * 2);
        ctx.arc(gx + 3.5, gy + 3, 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Cílios Superiores
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 2, 22, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();

        ctx.restore();
      };

      drawEye(-36);
      drawEye(36);

      // Sobrancelhas Dinâmicas
      const drawBrow = (bx: number, isRight: boolean) => {
        ctx.save();
        const lift = -38 - v.browLift * 7 - (curEmotion === 'surprised' ? 8 : 0);
        ctx.translate(bx, lift);
        let angle = 0;
        if (curEmotion === 'alert') angle = isRight ? -0.25 : 0.25;
        if (curEmotion === 'empathetic') angle = isRight ? 0.18 : -0.18;
        if (curEmotion === 'thinking') angle = isRight ? -0.15 : 0.05;
        ctx.rotate(angle);
        ctx.strokeStyle = cfg.hairColor;
        ctx.lineWidth = 4.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.quadraticCurveTo(0, -5, 18, 0);
        ctx.stroke();
        ctx.restore();
      };
      drawBrow(-36, false);
      drawBrow(36, true);

      // Nariz Minimalista
      ctx.strokeStyle = 'rgba(15,23,42,0.38)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-3, 12);
      ctx.lineTo(3, 14);
      ctx.stroke();

      // Boca Multi-Visema em Tempo Real (A, E, I, O, U, Silêncio)
      ctx.save();
      ctx.translate(0, 38);
      if (v.jawOpen < 0.06) {
        // Sorriso sutil em repouso
        ctx.strokeStyle = '#881337';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const smileCurve = curEmotion === 'happy' ? 8 : curEmotion === 'alert' ? -4 : 4;
        ctx.moveTo(-16, 0);
        ctx.quadraticCurveTo(0, smileCurve, 16, 0);
        ctx.stroke();
      } else {
        const mw = 14 + v.mouthWide * 14 - v.mouthRound * 6;
        const mh = 4 + v.jawOpen * 22;
        ctx.fillStyle = '#4c0519';
        ctx.strokeStyle = '#9f1239';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 2, mw, mh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Língua & Dentes Internos
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-mw, -mh, mw * 2, mh * 0.42);
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.arc(0, mh * 0.85, mw * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // Camada 4: Franja Frontal com Física de Mola
      ctx.fillStyle = cfg.hairColor;
      ctx.beginPath();
      ctx.moveTo(-88, -62);
      ctx.quadraticCurveTo(-45, -135, 0, -132);
      ctx.quadraticCurveTo(45, -135, 88, -62);
      ctx.quadraticCurveTo(55 + velX * 18, -22, 32 + velX * 15, -52);
      ctx.quadraticCurveTo(5 + velX * 22, -10, -18 + velX * 15, -55);
      ctx.quadraticCurveTo(-50 + velX * 18, -18, -88, -62);
      ctx.closePath();
      ctx.fill();

      // Headset / Antena Cyber Lateral
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(-92, -24, 10, 38, 5);
      ctx.roundRect(82, -24, 10, 38, 5);
      ctx.fill();

      ctx.restore();

      // Mão / Gesto Expressivo 2D quando Acenando ou Explicando
      if (curGesture === 'wave' || curGesture === 'explain' || v.energy > 0.25) {
        ctx.save();
        const handX = 125 + Math.sin(t * 6.5) * 14;
        const handY = 95 + Math.cos(t * 5.0) * 10;
        ctx.translate(handX, handY);
        ctx.rotate(Math.sin(t * 7.0) * 0.22);
        ctx.fillStyle = cfg.skinTone;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="stage-canvas-layer" id="avatar-canvas-2d" />;
};
