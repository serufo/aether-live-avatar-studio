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

export const AvatarEngine3D: React.FC<Props> = ({
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
      avatar.visual3D.cameraFov || 36,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100
    );
    camera.position.set(0, 0.35, 4.3);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Iluminação de Estúdio 3 Pontos + Rim Light Reativa
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(2.5, 3.5, 4.0);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.9);
    fillLight.position.set(-3.0, 1.0, 2.5);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(
      new THREE.Color(avatar.visual3D.accentColor),
      avatar.visual3D.rimLightIntensity * 2.5,
      12
    );
    rimLight.position.set(0, 1.8, -2.2);
    scene.add(rimLight);

    // Grupo Raiz do Personagem 3D
    const rootGroup = new THREE.Group();
    rootGroup.position.y = -0.35;
    scene.add(rootGroup);

    // Materiais PBR Dinâmicos
    const skinMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(avatar.visual3D.skinTone),
      roughness: 0.42,
      metalness: 0.06,
    });

    const suitMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(avatar.visual3D.suitColor),
      roughness: 0.35,
      metalness: 0.45,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(avatar.visual3D.accentColor),
      emissive: new THREE.Color(avatar.visual3D.accentColor),
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.8,
    });

    const hairMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(avatar.visual3D.hairColor),
      roughness: 0.5,
      metalness: 0.25,
    });

    // Torso e Jaqueta Executiva/Cyber
    const torsoGroup = new THREE.Group();
    rootGroup.add(torsoGroup);

    const chestGeo = new THREE.CylinderGeometry(0.68, 0.52, 1.35, 32);
    const chestMesh = new THREE.Mesh(chestGeo, suitMat);
    chestMesh.position.y = -0.62;
    chestMesh.scale.set(1.28, 1, 0.72);
    torsoGroup.add(chestMesh);

    // Colarinho Luminoso (Lapela Holográfica)
    const collarGeo = new THREE.TorusGeometry(0.46, 0.045, 16, 48, Math.PI * 1.35);
    const collarMesh = new THREE.Mesh(collarGeo, accentMat);
    collarMesh.position.set(0, 0.02, 0.12);
    collarMesh.rotation.x = Math.PI * 0.58;
    collarMesh.rotation.z = -Math.PI * 0.175;
    torsoGroup.add(collarMesh);

    // Núcleo Peitoral Reativo à Voz
    const coreBadgeGeo = new THREE.OctahedronGeometry(0.11, 1);
    const coreBadge = new THREE.Mesh(coreBadgeGeo, accentMat);
    coreBadge.position.set(0, -0.32, 0.48);
    torsoGroup.add(coreBadge);

    // Pescoço
    const neckGeo = new THREE.CylinderGeometry(0.21, 0.25, 0.42, 24);
    const neckMesh = new THREE.Mesh(neckGeo, skinMat);
    neckMesh.position.y = 0.22;
    torsoGroup.add(neckMesh);

    // Braços Articulados para Gestos
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.92, -0.15, 0);
    torsoGroup.add(leftArmGroup);

    const shoulderGeo = new THREE.SphereGeometry(0.22, 24, 24);
    leftArmGroup.add(new THREE.Mesh(shoulderGeo, suitMat));

    const upperArmGeo = new THREE.CylinderGeometry(0.15, 0.13, 0.75, 20);
    const leftUpperArm = new THREE.Mesh(upperArmGeo, suitMat);
    leftUpperArm.position.y = -0.38;
    leftArmGroup.add(leftUpperArm);

    const leftForearmGroup = new THREE.Group();
    leftForearmGroup.position.set(0, -0.75, 0);
    leftArmGroup.add(leftForearmGroup);

    const forearmGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.68, 20);
    const leftForearm = new THREE.Mesh(forearmGeo, suitMat);
    leftForearm.position.y = -0.32;
    leftForearmGroup.add(leftForearm);

    const handGeo = new THREE.SphereGeometry(0.13, 20, 20);
    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.y = -0.68;
    leftHand.scale.set(0.85, 1.2, 0.6);
    leftForearmGroup.add(leftHand);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.92, -0.15, 0);
    torsoGroup.add(rightArmGroup);
    rightArmGroup.add(new THREE.Mesh(shoulderGeo, suitMat));

    const rightUpperArm = new THREE.Mesh(upperArmGeo, suitMat);
    rightUpperArm.position.y = -0.38;
    rightArmGroup.add(rightUpperArm);

    const rightForearmGroup = new THREE.Group();
    rightForearmGroup.position.set(0, -0.75, 0);
    rightArmGroup.add(rightForearmGroup);

    const rightForearm = new THREE.Mesh(forearmGeo, suitMat);
    rightForearm.position.y = -0.32;
    rightForearmGroup.add(rightForearm);

    const rightHand = new THREE.Mesh(handGeo, skinMat);
    rightHand.position.y = -0.68;
    rightHand.scale.set(0.85, 1.2, 0.6);
    rightForearmGroup.add(rightHand);

    // Grupo da Cabeça Articulada
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.78, 0.05);
    rootGroup.add(headGroup);

    // Crânio / Rosto Superior Esculpido
    const craniumGeo = new THREE.SphereGeometry(0.56, 40, 40);
    const craniumMesh = new THREE.Mesh(craniumGeo, skinMat);
    craniumMesh.scale.set(0.92, 1.08, 0.96);
    headGroup.add(craniumMesh);

    // Mandíbula Articulada para Sincronia Labial (Jaw Pivot)
    const jawGroup = new THREE.Group();
    jawGroup.position.set(0, -0.14, 0.08);
    headGroup.add(jawGroup);

    const chinGeo = new THREE.SphereGeometry(0.38, 32, 24);
    const chinMesh = new THREE.Mesh(chinGeo, skinMat);
    chinMesh.position.set(0, -0.18, 0.08);
    chinMesh.scale.set(0.95, 0.85, 0.95);
    jawGroup.add(chinMesh);

    // Nariz Esculpido
    const noseGeo = new THREE.ConeGeometry(0.075, 0.24, 16);
    const noseMesh = new THREE.Mesh(noseGeo, skinMat);
    noseMesh.position.set(0, -0.02, 0.54);
    noseMesh.rotation.x = Math.PI * 0.12;
    headGroup.add(noseMesh);

    // Boca / Cavidade Vocal & Lábios Dinâmicos
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.24, 0.49);
    headGroup.add(mouthGroup);

    const mouthInnerMat = new THREE.MeshBasicMaterial({ color: 0x1a0912 });
    const mouthCavityGeo = new THREE.SphereGeometry(0.12, 24, 24);
    const mouthCavity = new THREE.Mesh(mouthCavityGeo, mouthInnerMat);
    mouthCavity.scale.set(1.2, 0.25, 0.45);
    mouthGroup.add(mouthCavity);

    const lipUpperGeo = new THREE.TorusGeometry(0.12, 0.022, 12, 32, Math.PI);
    const lipMat = new THREE.MeshStandardMaterial({
      color: 0xb55d6a,
      roughness: 0.35,
    });
    const upperLip = new THREE.Mesh(lipUpperGeo, lipMat);
    upperLip.scale.set(1.1, 0.5, 0.7);
    mouthGroup.add(upperLip);

    const lowerLip = new THREE.Mesh(lipUpperGeo, lipMat);
    lowerLip.rotation.z = Math.PI;
    lowerLip.scale.set(1.1, 0.55, 0.7);
    mouthGroup.add(lowerLip);

    // Olhos, Íris, Pupilas e Pálpebras
    const eyeWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.15,
    });
    const irisMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(avatar.visual3D.accentColor),
      emissive: new THREE.Color(avatar.visual3D.accentColor),
      emissiveIntensity: 0.35,
      roughness: 0.1,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050811 });

    const createEye = (xOffset: number) => {
      const eyeSocket = new THREE.Group();
      eyeSocket.position.set(xOffset, 0.1, 0.46);

      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 24), eyeWhiteMat);
      sclera.scale.set(1.15, 0.9, 0.65);
      eyeSocket.add(sclera);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.052, 20, 20), irisMat);
      iris.position.z = 0.048;
      iris.scale.set(1, 1, 0.35);
      eyeSocket.add(iris);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 16), pupilMat);
      pupil.position.z = 0.062;
      pupil.scale.set(1, 1, 0.25);
      eyeSocket.add(pupil);

      const eyelid = new THREE.Mesh(
        new THREE.SphereGeometry(0.102, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
        skinMat
      );
      eyelid.scale.set(1.16, 0.95, 0.7);
      eyelid.rotation.x = -Math.PI * 0.45;
      eyeSocket.add(eyelid);

      return { eyeSocket, iris, pupil, eyelid };
    };

    const leftEye = createEye(-0.19);
    const rightEye = createEye(0.19);
    headGroup.add(leftEye.eyeSocket);
    headGroup.add(rightEye.eyeSocket);

    // Sobrancelhas Articuladas
    const browGeo = new THREE.BoxGeometry(0.18, 0.032, 0.04);
    const leftBrow = new THREE.Mesh(browGeo, hairMat);
    leftBrow.position.set(-0.19, 0.24, 0.5);
    headGroup.add(leftBrow);

    const rightBrow = new THREE.Mesh(browGeo, hairMat);
    rightBrow.position.set(0.19, 0.24, 0.5);
    headGroup.add(rightBrow);

    // Visor Holográfico Opcional (Configurável no Admin)
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(avatar.visual3D.accentColor),
      emissive: new THREE.Color(avatar.visual3D.accentColor),
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.38,
      roughness: 0.08,
      metalness: 0.2,
      transmission: 0.6,
    });
    const visorGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.22, 32, 1, true, -Math.PI * 0.38, Math.PI * 0.76);
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.position.set(0, 0.11, 0.02);
    headGroup.add(visorMesh);

    // Cabelo Esculpido
    const hairGroup = new THREE.Group();
    headGroup.add(hairGroup);

    const hairCapGeo = new THREE.SphereGeometry(0.59, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.06, -0.02);
    hairCap.rotation.x = -0.18;
    hairGroup.add(hairCap);

    const crestGeo = new THREE.TorusGeometry(0.42, 0.12, 16, 32, Math.PI);
    const hairCrest = new THREE.Mesh(crestGeo, hairMat);
    hairCrest.position.set(0, 0.28, 0.08);
    hairCrest.rotation.y = Math.PI * 0.5;
    hairCrest.rotation.x = 0.3;
    hairGroup.add(hairCrest);

    // Anel Holográfico de Telemetria ao Redor da Base
    const holoRingGeo = new THREE.RingGeometry(1.15, 1.19, 64);
    const holoRingMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(avatar.visual3D.accentColor),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const holoRing = new THREE.Mesh(holoRingGeo, holoRingMat);
    holoRing.rotation.x = Math.PI * 0.5;
    holoRing.position.y = -1.15;
    rootGroup.add(holoRing);

    // Rastreamento do Mouse no Palco
    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      pointerX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerY = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    };
    window.addEventListener('mousemove', onPointerMove);

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
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      const { avatar: curAvatar, emotion: curEmotion, gesture: curGesture, getVisemes: sampleFn } =
        stateRef.current;
      const v = sampleFn(dt);

      // Atualiza cores e configurações do Admin em tempo real
      skinMat.color.set(curAvatar.visual3D.skinTone);
      suitMat.color.set(curAvatar.visual3D.suitColor);
      hairMat.color.set(curAvatar.visual3D.hairColor);

      const targetAccent =
        curEmotion === 'alert'
          ? new THREE.Color('#ff3b5c')
          : new THREE.Color(curAvatar.visual3D.accentColor);
      accentMat.color.lerp(targetAccent, 0.12);
      accentMat.emissive.lerp(targetAccent, 0.12);
      irisMat.color.lerp(targetAccent, 0.12);
      irisMat.emissive.lerp(targetAccent, 0.12);
      visorMat.color.lerp(targetAccent, 0.12);
      visorMat.emissive.lerp(targetAccent, 0.12);
      holoRingMat.color.lerp(targetAccent, 0.12);
      rimLight.color.lerp(targetAccent, 0.12);
      rimLight.intensity = curAvatar.visual3D.rimLightIntensity * (2.2 + v.energy * 1.8);

      visorMesh.visible = curAvatar.visual3D.visorEnabled;
      hairCrest.visible = curAvatar.visual3D.hairStyle === 'cyber_crest';
      hairCap.scale.x = curAvatar.visual3D.hairStyle === 'executive_wave' ? 1.08 : 0.96;

      if (Math.abs(camera.fov - curAvatar.visual3D.cameraFov) > 0.5) {
        camera.fov = curAvatar.visual3D.cameraFov;
        camera.updateProjectionMatrix();
      }

      // Sincronia Labial 3D (Mandíbula + Lábios + Cavidade Vocal)
      const jawOpenAmt = v.jawOpen * 0.24;
      jawGroup.rotation.x = jawOpenAmt * 0.7;
      jawGroup.position.y = -0.14 - jawOpenAmt * 0.16;

      const widthScale = 1.0 + v.mouthWide * 0.35 - v.mouthRound * 0.28;
      const openScale = Math.max(0.12, v.jawOpen * 1.65);
      mouthCavity.scale.set(widthScale, openScale, 0.45);
      upperLip.position.y = v.jawOpen * 0.04;
      lowerLip.position.y = -v.jawOpen * 0.095;
      upperLip.scale.x = widthScale;
      lowerLip.scale.x = widthScale;

      // Piscada de Olhos + Rastreamento de Olhar
      const blinkRot = -Math.PI * 0.45 + v.eyeBlink * (Math.PI * 0.48);
      leftEye.eyelid.rotation.x = blinkRot;
      rightEye.eyelid.rotation.x = blinkRot;

      const lookX = pointerX * 0.022;
      const lookY = pointerY * 0.016;
      leftEye.iris.position.x = lookX;
      leftEye.iris.position.y = lookY;
      leftEye.pupil.position.x = lookX * 1.1;
      leftEye.pupil.position.y = lookY * 1.1;
      rightEye.iris.position.x = lookX;
      rightEye.iris.position.y = lookY;
      rightEye.pupil.position.x = lookX * 1.1;
      rightEye.pupil.position.y = lookY * 1.1;

      // Expressões de Sobrancelha por Emoção
      let browY = 0.24 + v.browLift * 0.035;
      let browTilt = 0;
      if (curEmotion === 'surprised') {
        browY += 0.045;
      } else if (curEmotion === 'thinking') {
        browTilt = 0.18;
      } else if (curEmotion === 'empathetic') {
        browTilt = -0.16;
        browY += 0.015;
      } else if (curEmotion === 'alert') {
        browTilt = 0.26;
        browY -= 0.015;
      } else if (curEmotion === 'happy') {
        browY += 0.02;
      }
      leftBrow.position.y = browY;
      rightBrow.position.y = browY + (curEmotion === 'thinking' ? 0.025 : 0);
      leftBrow.rotation.z = -browTilt;
      rightBrow.rotation.z = browTilt;

      // Movimento de Cabeça e Gestos Corporais
      let headPitch = Math.sin(t * 1.6) * 0.03 - pointerY * 0.12;
      let headYaw = pointerX * 0.22 + (curAvatar.visual3D.autoRotateIdle ? Math.sin(t * 0.7) * 0.08 : 0);
      let headRoll = Math.sin(t * 0.9) * 0.025;

      if (curGesture === 'nod' || v.energy > 0.25) {
        headPitch += Math.sin(t * 6.5) * (0.04 + v.energy * 0.06);
      }
      if (curEmotion === 'thinking') {
        headRoll += 0.09;
      }

      headGroup.rotation.set(headPitch, headYaw, headRoll);

      // Gestos de Braços
      if (curGesture === 'wave') {
        rightArmGroup.rotation.z = THREE.MathUtils.lerp(rightArmGroup.rotation.z, 0.85, 0.1);
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(rightArmGroup.rotation.x, -0.55, 0.1);
        rightForearmGroup.rotation.z = -0.5 + Math.sin(t * 8.0) * 0.35;
        leftArmGroup.rotation.x = THREE.MathUtils.lerp(leftArmGroup.rotation.x, 0, 0.08);
      } else if (curGesture === 'explain' || v.energy > 0.15) {
        leftArmGroup.rotation.x = THREE.MathUtils.lerp(
          leftArmGroup.rotation.x,
          -0.38 - Math.sin(t * 3.8) * 0.14,
          0.1
        );
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(
          rightArmGroup.rotation.x,
          -0.42 - Math.cos(t * 3.8) * 0.14,
          0.1
        );
        leftForearmGroup.rotation.x = -0.55;
        rightForearmGroup.rotation.x = -0.55;
        rightArmGroup.rotation.z = THREE.MathUtils.lerp(rightArmGroup.rotation.z, -0.12, 0.1);
      } else if (curGesture === 'emphasis') {
        leftArmGroup.rotation.x = THREE.MathUtils.lerp(leftArmGroup.rotation.x, -0.65, 0.12);
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(rightArmGroup.rotation.x, -0.65, 0.12);
        leftForearmGroup.rotation.x = -0.7;
        rightForearmGroup.rotation.x = -0.7;
      } else {
        leftArmGroup.rotation.x = THREE.MathUtils.lerp(leftArmGroup.rotation.x, -0.08, 0.08);
        rightArmGroup.rotation.x = THREE.MathUtils.lerp(rightArmGroup.rotation.x, -0.08, 0.08);
        rightArmGroup.rotation.z = THREE.MathUtils.lerp(rightArmGroup.rotation.z, 0, 0.08);
        leftForearmGroup.rotation.x = THREE.MathUtils.lerp(leftForearmGroup.rotation.x, -0.15, 0.08);
        rightForearmGroup.rotation.x = THREE.MathUtils.lerp(rightForearmGroup.rotation.x, -0.15, 0.08);
        rightForearmGroup.rotation.z = THREE.MathUtils.lerp(rightForearmGroup.rotation.z, 0, 0.08);
      }

      // Respiração natural e pulsação do núcleo
      torsoGroup.position.y = Math.sin(t * 1.9) * 0.018;
      coreBadge.rotation.y = t * 1.4;
      coreBadge.scale.setScalar(1 + v.energy * 0.45);
      holoRing.rotation.z = t * 0.4;
      holoRing.scale.setScalar(1 + v.energy * 0.12);

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="stage-canvas-layer" id="avatar-canvas-3d" />;
};
