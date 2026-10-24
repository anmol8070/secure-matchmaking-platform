/**
 * The landing-page centerpiece (three.js, loaded only on the landing page).
 *
 * Two iridescent orbs — two people — joined by two streams of light flowing in
 * opposite directions (interest goes both ways), inside a slowly turning
 * constellation of connection nodes that leans toward the cursor.
 *
 * Costs are bounded: pixel ratio ≤ 2, ~500 particles, the loop stops while the
 * canvas is off-screen or the tab is hidden, reduced motion renders a single
 * still frame, and everything is disposed on unmount.
 */
import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  NormalBlending,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  QuadraticBezierCurve3,
  SRGBColorSpace,
  Scene,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { hasFinePointer, prefersReducedMotion } from '../../hooks/useMotion.js';

const PALETTE = {
  violet: new Color('#7C3AED'),
  pink: new Color('#FF3D9A'),
  cyan: new Color('#22D3EE'),
  coral: new Color('#FF6B6B'),
  lime: new Color('#C7F464'),
};

const STREAM_COUNT = 170;
const NODE_COUNT = 72;

/** Soft round sprite so points render as glowing dots instead of squares. */
function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function orb(color, emissive) {
  const material = new MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity: 0.35,
    roughness: 0.16,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    iridescence: 1,
    iridescenceIOR: 1.7,
    iridescenceThicknessRange: [180, 820],
    sheen: 0.6,
    sheenColor: new Color('#ffffff'),
  });
  return new Mesh(new IcosahedronGeometry(0.62, 24), material);
}

/** Particles that travel along a curve from one orb to the other. */
function stream(from, to, sprite) {
  const positions = new Float32Array(STREAM_COUNT * 3);
  const colors = new Float32Array(STREAM_COUNT * 3);
  const offsets = new Float32Array(STREAM_COUNT);
  const c = new Color();
  for (let i = 0; i < STREAM_COUNT; i += 1) {
    offsets[i] = Math.random();
    c.copy(from).lerp(to, offsets[i]);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    size: 0.075,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return { points: new Points(geometry, material), offsets, jitter: offsets.map(() => Math.random() * Math.PI * 2) };
}

/** Nodes on a spherical shell, linked to their near neighbours. */
function constellation(sprite) {
  const nodes = [];
  const colors = [];
  const tones = [PALETTE.violet, PALETTE.pink, PALETTE.cyan, PALETTE.lime, PALETTE.coral];
  for (let i = 0; i < NODE_COUNT; i += 1) {
    // Fibonacci sphere: evenly spread, no clumps.
    const y = 1 - (i / (NODE_COUNT - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = i * 2.399963;
    const radius = 2.7 + Math.random() * 0.8;
    nodes.push(new Vector3(Math.cos(theta) * r * radius * 1.35, y * radius * 0.85, Math.sin(theta) * r * radius));
    const tone = tones[i % tones.length];
    colors.push(tone.r, tone.g, tone.b);
  }
  const nodeGeometry = new BufferGeometry().setFromPoints(nodes);
  nodeGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const nodePoints = new Points(
    nodeGeometry,
    new PointsMaterial({ size: 0.11, map: sprite, vertexColors: true, transparent: true, depthWrite: false })
  );

  const segments = [];
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      if (nodes[a].distanceTo(nodes[b]) < 1.25) segments.push(nodes[a], nodes[b]);
    }
  }
  const lines = new LineSegments(
    new BufferGeometry().setFromPoints(segments),
    new LineBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false })
  );
  return { nodePoints, lines };
}

