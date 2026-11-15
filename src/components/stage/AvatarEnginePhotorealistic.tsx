import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
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

export const AvatarEnginePhotorealistic: React.FC<Props> = ({
  avatar,
  emotion,
  gesture,
  getVisemes,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ avatar, emotion, gesture, getVisemes });
  const loadedUrlRef = useRef<string>('');

  useEffect(() => {
    stateRef.current = { avatar, emotion, gesture, getVisemes };
  }, [avatar, emotion, gesture, getVisemes]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      32,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100
    );
    camera.position.set(0, 0, 4.15);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(container.clientWidth || 640, container.clientHeight || 480);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
    } catch {
      container.innerHTML = `<img src="${avatar.visualPhoto.portraitUrl || 'avatars/helena.jpg'}" style="max-height:85%;border-radius:16px;object-fit:contain;" alt="${avatar.name}" />`;
      return;
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.85);
    scene.add(ambientLight);

    const rimLight = new THREE.PointLight(
      new THREE.Color(avatar.visualPhoto.rimGlowColor || '#10b981'),
      2.4,
      10
    );
    rimLight.position.set(1.6, 0.9, 1.8);
    scene.add(rimLight);

    // Malha 2.5D de Alta Densidade (56x56 subdivisões) para Deformação Facial Fotorrealista
    const segs = 56;
    const planeGeo = new THREE.PlaneGeometry(2.55, 2.55, segs, segs);
    const basePositions = new Float32Array(planeGeo.attributes.position.array.length);
    basePositions.set(planeGeo.attributes.position.array);

    // Aplica relevo 2.5D anatômico inicial (nariz, maçãs do rosto, testa e queixo)
    const posAttr = planeGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const nx = x / 1.275;
      const ny = y / 1.275;
      const faceDistSq = nx * nx * 1.45 + (ny - 0.04) * (ny - 0.04) * 1.1;
      const faceRelief = Math.exp(-faceDistSq * 2.4) * 0.26;
      const noseBump =
        Math.exp(-(nx * nx * 28.0 + (ny - 0.02) * (ny - 0.02) * 16.0)) * 0.095;
      const z = faceRelief + noseBump;
      posAttr.setZ(i, z);
      basePositions[i * 3 + 2] = z;
    }
    planeGeo.computeVertexNormals();

    const textureLoader = new THREE.TextureLoader();
    const initialUrl = avatar.visualPhoto.portraitUrl || 'avatars/helena.jpg';
    loadedUrlRef.current = initialUrl;

    const portraitTex = textureLoader.load(initialUrl);
    portraitTex.colorSpace = THREE.SRGBColorSpace;

    const portraitMat = new THREE.MeshStandardMaterial({
      map: portraitTex,
      roughness: 0.65,
      metalness: 0.05,
    });

    const portraitMesh = new THREE.Mesh(planeGeo, portraitMat);
    scene.add(portraitMesh);

    // Moldura Halo Estúdio Sutil ao Redor do Retrato 2.5D
    const frameRingGeo = new THREE.RingGeometry(1.31, 1.335, 96);
    const frameRingMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(avatar.visualPhoto.rimGlowColor || '#10b981'),
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const frameRing = new THREE.Mesh(frameRingGeo, frameRingMat);
    frameRing.position.z = 0.08;
    scene.add(frameRing);

    let pointerX = 0;
    let pointerY = 0;
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      pointerX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerY = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    };
    window.addEventListener('mousemove', onMouseMove);

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let lastTime = performance.now();
    let animId = 0;

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      const {
        avatar: curAvatar,
        emotion: curEmotion,
        gesture: curGesture,
        getVisemes: sampleFn,
      } = stateRef.current;
      const cfg = curAvatar.visualPhoto;
      const v = sampleFn(dt);

      // Troca dinâmica da foto caso o usuário mude no Admin
      if (cfg.portraitUrl && cfg.portraitUrl !== loadedUrlRef.current) {
        loadedUrlRef.current = cfg.portraitUrl;
        textureLoader.load(cfg.portraitUrl, (newTex) => {
          newTex.colorSpace = THREE.SRGBColorSpace;
          portraitMat.map = newTex;
          portraitMat.needsUpdate = true;
        });
      }

      const glowHex = curEmotion === 'alert' ? '#ff3b5c' : cfg.rimGlowColor || '#10b981';
      rimLight.color.lerp(new THREE.Color(glowHex), 0.1);
      rimLight.intensity = 1.8 + v.energy * 2.2;
      frameRingMat.color.lerp(new THREE.Color(glowHex), 0.1);
      frameRing.scale.setScalar(1 + v.energy * 0.035);

      const warpScale = cfg.warpIntensity ?? 0.85;
      const motionScale = cfg.headMotionScale ?? 0.78;

      // Deformação de Vértices em Tempo Real (Boca, Mandíbula, Bochechas, Pálpebras e Sobrancelhas)
      const positions = planeGeo.attributes.position;
      const count = positions.count;

      const headTurnX = (pointerX * 0.08 + Math.sin(t * 0.9) * 0.025) * motionScale;
      const headTurnY =
        (pointerY * 0.06 +
          Math.cos(t * 1.4) * 0.018 +
          (curGesture === 'nod' || v.energy > 0.2 ? Math.sin(t * 6.8) * 0.025 : 0)) *
        motionScale;
      const breath = Math.sin(t * 2.1) * 0.012;

      for (let i = 0; i < count; i++) {
        const bx = basePositions[i * 3];
        const by = basePositions[i * 3 + 1];
        const bz = basePositions[i * 3 + 2];

        const nx = bx / 1.275; // [-1, 1]
        const ny = by / 1.275; // [-1, 1]

        // Máscara que preserva as bordas externas da imagem fixas
        const edgeMask = Math.max(
          0,
          1 - Math.pow(Math.max(Math.abs(nx), Math.abs(ny)), 3.2)
        );

        let dx = headTurnX * bz * 1.8 * edgeMask;
        let dy = (headTurnY * bz * 1.8 + breath * (ny < -0.25 ? 1 : 0.35)) * edgeMask;
        let dz = bz;

        // 1. Deformação Labial e Mandibular (Boca localizada em torno de nx=0, ny=-0.16)
        const mouthDx = nx;
        const mouthDy = ny + 0.155;
        const mouthInfluence = Math.exp(-(mouthDx * mouthDx * 26.0 + mouthDy * mouthDy * 38.0));

        // Mandíbula inferior e queixo (ny entre -0.16 e -0.48)
        const jawInfluence =
          ny < -0.145 && ny > -0.52
            ? Math.exp(-(nx * nx * 14.0 + Math.pow(ny + 0.26, 2) * 22.0))
            : 0;

        if (v.jawOpen > 0.01) {
          // Lábio inferior e queixo descem durante as vogais
          if (ny < -0.148) {
            dy -= (mouthInfluence * 0.085 + jawInfluence * 0.065) * v.jawOpen * warpScale;
            dz += mouthInfluence * 0.035 * v.jawOpen * warpScale;
          } else if (ny >= -0.148 && ny < -0.08) {
            // Lábio superior sobe sutilmente
            dy += mouthInfluence * 0.028 * v.jawOpen * warpScale;
          }
          // Estiramento horizontal dos cantos da boca (vogais abertas vs arredondadas)
          const cornerStretch = (v.mouthWide * 0.038 - v.mouthRound * 0.032) * warpScale;
          dx += Math.sign(nx) * mouthInfluence * cornerStretch;
        }

        // Sorriso por emoção
        if (curEmotion === 'happy') {
          const cornerMask = Math.exp(
            -(Math.pow(Math.abs(nx) - 0.14, 2) * 60 + Math.pow(ny + 0.15, 2) * 60)
          );
          dy += cornerMask * 0.022 * warpScale;
          dx += Math.sign(nx) * cornerMask * 0.012 * warpScale;
        }

        // 2. Piscada Natural das Pálpebras (Olhos em torno de nx = ±0.17, ny = +0.075)
        if (v.eyeBlink > 0.02) {
          const leftEyeDist = Math.pow(nx + 0.165, 2) * 55 + Math.pow(ny - 0.085, 2) * 95;
          const rightEyeDist = Math.pow(nx - 0.165, 2) * 55 + Math.pow(ny - 0.085, 2) * 95;
          const eyeMask = Math.exp(-leftEyeDist) + Math.exp(-rightEyeDist);
          if (ny > 0.065) {
            dy -= eyeMask * 0.036 * v.eyeBlink;
          }
        }

        // 3. Elevação de Sobrancelhas (Em torno de ny = +0.16)
        const browMask =
          Math.exp(-(Math.pow(Math.abs(nx) - 0.17, 2) * 30 + Math.pow(ny - 0.165, 2) * 65));
        const extraBrow =
          curEmotion === 'surprised' ? 0.028 : curEmotion === 'thinking' ? 0.016 : 0;
        dy += browMask * (v.browLift * 0.024 + extraBrow) * warpScale;

        positions.setXYZ(i, bx + dx, by + dy, dz);
      }

      positions.needsUpdate = true;
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="stage-canvas-layer photorealistic-stage-wrapper">
      <div ref={mountRef} className="stage-canvas-layer" id="avatar-canvas-photorealistic" />
      {avatar.visualPhoto.cinematicVignette && <div className="photorealistic-vignette" />}
    </div>
  );
};
