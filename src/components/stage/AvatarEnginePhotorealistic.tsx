import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  AvatarProfile,
  EmotionState,
  GestureState,
  PhotoFaceLandmarks,
  VisemeWeights,
} from '../../types/avatar';
import { HELENA_LANDMARKS, MARCUS_LANDMARKS, SAMIA_LANDMARKS } from '../../data/defaultAvatars';

interface Props {
  avatar: AvatarProfile;
  emotion: EmotionState;
  gesture: GestureState;
  getVisemes: (dt: number) => VisemeWeights;
}

export function resolveAvatarLandmarks(avatar: AvatarProfile): PhotoFaceLandmarks {
  if (avatar.visualPhoto.landmarks) {
    return avatar.visualPhoto.landmarks;
  }
  if (
    avatar.visualPhoto.presetId === 'samia' ||
    avatar.visualPhoto.portraitUrl.includes('samia')
  ) {
    return SAMIA_LANDMARKS;
  }
  if (
    avatar.visualPhoto.presetId === 'marcus' ||
    avatar.visualPhoto.portraitUrl.includes('marcus')
  ) {
    return MARCUS_LANDMARKS;
  }
  return HELENA_LANDMARKS;
}

/**
 * Analisa uma imagem de retrato (caso o usuário envie uma foto customizada)
 * para localizar automaticamente a região dos olhos (vales de luminância)
 * e a linha dos lábios (pico de crominância vermelha e contraste horizontal).
 */
