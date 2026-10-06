// Ember, the 3D dragon pet on the portfolio pages.
// Source for /pet.js. Edit this file, then run `npm run pet` to rebuild the bundle (three.js included).
//
// The dragon is built from code, not a model file: a chain of joints that follows the head
// (so the body slithers and coils), a tube mesh rebuilt around that chain every frame, blade fins,
// a horned head, ribbons with their own trailing physics, embers, shockwaves and bloom.
// Everything is in screen pixels: at depth 0, one world unit is one CSS pixel, with y pointing up.
// The canvas is opaque black and blended onto the page with `mix-blend-mode: screen`, so black is
// invisible and the glow lights up whatever is underneath.
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  ConeGeometry, DirectionalLight, DoubleSide, ExtrudeGeometry, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, PointLight, Points, Scene, ShaderMaterial, Shape,
  SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const FOV = 30;
const N = 60; // body joints
const RS = 18; // vertices around each body ring
const M = 22; // points per ribbon
const PMAX = 600; // particles
const INTERACTIVE = 'a, button, input, textarea, select, summary, label, [role="button"], .ember-panel';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Start the pet. Returns controls, or throws if WebGL is unavailable.
 * @param {{ perch?: () => Element | null, chatRect?: () => DOMRect | null, onPoke?: () => void }} opts
 */
