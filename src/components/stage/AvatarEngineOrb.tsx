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

export const AvatarEngineOrb: React.FC<Props> = ({
  avatar,
  emotion,
  gesture,
  getVisemes,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ avatar, emotion, gesture, getVisemes });

  useEffect(() => {
    stateRef.current = { avatar, emotion, gesture, getVisemes };
  }, [avatar, emotion, gesture, getVisemes]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100
    );
    camera.position.set(0, 0, 4.6);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(container.clientWidth || 640, container.clientHeight || 480);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
    } catch {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px;">Contexto WebGL indisponível neste navegador — alterne para o modo 2D LiveRig.</div>';
      return;
    }

    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    // 1. Núcleo Quântico Icosaédrico
    const coreGeo = new THREE.IcosahedronGeometry(0.68, 4);
    const baseCorePos = new Float32Array(coreGeo.attributes.position.array.length);
    baseCorePos.set(coreGeo.attributes.position.array);

    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(avatar.visualOrb.coreColor),
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    orbGroup.add(coreMesh);

    // 2. Campo de Partículas Harmônicas Fibonacci (Até 3600 partículas)
    const maxParticles = 3600;
    const positions = new Float32Array(maxParticles * 3);
    const seedDirs = new Float32Array(maxParticles * 3);
    const phases = new Float32Array(maxParticles);

    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    for (let i = 0; i < maxParticles; i++) {
      const theta = (2 * Math.PI * i) / goldenRatio;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / maxParticles);
      const ux = Math.cos(theta) * Math.sin(phi);
      const uy = Math.sin(theta) * Math.sin(phi);
      const uz = Math.cos(phi);
      const r = 1.15 + (i % 7) * 0.045;

      positions[i * 3] = ux * r;
      positions[i * 3 + 1] = uy * r;
      positions[i * 3 + 2] = uz * r;

      seedDirs[i * 3] = ux;
      seedDirs[i * 3 + 1] = uy;
      seedDirs[i * 3 + 2] = uz;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: new THREE.Color(avatar.visualOrb.outerColor),
      size: 0.032,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    orbGroup.add(particleSystem);

    // 3. Anéis Giroscópicos Orbitais
    const rings: THREE.Mesh[] = [];
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(avatar.visualOrb.coreColor),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.32,
    });

    for (let r = 0; r < 4; r++) {
      const radius = 1.48 + r * 0.18;
      const rGeo = new THREE.RingGeometry(radius, radius + 0.016, 96);
      const rMesh = new THREE.Mesh(rGeo, ringMat);
      rMesh.rotation.set(r * 0.6, r * 0.4, r * 0.3);
      orbGroup.add(rMesh);
      rings.push(rMesh);
    }

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

      const { avatar: curAvatar, emotion: curEmotion, getVisemes: sampleFn } =
        stateRef.current;
      const cfg = curAvatar.visualOrb;
      const v = sampleFn(dt);

      const primaryColor =
        curEmotion === 'alert'
          ? new THREE.Color(cfg.alertColor || '#ff3b5c')
          : new THREE.Color(cfg.coreColor || '#00f0ff');
      const outerColor =
        curEmotion === 'alert'
          ? new THREE.Color('#f59e0b')
          : new THREE.Color(cfg.outerColor || '#10b981');

      coreMat.color.lerp(primaryColor, 0.1);
      particleMat.color.lerp(outerColor, 0.1);
      ringMat.color.lerp(primaryColor, 0.1);
      particleMat.size = 0.026 + cfg.bloomStrength * 0.012 + v.energy * 0.018;

      const activeCount = Math.min(maxParticles, Math.max(400, cfg.particleCount));
      particleGeo.setDrawRange(0, activeCount);

      // Deforma o núcleo icosaédrico com as formantes da voz
      const corePos = coreGeo.attributes.position;
      for (let i = 0; i < corePos.count; i++) {
        const bx = baseCorePos[i * 3];
        const by = baseCorePos[i * 3 + 1];
        const bz = baseCorePos[i * 3 + 2];
        const wave =
          Math.sin(bx * 4.0 + t * 3.2) *
          Math.cos(by * 4.0 + t * 2.7) *
          (0.06 + v.jawOpen * 0.28 * cfg.turbulence);
        const s = 1 + wave + v.energy * 0.22;
        corePos.setXYZ(i, bx * s, by * s, bz * s);
      }
      corePos.needsUpdate = true;

      // Atualiza partículas com base no modo geométrico + espectro de áudio
      const pAttr = particleGeo.attributes.position;
      const turb = cfg.turbulence;
      for (let i = 0; i < activeCount; i++) {
        const ux = seedDirs[i * 3];
        const uy = seedDirs[i * 3 + 1];
        const uz = seedDirs[i * 3 + 2];
        const ph = phases[i];

        let radius = 1.18;
        if (cfg.geometryMode === 'torus_harmonic') {
          radius = 1.15 + 0.32 * Math.sin(uy * 6.0 + t * 2.4);
        } else if (cfg.geometryMode === 'quantum_shell') {
          const shell = (i % 3) * 0.26;
          radius = 0.98 + shell + Math.sin(ph + t * 3.0) * 0.08;
        } else {
          radius = 1.18 + Math.sin(ph + t * 2.0) * 0.06;
        }

        const harmonicDisp =
          Math.sin(ux * 5.0 + t * 4.0 + ph) *
          (0.05 + (v.jawOpen * 0.45 + v.mouthWide * 0.25) * turb);

        const finalR = radius + harmonicDisp;
        pAttr.setXYZ(i, ux * finalR, uy * finalR, uz * finalR);
      }
      pAttr.needsUpdate = true;

      // Atualiza anéis orbitais
      rings.forEach((ring, idx) => {
        ring.visible = idx < cfg.ringCount;
        ring.rotation.x += dt * (0.35 + idx * 0.15) * (1 + v.energy * 2.0);
        ring.rotation.y += dt * (0.28 + idx * 0.12) * (1 + v.energy * 1.5);
        ring.scale.setScalar(1 + v.energy * 0.12);
      });

      orbGroup.rotation.y += dt * (0.25 + v.energy * 0.8) + pointerX * 0.01;
      orbGroup.rotation.x = THREE.MathUtils.lerp(orbGroup.rotation.x, -pointerY * 0.25, 0.08);

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

  return <div ref={mountRef} className="stage-canvas-layer" id="avatar-canvas-orb" />;
};