export function detectLandmarksFromImageElement(img: HTMLImageElement): PhotoFaceLandmarks {
  try {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return HELENA_LANDMARKS;

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const lumAt = (x: number, y: number) => {
      const idx = (Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))) * 4;
      return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    };

    const lipScoreAt = (x: number, y: number) => {
      const idx = (Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const redness = r - 0.65 * g - 0.35 * b;
      const vGrad = Math.abs(lumAt(x, y + 2) - lumAt(x, y - 2));
      return redness * 1.4 + vGrad * 0.9 - lumAt(x, y) * 0.25;
    };

    // 1. Busca Olho Esquerdo (u em [0.36..0.48], v em [0.25..0.42])
    let bestLeftU = 0.438;
    let bestLeftV = 0.325;
    let bestLeftScore = -Infinity;
    for (let y = Math.floor(size * 0.26); y <= Math.floor(size * 0.41); y++) {
      for (let x = Math.floor(size * 0.37); x <= Math.floor(size * 0.475); x++) {
        const centerLum = lumAt(x, y);
        const surroundLum =
          (lumAt(x, y - 6) + lumAt(x, y + 6) + lumAt(x - 6, y) + lumAt(x + 6, y)) * 0.25;
        const contrast = surroundLum - centerLum;
        if (contrast > bestLeftScore) {
          bestLeftScore = contrast;
          bestLeftU = x / size;
          bestLeftV = y / size;
        }
      }
    }

    // 2. Busca Olho Direito (u em [0.52..0.64], v próximo ao olho esquerdo)
    let bestRightU = 0.571;
    let bestRightV = bestLeftV;
    let bestRightScore = -Infinity;
    const minRY = Math.max(Math.floor(size * 0.26), Math.floor(bestLeftV * size) - 8);
    const maxRY = Math.min(Math.floor(size * 0.42), Math.floor(bestLeftV * size) + 8);
    for (let y = minRY; y <= maxRY; y++) {
      for (let x = Math.floor(size * 0.525); x <= Math.floor(size * 0.63); x++) {
        const centerLum = lumAt(x, y);
        const surroundLum =
          (lumAt(x, y - 6) + lumAt(x, y + 6) + lumAt(x - 6, y) + lumAt(x + 6, y)) * 0.25;
        const contrast = surroundLum - centerLum;
        if (contrast > bestRightScore) {
          bestRightScore = contrast;
          bestRightU = x / size;
          bestRightV = y / size;
        }
      }
    }

    const eyeMidU = (bestLeftU + bestRightU) * 0.5;
    const eyeMidV = (bestLeftV + bestRightV) * 0.5;
    const eyeSpan = Math.max(0.09, Math.min(0.18, bestRightU - bestLeftU));

    // 3. Busca Linha Central da Boca abaixo dos olhos
    let bestMouthV = Math.min(0.56, eyeMidV + eyeSpan * 1.12);
    let bestMouthScore = -Infinity;
    const minMY = Math.floor(size * Math.max(0.41, eyeMidV + 0.1));
    const maxMY = Math.floor(size * Math.min(0.58, eyeMidV + 0.22));
    const centerX = Math.floor(eyeMidU * size);

    for (let y = minMY; y <= maxMY; y++) {
      let rowScore = 0;
      for (let dx = -10; dx <= 10; dx += 2) {
        rowScore += lipScoreAt(centerX + dx, y);
      }
      if (rowScore > bestMouthScore) {
        bestMouthScore = rowScore;
        bestMouthV = y / size;
      }
    }

    return {
      leftEye: {
        u: Number(bestLeftU.toFixed(3)),
        v: Number(bestLeftV.toFixed(3)),
        radiusX: Number((eyeSpan * 0.24).toFixed(3)),
        radiusY: 0.015,
      },
      rightEye: {
        u: Number(bestRightU.toFixed(3)),
        v: Number(bestRightV.toFixed(3)),
        radiusX: Number((eyeSpan * 0.24).toFixed(3)),
        radiusY: 0.015,
      },
      noseTip: {
        u: Number(eyeMidU.toFixed(3)),
        v: Number(((eyeMidV + bestMouthV) * 0.51).toFixed(3)),
      },
      mouth: {
        u: Number(eyeMidU.toFixed(3)),
        v: Number(bestMouthV.toFixed(3)),
        width: Number((eyeSpan * 0.84).toFixed(3)),
        lipThickness: 0.018,
      },
      chinV: Number(Math.min(0.66, bestMouthV + eyeSpan * 0.68).toFixed(3)),
    };
  } catch {
    return HELENA_LANDMARKS;
  }
}

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying float vRelief;

  uniform vec2 uHeadTurn;
  uniform float uBreath;
  uniform vec2 uNoseCenter;
  uniform vec2 uMouthCenter;
  uniform float uJawOpen;

  void main() {
    vUv = uv;
    // Coordenadas de imagem (u: 0..1 esquerda->direita, v: 0..1 topo->base)
    vec2 imgUv = vec2(uv.x, 1.0 - uv.y);

    // Máscara suave que mantém as bordas externas do retrato 100% ancoradas
    vec2 centered = (imgUv - 0.5) * 2.0;
    float edgeDist = max(abs(centered.x), abs(centered.y));
    float edgeMask = smoothstep(0.98, 0.35, edgeDist);

    // Relevo anatômico suave da cabeça e nariz para paralaxe natural 2.5D
    vec2 faceDelta = (imgUv - vec2(uNoseCenter.x, uNoseCenter.y - 0.02)) / vec2(0.24, 0.30);
    float headVolume = exp(-dot(faceDelta, faceDelta) * 1.45) * 0.14;

    vec2 noseDelta = (imgUv - uNoseCenter) / vec2(0.055, 0.075);
    float noseRelief = exp(-dot(noseDelta, noseDelta) * 2.2) * 0.045;

    // Movimento sutil do queixo em Z ao abrir a boca
    vec2 chinDelta = (imgUv - vec2(uMouthCenter.x, uMouthCenter.y + 0.04)) / vec2(0.09, 0.07);
    float chinRelief = exp(-dot(chinDelta, chinDelta) * 1.8) * uJawOpen * 0.018;

    float relief = (headVolume + noseRelief + chinRelief) * edgeMask;
    vRelief = relief;

    vec3 pos = position;
    // Paralaxe 2.5D orgânica controlada pelo giro da cabeça e respiração
    pos.x += uHeadTurn.x * relief * 1.35;
    pos.y += uHeadTurn.y * relief * 1.25 + uBreath * smoothstep(0.45, 0.92, imgUv.y) * edgeMask;
    pos.z += relief;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 vUv;
  varying float vRelief;

  uniform sampler2D uMap;
  uniform vec4 uLeftEye;   // x: u, y: v, z: radiusX, w: radiusY
  uniform vec4 uRightEye;  // x: u, y: v, z: radiusX, w: radiusY
  uniform vec4 uMouth;     // x: u, y: v (linha labial), z: width, w: lipThickness
  uniform float uChinV;

  uniform float uJawOpen;
  uniform float uMouthWide;
  uniform float uMouthRound;
  uniform float uSmile;
  uniform float uBlink;
  uniform float uBrowLift;
  uniform vec2 uGaze;
  uniform float uWarpScale;

  // Calcula deformação de um olho (piscar de pálpebra superior, linha de cílios, íris/olhar e sobrancelha)
  void applyEyeAndBrow(
    vec2 p,
    vec4 eye,
    float blink,
    float browLift,
    vec2 gaze,
    inout vec2 sampleP,
    inout float lashShadow,
    inout float eyelidShade,
    inout float eyeSpecBoost
  ) {
    vec2 center = eye.xy;
    float rx = max(0.018, eye.z);
    float ry = max(0.009, eye.w);

    // 1. Movimento suave da Sobrancelha (localizada ~0.033 acima do centro do olho)
    vec2 browCenter = vec2(center.x, center.y - ry * 2.25);
    vec2 bd = (p - browCenter) / vec2(rx * 1.55, ry * 1.55);
    float browMask = exp(-dot(bd, bd) * 1.85);
    sampleP.y += browLift * 0.011 * browMask;

    // 2. Coordenadas locais normalizadas do olho
    vec2 ed = (p - center) / vec2(rx, ry);
    if (abs(ed.x) < 1.35 && abs(ed.y) < 1.85) {
      float arch = max(0.0, 1.0 - ed.x * ed.x * 0.88);
      float upperRest = -0.92 * arch;
      float lowerRest = 0.86 * arch;

      // Posição atual da borda da pálpebra superior e leve subida da inferior ao piscar
      float closeAmount = clamp(blink * 1.06, 0.0, 1.0);
      float upperLidY = mix(upperRest, lowerRest * 0.82, closeAmount);
      float lowerLidY = mix(lowerRest, upperRest * 0.15, closeAmount * 0.22);

      float horizMask = smoothstep(1.22, 0.72, abs(ed.x));

      if (closeAmount > 0.015 && ed.y >= upperRest - 0.45 && ed.y <= upperLidY + 0.18) {
        // Região coberta pela pálpebra superior descendo:
        // Amostra a pele real logo acima da dobra palpebral para manter textura e tom de pele idênticos
        float lidT = clamp((ed.y - upperRest) / max(0.12, upperLidY - upperRest), 0.0, 1.0);
        float skinSourceV = center.y - ry * mix(1.42, 0.92, lidT);
        sampleP.y = mix(sampleP.y, skinSourceV, horizMask * smoothstep(0.0, 0.12, closeAmount));

        // Sombra suave da dobra superior e sombreamento esférico da pálpebra fechada
        eyelidShade += horizMask * sin(lidT * 3.14159) * 0.08 * closeAmount;

        // Linha natural dos cílios na margem inferior da pálpebra em movimento
        float lashDist = abs(ed.y - upperLidY);
        float lashLine = smoothstep(0.26, 0.0, lashDist) * horizMask * smoothstep(0.04, 0.25, closeAmount);
        lashShadow = max(lashShadow, lashLine * 0.62);
      } else if (ed.y > upperLidY && ed.y < lowerLidY) {
        // Área aberta do globo ocular: movimentação sutil da íris/pupila (saccades + foco)
        float irisDist = length(ed * vec2(1.05, 0.95));
        float irisMask = smoothstep(0.88, 0.22, irisDist) * (1.0 - closeAmount * 0.9);
        sampleP -= gaze * vec2(rx * 0.34, ry * 0.42) * irisMask;

        // Realce sutil do brilho corneano (catchlight) quando o olho está aberto
        float catchDist = length(ed - vec2(-0.18, -0.22) - gaze * 0.25);
        eyeSpecBoost += smoothstep(0.28, 0.04, catchDist) * (1.0 - closeAmount) * 0.045;
      }
    }
  }

  void main() {
    // p em coordenadas de imagem (u: 0..1 esquerda->direita, v: 0..1 topo->base)
    vec2 p = vec2(vUv.x, 1.0 - vUv.y);
    vec2 sampleP = p;

    float lashShadow = 0.0;
    float eyelidShade = 0.0;
    float eyeSpecBoost = 0.0;

    // 1. Animação Anatômica dos Olhos e Sobrancelhas nas Coordenadas Exatas
    applyEyeAndBrow(
      p,
      uLeftEye,
      uBlink,
      uBrowLift,
      uGaze,
      sampleP,
      lashShadow,
      eyelidShade,
      eyeSpecBoost
    );
    applyEyeAndBrow(
      p,
      uRightEye,
      uBlink,
      uBrowLift,
      uGaze,
      sampleP,
      lashShadow,
      eyelidShade,
      eyeSpecBoost
    );

    // 2. Animação Anatômica da Boca, Lábios, Mandíbula e Cavidade Oral
    vec2 mouthCenter = uMouth.xy;
    float halfW = max(0.032, uMouth.z * 0.5);
    float lipThick = max(0.012, uMouth.w);

    // Coordenada horizontal normalizada em relação à largura da boca (-1 = canto esq, +1 = canto dir)
    float mx = (p.x - mouthCenter.x) / halfW;
    float absMx = abs(mx);

    // Curva da linha labial (sorriso curva os cantos sutilmente para cima)
    float smileTotal = clamp(uSmile + uMouthWide * 0.35, -0.2, 1.0);
    float cornerCurve = -smileTotal * 0.0065 * clamp(mx * mx, 0.0, 1.3);
    float seamV = mouthCenter.y + cornerCurve;

    // Abertura efetiva escalada pela configuração do usuário
    float jawOpen = clamp(uJawOpen * uWarpScale, 0.0, 1.15);

    // Perfil horizontal da abertura labial (lábios se separam no centro e convergem nos cantos)
    float horizLipMask = max(0.0, 1.0 - mx * mx);
    // Vogais arredondadas (O/U) concentram a abertura no centro; vogais abertas distribuem mais
    float profilePower = mix(1.32, 1.85, clamp(uMouthRound, 0.0, 1.0));
    float lipOpenProfile = pow(horizLipMask, profilePower);

    // Quanto o lábio superior sobe e quanto o lábio inferior/mandíbula desce na linha central
    float upperAperture = jawOpen * 0.0055 * lipOpenProfile;
    float lowerAperture = jawOpen * 0.0215 * lipOpenProfile;

    // Compressão/expansão horizontal dos cantos da boca (vogais largas A/E/I vs arredondadas O/U)
    vec2 mouthRegionDelta = (p - mouthCenter) / vec2(halfW * 1.65, lipThick * 3.2);
    float mouthRegionMask = exp(-dot(mouthRegionDelta, mouthRegionDelta) * 1.45);
    float horizStretch = (uMouthWide * 0.095 + smileTotal * 0.055 - uMouthRound * 0.115) * uWarpScale;
    sampleP.x -= (p.x - mouthCenter.x) * horizStretch * mouthRegionMask;

    // Elevação sutil das maçãs do rosto / cantos ao sorrir ou falar
    vec2 cheekDelta = (p - vec2(mouthCenter.x, mouthCenter.y - 0.025)) / vec2(halfW * 2.1, 0.055);
    float cheekMask = exp(-dot(cheekDelta, cheekDelta) * 1.6) * smoothstep(0.2, 0.9, absMx);
    sampleP.y += smileTotal * 0.0045 * cheekMask;

    // Deslocamento coeso da mandíbula inferior e queixo (entre a linha labial e a ponta do queixo)
    float chinSpan = max(0.055, uChinV - mouthCenter.y);
    if (p.y >= seamV - upperAperture * 1.8 && p.y <= uChinV + 0.065) {
      float jawHorizMask = exp(-pow((p.x - mouthCenter.x) / (halfW * 1.48), 2.0) * 1.35);
      if (p.y < seamV) {
        // Lábio superior sobe levemente sem afetar o nariz
        float upperZoneMask = smoothstep(seamV - lipThick * 2.1, seamV, p.y);
        sampleP.y += upperAperture * upperZoneMask * jawHorizMask;
      } else {
        // Lábio inferior e queixo descem juntos como uma estrutura anatômica sólida
        float jawVertT = (p.y - seamV) / chinSpan;
        float jawDropMask = smoothstep(1.38, 0.15, jawVertT) * jawHorizMask;
        float localDrop = mix(lowerAperture, jawOpen * 0.0175 * jawHorizMask, clamp(jawVertT * 0.85, 0.0, 1.0));
        sampleP.y -= localDrop * jawDropMask;
      }
    }

    // Amostra a textura da foto na posição deformada (convertendo de volta para UV do Three.js)
    vec4 photoCol = texture2D(uMap, vec2(sampleP.x, 1.0 - sampleP.y));
    vec3 finalRgb = photoCol.rgb;

    // Aplica sombreamento natural das pálpebras, linha de cílios e brilho ocular
    finalRgb *= (1.0 - eyelidShade);
    finalRgb = mix(finalRgb, vec3(0.08, 0.05, 0.05), lashShadow);
    finalRgb += vec3(eyeSpecBoost);

    // 3. Síntese Fotorrealista da Cavidade Oral Interna quando os lábios se separam
    float topEdge = seamV - upperAperture;
    float botEdge = seamV + lowerAperture;
    float gapHeight = botEdge - topEdge;

    if (absMx < 0.98 && gapHeight > 0.0012 && p.y > topEdge && p.y < botEdge) {
      // Posição vertical normalizada dentro da abertura da boca (-1 = topo, +1 = base)
      float openT = ((p.y - topEdge) / gapHeight) * 2.0 - 1.0;

      // Amostra a cor real do lábio na linha de contato para mesclar a borda interna perfeitamente
      vec3 innerLipTint = texture2D(uMap, vec2(sampleP.x, 1.0 - seamV)).rgb * 0.72;

      // Fundo escuro profundo da cavidade oral com oclusão nos cantos
      float cornerDarken = smoothstep(0.25, 0.95, absMx);
      vec3 cavityColor = vec3(0.11, 0.038, 0.048) * (1.0 - cornerDarken * 0.55);

      // Dentes superiores sutis e naturais na parte superior da abertura quando a boca abre
      float teethVis = smoothstep(0.005, 0.014, gapHeight) * (1.0 - cornerDarken * 0.75);
      if (openT > -0.78 && openT < -0.08 && teethVis > 0.01) {
        float toothBand = smoothstep(-0.78, -0.52, openT) * smoothstep(-0.08, -0.28, openT);
        // Micro-variação sutil entre os dentes para realismo fotográfico
        float toothGroove = 0.94 + 0.06 * cos(mx * 18.0);
        // Sombra projetada pelo lábio superior sobre os dentes
        float upperLipShadow = smoothstep(-0.78, -0.35, openT) * 0.35 + 0.65;
        vec3 teethCol = vec3(0.86, 0.83, 0.79) * toothGroove * upperLipShadow;
        cavityColor = mix(cavityColor, teethCol, toothBand * teethVis * 0.82);
      }

      // Reflexo orgânico sutil da língua na base da cavidade oral
      if (openT > 0.15) {
        float tongueMask = smoothstep(0.15, 0.55, openT) * smoothstep(0.95, 0.55, openT) * (1.0 - absMx * 0.7);
        cavityColor = mix(cavityColor, vec3(0.34, 0.13, 0.15), tongueMask * 0.55);
      }

      // Transição suave (anti-aliased) entre a borda interna dos lábios e o interior da boca
      float cavityBlend = smoothstep(0.98, 0.56, abs(openT)) * smoothstep(0.98, 0.78, absMx);
      vec3 mouthInterior = mix(innerLipTint, cavityColor, smoothstep(0.95, 0.45, abs(openT)));
      finalRgb = mix(finalRgb, mouthInterior, cavityBlend);
    }

    // Sombra suave sob o lábio inferior quando a mandíbula abre
    if (absMx < 0.95 && p.y >= botEdge && p.y < botEdge + 0.018 && jawOpen > 0.05) {
      float underLipDist = (p.y - botEdge) / 0.018;
      float underShadow = (1.0 - underLipDist) * horizLipMask * jawOpen * 0.12;
      finalRgb *= (1.0 - underShadow);
    }

    gl_FragColor = vec4(finalRgb, photoCol.a);
  }
`;

export const AvatarEnginePhotorealistic: React.FC<Props> = ({
  avatar,
  emotion,
  gesture,
  getVisemes,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ avatar, emotion, gesture, getVisemes });
  const loadedUrlRef = useRef<string>('');
  const autoLandmarksRef = useRef<PhotoFaceLandmarks | null>(null);

  useEffect(() => {
    stateRef.current = { avatar, emotion, gesture, getVisemes };
  }, [avatar, emotion, gesture, getVisemes]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      30,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100
    );
    camera.position.set(0, 0, 4.25);

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
      container.innerHTML = `<img src="${avatar.visualPhoto.portraitUrl || 'avatars/helena.jpg'}" style="max-height:85%;border-radius:16px;object-fit:contain;" alt="${avatar.name}" />`;
      return;
    }

    const initialLandmarks = resolveAvatarLandmarks(avatar);
    const textureLoader = new THREE.TextureLoader();
    const initialUrl = avatar.visualPhoto.portraitUrl || 'avatars/helena.jpg';
    loadedUrlRef.current = initialUrl;

    const portraitTex = textureLoader.load(initialUrl, (tex) => {
      if (
        stateRef.current.avatar.visualPhoto.presetId === 'custom' &&
        !stateRef.current.avatar.visualPhoto.landmarks &&
        tex.image
      ) {
        autoLandmarksRef.current = detectLandmarksFromImageElement(tex.image);
      }
    });
    portraitTex.colorSpace = THREE.SRGBColorSpace;
    portraitTex.minFilter = THREE.LinearFilter;
    portraitTex.magFilter = THREE.LinearFilter;

    const uniforms = {
      uMap: { value: portraitTex },
      uLeftEye: {
        value: new THREE.Vector4(
          initialLandmarks.leftEye.u,
          initialLandmarks.leftEye.v,
          initialLandmarks.leftEye.radiusX ?? 0.032,
          initialLandmarks.leftEye.radiusY ?? 0.015
        ),
      },
      uRightEye: {
        value: new THREE.Vector4(
          initialLandmarks.rightEye.u,
          initialLandmarks.rightEye.v,
          initialLandmarks.rightEye.radiusX ?? 0.032,
          initialLandmarks.rightEye.radiusY ?? 0.015
        ),
      },
      uMouth: {
        value: new THREE.Vector4(
          initialLandmarks.mouth.u,
          initialLandmarks.mouth.v,
          initialLandmarks.mouth.width,
          initialLandmarks.mouth.lipThickness ?? 0.018
        ),
      },
      uNoseCenter: {
        value: new THREE.Vector2(
          initialLandmarks.noseTip?.u ?? initialLandmarks.mouth.u,
          initialLandmarks.noseTip?.v ?? 0.402
        ),
      },
      uMouthCenter: {
        value: new THREE.Vector2(initialLandmarks.mouth.u, initialLandmarks.mouth.v),
      },
      uChinV: { value: initialLandmarks.chinV },
      uJawOpen: { value: 0 },
      uMouthWide: { value: 0 },
      uMouthRound: { value: 0 },
      uSmile: { value: 0.08 },
      uBlink: { value: 0 },
      uBrowLift: { value: 0 },
      uGaze: { value: new THREE.Vector2(0, 0) },
      uHeadTurn: { value: new THREE.Vector2(0, 0) },
      uBreath: { value: 0 },
      uWarpScale: { value: avatar.visualPhoto.warpIntensity ?? 0.9 },
    };

    const planeGeo = new THREE.PlaneGeometry(2.45, 2.45, 64, 64);
    const shaderMat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
    });

    const portraitMesh = new THREE.Mesh(planeGeo, shaderMat);
    scene.add(portraitMesh);

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

    // Estados suavizados para evitar qualquer tremulação robótica
    let smoothJaw = 0;
    let smoothWide = 0;
    let smoothRound = 0;
    let smoothSmile = 0.08;
    let smoothBlink = 0;
    let smoothBrow = 0;
    let smoothGazeX = 0;
    let smoothGazeY = 0;
    let smoothHeadX = 0;
    let smoothHeadY = 0;

    // Controle de micro-movimentos oculares (saccades) e piscadas naturais
    let saccadeTargetX = 0;
    let saccadeTargetY = 0;
    let nextSaccadeTime = 1.5;
    let customBlinkTimer = 0;
    let nextBlinkInterval = 3.4;

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

      // Troca dinâmica da foto caso o usuário altere no Admin
      if (cfg.portraitUrl && cfg.portraitUrl !== loadedUrlRef.current) {
        loadedUrlRef.current = cfg.portraitUrl;
        autoLandmarksRef.current = null;
        textureLoader.load(cfg.portraitUrl, (newTex) => {
          newTex.colorSpace = THREE.SRGBColorSpace;
          newTex.minFilter = THREE.LinearFilter;
          newTex.magFilter = THREE.LinearFilter;
          uniforms.uMap.value = newTex;
          if (cfg.presetId === 'custom' && !cfg.landmarks && newTex.image) {
            autoLandmarksRef.current = detectLandmarksFromImageElement(newTex.image);
          }
        });
      }

      // Atualiza coordenadas anatômicas (Olhos, Boca, Nariz e Queixo)
      const lm =
        cfg.landmarks ||
        (cfg.presetId === 'custom' && autoLandmarksRef.current
          ? autoLandmarksRef.current
          : resolveAvatarLandmarks(curAvatar));

      uniforms.uLeftEye.value.set(
        lm.leftEye.u,
        lm.leftEye.v,
        lm.leftEye.radiusX ?? 0.032,
        lm.leftEye.radiusY ?? 0.015
      );
      uniforms.uRightEye.value.set(
        lm.rightEye.u,
        lm.rightEye.v,
        lm.rightEye.radiusX ?? 0.032,
        lm.rightEye.radiusY ?? 0.015
      );
      uniforms.uMouth.value.set(
        lm.mouth.u,
        lm.mouth.v,
        lm.mouth.width,
        lm.mouth.lipThickness ?? 0.018
      );
      uniforms.uNoseCenter.value.set(lm.noseTip?.u ?? lm.mouth.u, lm.noseTip?.v ?? 0.402);
      uniforms.uMouthCenter.value.set(lm.mouth.u, lm.mouth.v);
      uniforms.uChinV.value = lm.chinV;
      uniforms.uWarpScale.value = cfg.warpIntensity ?? 0.9;

      // 1. Suavização Orgânica da Fala (ataque rápido para sílabas, fechamento amortecido)
      const jawRate = v.jawOpen > smoothJaw ? 24.0 : 15.0;
      smoothJaw += (v.jawOpen - smoothJaw) * Math.min(1, dt * jawRate);
      smoothWide += (v.mouthWide - smoothWide) * Math.min(1, dt * 16.0);
      smoothRound += (v.mouthRound - smoothRound) * Math.min(1, dt * 16.0);

      const targetSmile =
        curEmotion === 'happy'
          ? 0.55
          : curEmotion === 'empathetic'
          ? 0.28
          : curEmotion === 'alert'
          ? -0.05
          : 0.08 + v.mouthSmile * 0.25;
      smoothSmile += (targetSmile - smoothSmile) * Math.min(1, dt * 8.0);

      // 2. Piscada Natural (combina o gerador de visemas com a cadência configurada no Admin)
      customBlinkTimer += dt;
      let proceduralBlink = 0;
      const blinkPeriod = Math.max(1.8, 6.2 - (cfg.naturalBlinkRate ?? 4.0) * 0.65);
      if (customBlinkTimer >= nextBlinkInterval) {
        const blinkPhase = (customBlinkTimer - nextBlinkInterval) / 0.19;
        if (blinkPhase <= 1.0) {
          proceduralBlink = Math.sin(blinkPhase * Math.PI);
        } else {
          customBlinkTimer = 0;
          // Ocasionalmente faz uma piscada dupla natural
          nextBlinkInterval =
            Math.random() < 0.18 ? 0.28 : blinkPeriod * (0.75 + Math.random() * 0.55);
        }
      }
      const targetBlink = Math.max(v.eyeBlink, proceduralBlink);
      const blinkRate = targetBlink > smoothBlink ? 32.0 : 22.0;
      smoothBlink += (targetBlink - smoothBlink) * Math.min(1, dt * blinkRate);

      // 3. Micro-movimentos Oculares (Saccades) + Acompanhamento Suave do Usuário
      if (t >= nextSaccadeTime) {
        nextSaccadeTime = t + 1.4 + Math.random() * 2.2;
        if (curEmotion === 'thinking') {
          saccadeTargetX = (Math.random() - 0.3) * 0.45;
          saccadeTargetY = -0.25 - Math.random() * 0.2;
        } else {
          // Olhar focado no interlocutor alternando entre olhos e centro do rosto
          saccadeTargetX = (Math.random() - 0.5) * 0.28;
          saccadeTargetY = (Math.random() - 0.5) * 0.18;
        }
      }
      const targetGazeX = Math.max(-0.65, Math.min(0.65, pointerX * 0.35 + saccadeTargetX));
      const targetGazeY = Math.max(-0.5, Math.min(0.5, -pointerY * 0.25 + saccadeTargetY));
      smoothGazeX += (targetGazeX - smoothGazeX) * Math.min(1, dt * 14.0);
      smoothGazeY += (targetGazeY - smoothGazeY) * Math.min(1, dt * 14.0);

      // 4. Expressão de Sobrancelhas
      const emotionBrow =
        curEmotion === 'surprised'
          ? 0.65
          : curEmotion === 'empathetic'
          ? 0.32
          : curEmotion === 'thinking'
          ? 0.22
          : curEmotion === 'alert'
          ? -0.25
          : 0.0;
      const targetBrow = Math.max(-0.4, Math.min(1.0, v.browLift * 0.65 + emotionBrow));
      smoothBrow += (targetBrow - smoothBrow) * Math.min(1, dt * 10.0);

      // 5. Postura Natural da Cabeça 2.5D (sem distorção exagerada)
      const motionScale = cfg.headMotionScale ?? 0.8;
      const speechNod = v.energy > 0.12 ? Math.sin(t * 6.2) * 0.018 * v.energy : 0;
      const gestureNod = curGesture === 'nod' ? Math.sin(t * 7.5) * 0.032 : 0;

      const targetHeadX = (pointerX * 0.055 + Math.sin(t * 0.75) * 0.018) * motionScale;
      const targetHeadY =
        (pointerY * 0.042 + Math.cos(t * 1.15) * 0.012 + speechNod + gestureNod) * motionScale;

      smoothHeadX += (targetHeadX - smoothHeadX) * Math.min(1, dt * 6.0);
      smoothHeadY += (targetHeadY - smoothHeadY) * Math.min(1, dt * 6.0);

      uniforms.uJawOpen.value = smoothJaw;
      uniforms.uMouthWide.value = smoothWide;
      uniforms.uMouthRound.value = smoothRound;
      uniforms.uSmile.value = smoothSmile;
      uniforms.uBlink.value = smoothBlink;
      uniforms.uBrowLift.value = smoothBrow;
      uniforms.uGaze.value.set(smoothGazeX, smoothGazeY);
      uniforms.uHeadTurn.value.set(smoothHeadX, smoothHeadY);
      uniforms.uBreath.value = Math.sin(t * 1.95) * 0.0065;

      // Rotação 3D muito sutil do plano como um retrato vivo em estúdio
      portraitMesh.rotation.y = smoothHeadX * 0.45;
      portraitMesh.rotation.x = -smoothHeadY * 0.45;
      portraitMesh.rotation.z = Math.sin(t * 0.55) * 0.006 * motionScale;

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      planeGeo.dispose();
      shaderMat.dispose();
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