export function start(opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ember-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const bubble = document.createElement('div');
  bubble.className = 'ember-bubble';
  bubble.setAttribute('aria-hidden', 'true');

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    throw new Error(`Ember needs WebGL: ${err.message}`);
  }
  document.body.append(canvas, bubble);

  let W = innerWidth, H = innerHeight;
  const small = Math.min(W, H * 1.6) < 760;
  let dpr = Math.min(devicePixelRatio || 1, small ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  // Size of the dragon relative to a 1300px-wide screen.
  const S = 1.4 * clamp(Math.min(W, 1400) / 1300, 0.55, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, W / H, 10, 8000);
  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  scene.add(new AmbientLight(0x2a1012, 0.8));
  const key = new DirectionalLight(0xfff1ea, 0.9);
  key.position.set(-400, 600, 900);
  const rim = new DirectionalLight(0xff2a18, 4);
  rim.position.set(500, 250, -700);
  const under = new DirectionalLight(0xff4a30, 1.2);
  under.position.set(0, -600, 300);
  const headLight = new PointLight(0xff3018, 2.2, 240 * S, 0);
  scene.add(key, rim, under, headLight);

  /* ---------- Textures, drawn once on 2D canvases ---------- */
  const paint = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // Body glow map. u runs head to tail, v runs around the body (0 = back, 0.25/0.75 = sides, 0.5 = belly).
  const bodyGlow = paint(1024, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const segs = 15;
    for (let s = 0; s < segs; s++) {
      const x = ((s + 0.5) / segs) * w;
      g.fillStyle = '#ff3a26';
      g.fillRect(x - 1.5, 0, 3, h); // ring seam between plates
      g.strokeStyle = '#ff4630';
      g.lineWidth = 5;
      for (const y of [h * 0.25, h * 0.75]) { // glowing oval markings on both flanks
        g.beginPath();
        g.ellipse(x + w / segs / 2, y, 15, 11, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.fillStyle = '#ff2a18';
    g.fillRect(0, 0, w, 3); // dorsal line
    g.fillRect(0, h - 3, w, 3);
  });
  // Ribbon: a glowing band with a chain of oval links, like the art.
  const ribbonTex = paint(512, 64, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,40,24,0)');
    grad.addColorStop(0.3, 'rgba(255,40,24,0.9)');
    grad.addColorStop(0.5, 'rgba(255,170,140,1)');
    grad.addColorStop(0.7, 'rgba(255,40,24,0.9)');
    grad.addColorStop(1, 'rgba(255,40,24,0)');
    g.fillStyle = grad;
    g.fillRect(0, h * 0.3, w, h * 0.4);
    g.strokeStyle = 'rgba(255,90,60,1)';
    g.lineWidth = 6;
    for (let x = 90; x < 330; x += 46) {
      g.clearRect(x - 18, h * 0.18, 36, h * 0.64);
      g.beginPath();
      g.ellipse(x, h / 2, 16, 18, 0, 0, Math.PI * 2);
      g.stroke();
    }
  });

  /* ---------- Materials ---------- */
  const bodyMat = new MeshPhysicalMaterial({
    color: 0x050303, metalness: 0.15, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18,
    emissive: 0xff2414, emissiveMap: bodyGlow, emissiveIntensity: 1.1, envMapIntensity: 0.14,
  });
  const bladeMat = new MeshPhysicalMaterial({
    color: 0x2a0606, metalness: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1,
    emissive: 0xff1c0c, emissiveIntensity: 0.3, envMapIntensity: 0.35,
  });
  const hotMat = new MeshBasicMaterial({ color: new Color(1.5, 0.16, 0.1), toneMapped: false });
  const eyeMat = new MeshBasicMaterial({ color: new Color(2, 0.4, 0.3), toneMapped: false });
  const ribbonMat = new MeshBasicMaterial({
    map: ribbonTex, color: new Color(1.2, 0.3, 0.25), transparent: true, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, toneMapped: false,
  });

  /* ---------- Shared blade geometry (fins, horns, frills, ribbon tips) ---------- */
  // A curved blade in the XY plane, pointing +X, thin along Z.
  const blade = (len, wid, curve = 0.25) => {
    const s = new Shape();
    s.moveTo(0, -wid / 2);
    s.quadraticCurveTo(len * 0.5, -wid * (0.5 + curve), len, wid * curve);
    s.quadraticCurveTo(len * 0.45, wid * 0.1, 0, wid / 2);
    s.lineTo(0, -wid / 2);
    const g = new ExtrudeGeometry(s, { depth: 1.2 * S, bevelEnabled: true, bevelThickness: 0.8 * S, bevelSize: 0.7 * S, bevelSegments: 1, curveSegments: 10 });
    g.translate(0, 0, -0.6 * S);
    return g;
  };

  /* ---------- Body: joints + a tube rebuilt every frame ---------- */
  const SEG = 8.6 * S;
  const radius = (i) => {
    const t = i / (N - 1);
    return S * (t < 0.12 ? 11 + 5 * (t / 0.12) : 3 + 13 * (1 - (t - 0.12) / 0.88) ** 1.3);
  };
  const R = Array.from({ length: N }, (_, i) => radius(i));
  const J = Array.from({ length: N }, () => new Vector3());
  const TN = Array.from({ length: N }, () => new Vector3()); // tangent (toward head)
  const NN = Array.from({ length: N }, () => new Vector3()); // normal (the back)
  const BN = Array.from({ length: N }, () => new Vector3()); // binormal (a flank)

  const vcount = N * (RS + 1);
  const bodyGeo = new BufferGeometry();
  const bPos = new Float32Array(vcount * 3);
  const bNor = new Float32Array(vcount * 3);
  const bUv = new Float32Array(vcount * 2);
  const bIdx = [];
  for (let i = 0; i < N; i++) {
    for (let k = 0; k <= RS; k++) {
      const v = i * (RS + 1) + k;
      bUv[v * 2] = i / (N - 1);
      bUv[v * 2 + 1] = k / RS;
      if (i < N - 1 && k < RS) {
        const a = v, b = v + RS + 1;
        bIdx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  bodyGeo.setIndex(bIdx);
  bodyGeo.setAttribute('position', new BufferAttribute(bPos, 3));
  bodyGeo.setAttribute('normal', new BufferAttribute(bNor, 3));
  bodyGeo.setAttribute('uv', new BufferAttribute(bUv, 2));
  const body = new Mesh(bodyGeo, bodyMat);
  body.frustumCulled = false;
  scene.add(body);

  const up = new Vector3(0, 1, 0);
  const tmp = new Vector3(), tmp2 = new Vector3(), tmp3 = new Vector3();
  const updateBody = () => {
    for (let i = 0; i < N; i++) {
      const T = TN[i];
      if (i === 0) T.subVectors(J[0], J[1]);
      else if (i === N - 1) T.subVectors(J[N - 2], J[N - 1]);
      else T.subVectors(J[i - 1], J[i + 1]);
      T.normalize();
      // Parallel transport: carry the previous ring's normal along, so the body never twists.
      const prev = i === 0 ? (Math.abs(T.y) < 0.95 ? up : tmp3.set(1, 0, 0)) : NN[i - 1];
      NN[i].copy(prev).addScaledVector(T, -prev.dot(T)).normalize();
      BN[i].crossVectors(T, NN[i]);
      const r = R[i];
      for (let k = 0; k <= RS; k++) {
        const a = (k / RS) * Math.PI * 2;
        tmp.copy(NN[i]).multiplyScalar(Math.cos(a)).addScaledVector(BN[i], Math.sin(a));
        const v = (i * (RS + 1) + k) * 3;
        bNor[v] = tmp.x; bNor[v + 1] = tmp.y; bNor[v + 2] = tmp.z;
        bPos[v] = J[i].x + tmp.x * r; bPos[v + 1] = J[i].y + tmp.y * r; bPos[v + 2] = J[i].z + tmp.z * r;
      }
    }
    bodyGeo.attributes.position.needsUpdate = true;
    bodyGeo.attributes.normal.needsUpdate = true;
  };

  /* ---------- Fins: placed on the body's frame every frame ---------- */
  const fins = [];
  const addFin = (joint, kind, side, len, wid, mat = bladeMat) => {
    const m = new Mesh(blade(len * S, wid * S), mat);
    scene.add(m);
    fins.push({ m, joint, kind, side, ph: Math.random() * 6 });
  };
  addFin(7, 'side', 1, 62, 26); addFin(7, 'side', -1, 62, 26); // the big front "arrow" fins
  addFin(31, 'side', 1, 44, 20); addFin(31, 'side', -1, 44, 20);
  for (const j of [12, 22, 33, 44]) addFin(j, 'back', 1, 30, 18);
  addFin(N - 1, 'tail', 1, 46, 20); addFin(N - 1, 'tail', -1, 46, 20); addFin(N - 1, 'tip', 1, 34, 14, hotMat);
  const mat4 = new Matrix4(), fx = new Vector3(), fy = new Vector3(), fz = new Vector3();
  const updateFins = (t) => {
    for (const f of fins) {
      const i = f.joint, T = TN[i];
      let out;
      if (f.kind === 'side') out = tmp2.copy(BN[i]).multiplyScalar(f.side).addScaledVector(NN[i], 0.35 + Math.sin(t * 2.4 + f.ph) * 0.35);
      else if (f.kind === 'back') out = tmp2.copy(NN[i]);
      else if (f.kind === 'tail') out = tmp2.copy(NN[i]).multiplyScalar(f.side);
      else out = tmp2.set(0, 0, 0);
      // Blades sweep back along the body and out from it.
      fx.copy(T).multiplyScalar(f.kind === 'tip' ? -1 : -0.8).addScaledVector(out, f.kind === 'tip' ? 0 : 0.6).normalize();
      fz.crossVectors(fx, f.kind === 'back' || f.kind === 'tail' ? BN[i] : NN[i]).normalize();
      fy.crossVectors(fz, fx);
      mat4.makeBasis(fx, fy, fz);
      f.m.quaternion.setFromRotationMatrix(mat4);
      f.m.position.copy(J[i]).addScaledVector(out.lengthSq() ? out.normalize() : out, R[i] * 0.7);
    }
  };

  /* ---------- Head ---------- */
  const head = new Group();
  scene.add(head);
  const skull = new Mesh(new SphereGeometry(1, 28, 18), bodyMat.clone());
  skull.material.emissiveMap = null;
  skull.material.emissiveIntensity = 0;
  skull.scale.set(15 * S, 11 * S, 22 * S);
  skull.position.set(0, 2 * S, 4 * S);
  const snout = new Mesh(new ConeGeometry(9.5 * S, 42 * S, 20), skull.material);
  snout.rotation.x = Math.PI / 2;
  snout.scale.set(1, 1, 0.62);
  snout.position.set(0, 1 * S, 34 * S);
  const jaw = new Group();
  jaw.position.set(0, -4 * S, 8 * S);
  const jawMesh = new Mesh(new ConeGeometry(7.5 * S, 36 * S, 16), skull.material);
  jawMesh.rotation.x = Math.PI / 2;
  jawMesh.scale.set(1, 1, 0.5);
  jawMesh.position.set(0, -2 * S, 20 * S);
  const mouthGlow = new Mesh(new ConeGeometry(6 * S, 30 * S, 12), hotMat);
  mouthGlow.rotation.x = Math.PI / 2;
  mouthGlow.scale.set(1, 1, 0.25);
  mouthGlow.position.set(0, 1 * S, 17 * S);
  jaw.add(jawMesh, mouthGlow);
  const eyes = [-1, 1].map((s) => {
    const e = new Mesh(new SphereGeometry(3 * S, 14, 10), eyeMat);
    e.scale.set(1, 0.55, 1.5);
    e.position.set(s * 9.5 * S, 6 * S, 20 * S);
    e.rotation.y = s * 0.35;
    return e;
  });
  head.add(skull, snout, jaw, ...eyes);
  // Horns sweep back, flame frills fan out from the cheeks (the art's glowing side crests).
  const part = (geo, mat, pos, rot) => {
    const m = new Mesh(geo, mat);
    m.position.set(pos[0] * S, pos[1] * S, pos[2] * S);
    m.rotation.set(...rot);
    head.add(m);
    return m;
  };
  for (const s of [-1, 1]) {
    // Blades point +X; a Y rotation of PI/2 turns that to face backward, and -s * angle splays it outward.
    part(blade(70 * S, 16 * S, 0.2), bladeMat, [s * 7, 10, 6], [0, Math.PI / 2 - s * 0.22, 0.45]);
    part(blade(44 * S, 12 * S, 0.3), bladeMat, [s * 10, 4, 0], [0, Math.PI / 2 - s * 0.5, 0.2]);
    for (let k = 0; k < 3; k++) {
      part(blade((30 - k * 5) * S, (12 - k * 2) * S, 0.35), hotMat, [s * 12, -2 - k * 4, 6 - k * 3], [0, Math.PI / 2 - s * (0.9 + k * 0.25), -0.25 - k * 0.3]);
    }
  }
  part(blade(36 * S, 12 * S, 0.25), bladeMat, [0, 13, 18], [0, Math.PI / 2, 0.25]); // nose crest

  /* ---------- Ribbons ---------- */
  const ribbons = [
    { joint: 4, out: 'B', side: 1 }, { joint: 4, out: 'B', side: -1 },
    { joint: 18, out: 'N', side: 1 }, { joint: 36, out: 'B', side: 1 }, { joint: 48, out: 'B', side: -1 },
  ].map((r, n) => {
    const pts = Array.from({ length: M }, () => new Vector3());
    const geo = new BufferGeometry();
    const pos = new Float32Array(M * 2 * 3);
    const uv = new Float32Array(M * 2 * 2);
    const idx = [];
    for (let k = 0; k < M; k++) {
      uv[k * 4] = k / (M - 1); uv[k * 4 + 1] = 0; uv[k * 4 + 2] = k / (M - 1); uv[k * 4 + 3] = 1;
      if (k < M - 1) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    const mesh = new Mesh(geo, ribbonMat);
    mesh.frustumCulled = false;
    const tip = new Mesh(blade(26 * S, 14 * S, 0.1), hotMat);
    scene.add(mesh, tip);
    return { ...r, pts, geo, pos, tip, ph: n * 1.7, len: (n < 2 ? 12 : 10) * S };
  });
  const updateRibbons = (t, dt) => {
    for (const rb of ribbons) {
      const i = rb.joint;
      const out = rb.out === 'B' ? BN[i] : NN[i];
      rb.pts[0].copy(J[i]).addScaledVector(out, rb.side * (R[i] + 2));
      for (let k = 1; k < M; k++) {
        const p = rb.pts[k], q = rb.pts[k - 1];
        // Flutter like a ribbon in water, with a slight upward drift, then hold the link length.
        p.x += Math.sin(t * 2.1 + k * 0.45 + rb.ph) * 0.9 * S * dt;
        p.y += (Math.cos(t * 1.7 + k * 0.5 + rb.ph) * 0.9 + 0.12) * S * dt;
        p.z += Math.sin(t * 1.3 + k * 0.3 + rb.ph) * 1.2 * S * dt;
        tmp.subVectors(p, q);
        const l = tmp.length() || 1;
        p.copy(q).addScaledVector(tmp, rb.len / l);
      }
      for (let k = 0; k < M; k++) {
        const a = rb.pts[Math.max(0, k - 1)], b = rb.pts[Math.min(M - 1, k + 1)];
        tmp.subVectors(b, a);
        tmp2.set(-tmp.y, tmp.x, 0); // across the ribbon, facing the camera
        const l = tmp2.length();
        if (l < 1e-4) tmp2.set(0, 1, 0); else tmp2.multiplyScalar(1 / l);
        const w = (7 - (5 * k) / M) * S;
        const p = rb.pts[k], o = k * 6;
        rb.pos[o] = p.x + tmp2.x * w; rb.pos[o + 1] = p.y + tmp2.y * w; rb.pos[o + 2] = p.z;
        rb.pos[o + 3] = p.x - tmp2.x * w; rb.pos[o + 4] = p.y - tmp2.y * w; rb.pos[o + 5] = p.z;
      }
      rb.geo.attributes.position.needsUpdate = true;
      const end = rb.pts[M - 1], before = rb.pts[M - 2];
      fx.subVectors(end, before).normalize();
      fz.set(0, 0, 1).addScaledVector(fx, -fx.z).normalize();
      fy.crossVectors(fz, fx);
      rb.tip.quaternion.setFromRotationMatrix(mat4.makeBasis(fx, fy, fz));
      rb.tip.position.copy(end);
    }
  };

  /* ---------- Particles: embers, sparks, hearts ---------- */
  const pPos = new Float32Array(PMAX * 3);
  const pSize = new Float32Array(PMAX);
  const pAlpha = new Float32Array(PMAX);
  const pVel = new Float32Array(PMAX * 3);
  const pLife = new Float32Array(PMAX);
  const pMax = new Float32Array(PMAX);
  const pGeo = new BufferGeometry();
  pGeo.setAttribute('position', new BufferAttribute(pPos, 3));
  pGeo.setAttribute('aSize', new BufferAttribute(pSize, 1));
  pGeo.setAttribute('aAlpha', new BufferAttribute(pAlpha, 1));
  const pMat = new ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: `uniform float uScale; attribute float aSize; attribute float aAlpha; varying float vA;
      void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
        vec3 c = mix(vec3(1.0, 0.16, 0.08), vec3(1.0, 0.85, 0.7), a * a);
        gl_FragColor = vec4(c * a * vA * 1.3, 1.0); }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false,
  });
  const points = new Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let pNext = 0;
  const emit = (x, y, z, vx, vy, vz, life, size) => {
    const i = pNext;
    pNext = (pNext + 1) % PMAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pLife[i] = 0; pMax[i] = life; pSize[i] = size * S;
  };
  const burst = (p, n, power = 1) => {
    for (let k = 0; k < n; k++) {
      tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 9) * power * S);
      emit(p.x, p.y, p.z, tmp.x, tmp.y, tmp.z, rand(30, 70), rand(4, 10));
    }
  };
  const updateParticles = (dt, scrollDy) => {
    for (let i = 0; i < PMAX; i++) {
      if (pLife[i] >= pMax[i]) { pAlpha[i] = 0; continue; }
      pLife[i] += dt;
      const f = 1 - pLife[i] / pMax[i];
      pVel[i * 3] *= 0.96 ** dt; pVel[i * 3 + 1] = pVel[i * 3 + 1] * 0.96 ** dt + 0.04 * dt; pVel[i * 3 + 2] *= 0.96 ** dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt + scrollDy;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pAlpha[i] = Math.min(1, f * 1.5) * Math.min(1, pLife[i] / 6);
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
  };

  /* ---------- Shockwave rings ---------- */
  const waves = Array.from({ length: 4 }, () => {
    const m = new Mesh(new TorusGeometry(1, 0.035, 8, 72), new MeshBasicMaterial({ color: new Color(1.2, 0.2, 0.12), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.visible = false;
    scene.add(m);
    return { m, life: 0, max: 1 };
  });
  const shock = (p, size = 1, delay = 0) => {
    const w = waves.find((x) => !x.m.visible) || waves[0];
    w.m.position.copy(p);
    w.life = -delay; w.max = 42; w.size = size;
    w.m.visible = true;
    w.m.scale.setScalar(0.01);
  };

  /* ---------- Bloom ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const BLOOM = 0.45;
  const bloom = new UnrealBloomPass(new Vector2(W, H), BLOOM, 0.35, 0.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let useBloom = true;

  const resize = () => {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.position.set(0, 0, H / 2 / Math.tan(MathUtils.degToRad(FOV / 2)));
    camera.far = camera.position.z + 3000;
    camera.updateProjectionMatrix();
    pMat.uniforms.uScale.value = dpr * camera.position.z;
  };
  resize();

  /* ---------- Behaviour ---------- */
  const toWorld = (sx, sy, out = new Vector3()) => out.set(sx - W / 2, H / 2 - sy, 0);
  const toScreen = (v) => {
    tmp.copy(v).project(camera);
    return { x: (tmp.x + 1) * 0.5 * W, y: (1 - tmp.y) * 0.5 * H };
  };
  const pointer = { x: W / 2, y: H / 2, t: -1e9, near: false };
  let follow = true;
  let chat = false;
  let roarAmt = 0, speakT = 0, happy = 0, saidPurr = false;
  const vel = new Vector3(-3, 0, 0);
  const target = new Vector3();

  const perch = () => {
    if (chat) {
      const r = opts.chatRect && opts.chatRect();
      if (r && r.width) {
        const narrow = W < 640;
        return narrow ? { x: W * 0.5, y: Math.max(90, r.top - 90 * S), r: 55 * S } : { x: r.left - 120 * S, y: r.top + 150, r: 55 * S };
      }
    }
    const el = opts.perch && opts.perch();
    const r = el && el.getBoundingClientRect();
    if (r && r.width && r.bottom > 80 && r.top < H - 80) return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.45, r: clamp(r.width * 0.36, 70, 190) };
    return { x: W - (W < 640 ? 90 : 150) * S, y: H - 250 * S, r: 65 * S };
  };

  // Start coiled on the perch, so the first frame already reads as a dragon.
  {
    const p = perch();
    const c = toWorld(p.x, p.y);
    for (let i = 0; i < N; i++) {
      const a = i * 0.21;
      J[i].set(c.x + Math.cos(a) * p.r * (1 - i / N * 0.4), c.y + Math.sin(a * 2) * p.r * 0.35 - i * 0.6, Math.sin(a) * p.r);
    }
    for (const rb of ribbons) rb.pts.forEach((q, k) => q.copy(J[rb.joint]).add(tmp.set(k * 3, -k * 2, 0)));
    target.copy(J[0]);
  }

  // Generous hit circles on the head and every eighth joint, in screen pixels.
  const hitDragon = (x, y) => {
    const h = toScreen(head.position);
    if ((h.x - x) ** 2 + (h.y - y) ** 2 < (40 * S) ** 2) return true;
    return [0, 8, 16, 24, 32, 40, 48].some((i) => {
      const p = toScreen(J[i]);
      return (p.x - x) ** 2 + (p.y - y) ** 2 < (R[i] + 16) ** 2;
    });
  };

  const roar = () => {
    roarAmt = 1;
    const hp = head.position;
    shock(hp, 1); shock(hp, 1.4, 8); shock(hp, 1.9, 16);
    burst(hp, 90, 1.3);
    for (let k = 0; k < 40; k++) { const i = (Math.random() * N) | 0; burst(J[i], 1, 0.6); }
  };
  let bubbleT = 0;
  const say = (text, ms = 3200) => {
    bubble.textContent = text;
    bubble.classList.add('is-on');
    bubbleT = performance.now() + ms;
    speakT = Math.min(1.6, ms / 1000);
  };

  const onMove = (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') pointer.t = performance.now();
  };
  const onDown = (e) => {
    if (e.button > 0) return;
    const onUi = e.target.closest && e.target.closest(INTERACTIVE);
    if (!onUi && hitDragon(e.clientX, e.clientY)) {
      roar();
      opts.onPoke && opts.onPoke();
      return;
    }
    // Touch has no hover: a tap on empty page calls the dragon over.
    if (!onUi && e.pointerType === 'touch') { pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = performance.now(); }
  };
  const onLeave = () => { pointer.t = -1e9; };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  /* ---------- Frame loop ---------- */
  let raf = 0, last = 0, lastScroll = scrollY, frames = 0, slowFrames = 0;
  const t0 = performance.now();
  const swim = new Vector3();
  const look = new Vector3();
  const headUp = new Vector3();

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(3, (now - last) / 16.67) : 1;
    // Quality guard: if the first ~2 seconds run slow, drop bloom and resolution.
    if (last && frames < 120) {
      frames++;
      if (now - last > 30) slowFrames++;
      if (frames === 120 && slowFrames > 60) {
        useBloom = false;
        dpr = 1;
        renderer.setPixelRatio(1);
        resize();
      }
    }
    last = now;
    const t = (now - t0) / 1000;

    // The page scrolled: the dragon gets dragged along with it, then swims back.
    const sdy = clamp(scrollY - lastScroll, -400, 400);
    lastScroll = scrollY;
    if (sdy) {
      for (const j of J) j.y += sdy * 0.7;
      for (const rb of ribbons) for (const q of rb.pts) q.y += sdy * 0.7;
    }

    // Where to go: beside the cursor while it moves, otherwise coil around the perch.
    const following = follow && !chat && now - pointer.t < 2600;
    let speed;
    if (following) {
      const side = pointer.x > W / 2 ? -1 : 1;
      toWorld(pointer.x + side * 95 * S + Math.cos(t * 1.6) * 30 * S, pointer.y - 10 + Math.sin(t * 2.1) * 34 * S, target);
      target.z = Math.sin(t * 1.3) * 70 * S;
      speed = 12 * S;
    } else {
      const p = perch();
      toWorld(p.x, p.y, target);
      // A tilted loop with a figure-eight wobble, so the body coils toward the viewer like the art.
      target.x += Math.cos(t * 0.8) * p.r * 1.15;
      target.y += Math.sin(t * 0.8) * p.r * 0.7 + Math.sin(t * 1.6) * p.r * 0.2;
      target.z = Math.sin(t * 0.8) * p.r * 1.2;
      speed = 7 * S;
    }
    speed *= 1 + roarAmt * 0.8;

    // Steer the head toward the target, with a swimming wiggle across the direction of travel.
    tmp.subVectors(target, J[0]);
    const dist = tmp.length();
    tmp.normalize().multiplyScalar(Math.min(speed, dist * 0.08 + 1.5 * S));
    vel.lerp(tmp, 0.06 * dt);
    swim.set(-vel.y, vel.x, 0);
    if (swim.lengthSq() > 1e-6) swim.normalize().multiplyScalar(Math.sin(t * 5.2) * 1.3 * S);
    J[0].addScaledVector(vel, dt).addScaledVector(swim, dt);
    if (roarAmt > 0.3) J[0].add(tmp.set(rand(-2, 2), rand(-2, 2), 0).multiplyScalar(roarAmt * S));
    J[0].z = clamp(J[0].z, -320, 240);

    // Follow the leader: every joint stays one segment behind the joint ahead of it.
    for (let i = 1; i < N; i++) {
      tmp.subVectors(J[i], J[i - 1]);
      const l = tmp.length() || 1;
      J[i].copy(J[i - 1]).addScaledVector(tmp, SEG / l);
    }
    updateBody();
    updateFins(t);
    updateRibbons(t, dt);

    // Head: faces where it swims, turns toward the cursor or the chat while being petted or talking.
    look.copy(TN[0]);
    const h = toScreen(J[0]);
    pointer.near = now - pointer.t < 1500 && (h.x - pointer.x) ** 2 + (h.y - pointer.y) ** 2 < (70 * S) ** 2;
    if (pointer.near || chat) look.lerp(tmp.set(0, 0, 1), 0.55).normalize();
    headUp.copy(NN[0]).lerp(up, 0.6).normalize();
    head.up.copy(headUp);
    head.position.copy(J[0]).addScaledVector(TN[0], 4 * S);
    head.lookAt(tmp2.copy(head.position).add(look));
    headLight.position.copy(head.position).addScaledVector(TN[0], 30 * S);

    // Petting: hovering over the head makes the eyes flare and little embers float up.
    happy = clamp(happy + (pointer.near ? 0.03 : -0.02) * dt, 0, 1);
    if (pointer.near && Math.random() < 0.25 * dt) emit(head.position.x + rand(-14, 14) * S, head.position.y + 18 * S, head.position.z, rand(-0.4, 0.4), rand(0.8, 1.6), 0, 60, rand(6, 10));
    if (happy > 0.9 && !saidPurr) { saidPurr = true; say('*happy rumble*', 1600); }
    if (!pointer.near && happy < 0.05) saidPurr = false;

    // Jaw: open wide on a roar, flap while talking.
    speakT = Math.max(0, speakT - dt / 60);
    const open = Math.max(roarAmt * 0.65, speakT > 0 ? (Math.sin(t * 20) * 0.5 + 0.5) * 0.3 : 0);
    jaw.rotation.x = MathUtils.lerp(jaw.rotation.x, open, 0.35);
    eyeMat.color.setRGB(2 + happy * 2 + roarAmt * 2, 0.4 + happy * 0.8, 0.3 + happy * 0.5);
    roarAmt = Math.max(0, roarAmt - 0.012 * dt);
    bloom.strength = BLOOM + roarAmt * 0.6 + happy * 0.2;

    // Embers come off the ribbons and the body all the time. A fractional rate carries over as a chance.
    let rate = (0.9 + roarAmt * 4) * dt;
    for (; rate > 0; rate--) {
      if (rate < 1 && Math.random() > rate) break;
      if (Math.random() < 0.5) {
        const rb = ribbons[(Math.random() * ribbons.length) | 0];
        const q = rb.pts[(Math.random() * M) | 0];
        emit(q.x, q.y, q.z, rand(-0.3, 0.3), rand(0.3, 1.1), rand(-0.3, 0.3), rand(50, 110), rand(3, 7));
      } else {
        const i = (Math.random() * N) | 0;
        tmp.copy(BN[i]).multiplyScalar(R[i] * (Math.random() < 0.5 ? 1 : -1)).add(J[i]);
        emit(tmp.x, tmp.y, tmp.z, rand(-0.3, 0.3), rand(0.3, 1.1), rand(-0.3, 0.3), rand(50, 110), rand(3, 7));
      }
    }
    updateParticles(dt, sdy);

    for (const w of waves) {
      if (!w.m.visible) continue;
      w.life += dt;
      if (w.life < 0) continue;
      const f = w.life / w.max;
      if (f >= 1) { w.m.visible = false; continue; }
      w.m.scale.setScalar((10 + f * 170) * S * w.size);
      w.m.material.opacity = (1 - f) ** 1.5;
    }

    // Speech bubble rides above the head.
    if (bubble.classList.contains('is-on')) {
      if (now > bubbleT) bubble.classList.remove('is-on');
      const hs = toScreen(head.position);
      bubble.style.setProperty('--x', `${clamp(hs.x, 110, W - 110)}px`);
      bubble.style.setProperty('--y', `${clamp(hs.y - 50 * S, 60, H - 40)}px`);
    }

    if (useBloom) composer.render(); else renderer.render(scene, camera);
  };

  const run = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; return; }
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  };
  document.addEventListener('visibilitychange', run);
  addEventListener('resize', resize);
  run();
  requestAnimationFrame(() => canvas.classList.add('is-on'));
  setTimeout(() => roar(), 350); // the summon

  return {
    roar,
    say,
    speak: (s = 1.2) => { speakT = s; },
    setChat: (open) => { chat = open; },
    setFollow: (on) => { follow = on; },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', run);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      canvas.classList.remove('is-on');
      bubble.remove();
      setTimeout(() => {
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        [bodyGlow, ribbonTex, envRT.texture].forEach((x) => x.dispose());
        composer.dispose();
        renderer.dispose();
        canvas.remove();
      }, 400);
    },
  };
}