function HeroScene({ onReady, onError }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (err) {
      onError?.(err);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'hero-scene__canvas';
    mount.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(42, 1, 0.1, 50);
    camera.position.set(0, 0, 7.2);

    const sprite = dotTexture();
    const root = new Group();
    scene.add(root);

    const orbA = orb(PALETTE.violet, PALETTE.violet);
    const orbB = orb(PALETTE.pink, PALETTE.coral);
    root.add(orbA, orbB);

    // A thin orbit ring around each orb.
    const ringGeometry = new TorusGeometry(0.92, 0.006, 6, 120);
    const ringA = new Mesh(ringGeometry, new MeshPhysicalMaterial({ color: PALETTE.cyan, emissive: PALETTE.cyan, emissiveIntensity: 0.8 }));
    const ringB = new Mesh(ringGeometry, new MeshPhysicalMaterial({ color: PALETTE.lime, emissive: PALETTE.lime, emissiveIntensity: 0.6 }));
    root.add(ringA, ringB);

    const forward = stream(PALETTE.violet, PALETTE.pink, sprite);
    const back = stream(PALETTE.coral, PALETTE.cyan, sprite);
    root.add(forward.points, back.points);

    const sky = constellation(sprite);
    const skyGroup = new Group();
    skyGroup.add(sky.nodePoints, sky.lines);
    scene.add(skyGroup);

    scene.add(new AmbientLight('#ffffff', 0.55));
    const lights = [
      [PALETTE.cyan, -3.5, 2.5, 3.5],
      [PALETTE.pink, 3.5, -1.5, 3.2],
      [PALETTE.violet, 0, 3.5, -2.5],
    ].map(([color, x, y, z]) => {
      const light = new PointLight(color, 38, 20, 1.6);
      light.position.set(x, y, z);
      scene.add(light);
      return light;
    });

    // Theme: additive glow on dark backgrounds, normal blending on light ones.
    const applyTheme = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      for (const s of [forward, back]) {
        s.points.material.blending = dark ? AdditiveBlending : NormalBlending;
        s.points.material.opacity = dark ? 0.95 : 0.85;
        s.points.material.needsUpdate = true;
      }
      sky.nodePoints.material.blending = dark ? AdditiveBlending : NormalBlending;
      sky.nodePoints.material.needsUpdate = true;
      sky.lines.material.color.set(dark ? '#C4B5FD' : '#7C3AED');
      sky.lines.material.opacity = dark ? 0.16 : 0.22;
      renderer.toneMappingExposure = dark ? 1.05 : 0.95;
    };
    applyTheme();

    const curveForward = new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3());
    const curveBack = new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3());
    const tmp = new Vector3();

    const pointer = { x: 0, y: 0 };
    const reduced = prefersReducedMotion();
    let elapsed = 0;
    let last = performance.now();

    const update = (t) => {
      // The two orbs drift around each other and breathe slightly out of step.
      const swing = Math.sin(t * 0.35) * 0.18;
      orbA.position.set(-1.45 + swing * 0.4, 0.2 + Math.sin(t * 0.9) * 0.12, Math.cos(t * 0.35) * 0.35);
      orbB.position.set(1.45 - swing * 0.4, -0.2 + Math.sin(t * 0.9 + 1.4) * 0.12, -Math.cos(t * 0.35) * 0.35);
      const beat = (phase) => 1 + Math.max(0, Math.sin(t * 2.2 + phase)) ** 6 * 0.05;
      orbA.scale.setScalar(beat(0));
      orbB.scale.setScalar(beat(0.6));
      orbA.rotation.y = t * 0.25;
      orbB.rotation.y = -t * 0.25;

      ringA.position.copy(orbA.position);
      ringB.position.copy(orbB.position);
      ringA.rotation.set(1.2 + Math.sin(t * 0.4) * 0.2, t * 0.3, 0.3);
      ringB.rotation.set(1.0 + Math.cos(t * 0.4) * 0.2, -t * 0.3, -0.4);

      curveForward.v0.copy(orbA.position);
      curveForward.v2.copy(orbB.position);
      curveForward.v1.set(0, 1.25 + Math.sin(t * 0.6) * 0.15, 0.6);
      curveBack.v0.copy(orbB.position);
      curveBack.v2.copy(orbA.position);
      curveBack.v1.set(0, -1.15 + Math.cos(t * 0.6) * 0.15, -0.5);

      for (const [s, curve, speed] of [
        [forward, curveForward, 0.09],
        [back, curveBack, 0.075],
      ]) {
        const attr = s.points.geometry.attributes.position;
        for (let i = 0; i < STREAM_COUNT; i += 1) {
          const u = (s.offsets[i] + t * speed) % 1;
          curve.getPoint(u, tmp);
          // Fan out in the middle of the arc, converge at the orbs.
          const spread = Math.sin(u * Math.PI) * 0.22;
          const j = s.jitter[i];
          attr.setXYZ(i, tmp.x, tmp.y + Math.sin(j + t * 1.3) * spread, tmp.z + Math.cos(j + t * 1.1) * spread);
        }
        attr.needsUpdate = true;
      }

      skyGroup.rotation.y = t * 0.035;
      skyGroup.rotation.x = Math.sin(t * 0.05) * 0.1;
      // Lean toward the cursor (eased).
      root.rotation.y += (pointer.x * 0.35 - root.rotation.y) * 0.05;
      root.rotation.x += (-pointer.y * 0.22 - root.rotation.x) * 0.05;
      skyGroup.position.x += (pointer.x * 0.25 - skyGroup.position.x) * 0.03;
      lights[0].position.x = -3.5 + pointer.x * 1.5;
    };

    const render = () => renderer.render(scene, camera);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return false;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Pull back on narrow screens so both orbs stay in frame.
      camera.position.z = w / h < 1 ? 7.2 / Math.max(w / h, 0.55) : 7.2;
      camera.updateProjectionMatrix();
      update(reduced ? 2.2 : elapsed);
      render();
      return true;
    };

    let frame = 0;
    let visible = true;
    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      elapsed += Math.min(now - last, 50) / 1000; // no jump after a pause
      last = now;
      update(elapsed);
      render();
    };
    const start = () => {
      if (reduced || frame || !visible || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(mount);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    const themeObserver = new MutationObserver(() => {
      applyTheme();
      if (reduced) render();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const onPointer = (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    const trackPointer = !reduced && hasFinePointer();
    if (trackPointer) window.addEventListener('pointermove', onPointer, { passive: true });

    const onContextLost = (event) => {
      event.preventDefault();
      stop();
      onError?.(new Error('WebGL context lost'));
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    let readyNotified = false;
    const paintWhenSized = () => {
      if (!resize()) return;
      if (!readyNotified) {
        readyNotified = true;
        onReady?.();
      }
    };
    paintWhenSized();
    // The stage can still be 0×0 on the first effect pass. Draw once it has a size
    // so the orbs are not swapped in for an empty canvas.
    const sizeWait = requestAnimationFrame(paintWhenSized);
    start();

    return () => {
      cancelAnimationFrame(sizeWait);
      stop();
      resizeObserver.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (trackPointer) window.removeEventListener('pointermove', onPointer);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m) => m?.dispose());
      });
      sprite.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onReady, onError]);

  return <div ref={mountRef} className="hero-scene" />;
}

export default HeroScene;
