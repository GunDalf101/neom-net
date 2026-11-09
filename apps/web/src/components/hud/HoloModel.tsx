import type { AugmentationSlot } from "@neom/shared";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const HOLO_MODEL_URL = "/models/hologram.glb";

/**
 * Where each cyberware slot sits on a normalised humanoid (feet at y=0, top of head at y=1, x centred,
 * +x to the viewer's right, +z towards the viewer). Each target snaps to the nearest surface point of the
 * loaded mesh, so the dots land on the body whatever its proportions.
 */
export const ANCHOR_TARGETS: Record<AugmentationSlot, [number, number, number]> = {
  brain: [0, 0.975, -0.01],
  eyes: [-0.03, 0.915, 0.08],
  ears: [-0.08, 0.9, 0.0],
  mouth: [0.0, 0.86, 0.085],
  back: [0.07, 0.74, -0.1],
  torso: [0.07, 0.62, 0.1],
  arms: [-0.19, 0.66, 0.0],
  hands: [-0.22, 0.44, 0.02],
  legs: [-0.09, 0.27, 0.04],
  feet: [-0.09, 0.02, 0.07],
};

export type AnchorReader = () => Partial<Record<AugmentationSlot, [number, number]>> | null;

const CYAN = new THREE.Color("#19e3ff");

const vertexShader = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying float vY;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vNormalV = normalize(normalMatrix * objectNormal);
    vViewDir = normalize(-mvPosition.xyz);
    vY = (modelMatrix * vec4(transformed, 1.0)).y;
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uAlpha;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying float vY;
  void main() {
    vec3 n = normalize(vNormalV);
    if (!gl_FrontFacing) n = -n;
    float fres = pow(1.0 - clamp(dot(n, normalize(vViewDir)), 0.0, 1.0), 2.4);
    float scan = 0.78 + 0.22 * sin(vY * 220.0 - uTime * 6.0);
    float band = fract(uTime * 0.12);
    float sweep = smoothstep(0.08, 0.0, abs(vY - band * 1.15 + 0.05));
    float flicker = 0.96 + 0.04 * sin(uTime * 37.0) * sin(uTime * 13.0);
    float a = (0.06 + fres * 0.9 + sweep * 0.35) * scan * flicker * uAlpha;
    vec3 col = uColor * (0.35 + fres * 1.4 + sweep * 0.9);
    col = mix(col, vec3(0.86, 0.98, 1.0), fres * 0.35 + sweep * 0.25);
    gl_FragColor = vec4(col * a, a);
  }
`;

function holoMaterial(alpha: number, wireframe = false) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uColor: { value: CYAN.clone() }, uTime: { value: 0 }, uAlpha: { value: alpha } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    wireframe,
  });
}

/** Module-level memo so a missing model is only probed once per page load. */
let modelState: "unknown" | "ready" | "missing" = "unknown";
let modelPromise: Promise<THREE.Group> | null = null;

function loadModel(): Promise<THREE.Group> {
  if (!modelPromise) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    loader.setDRACOLoader(draco);
    modelPromise = loader
      .loadAsync(HOLO_MODEL_URL)
      .then((gltf) => {
        modelState = "ready";
        return gltf.scene;
      })
      .catch((err) => {
        modelState = "missing";
        modelPromise = null;
        throw err;
      });
  }
  return modelPromise;
}

/** Collect a thinned cloud of world-space surface points to snap anchors onto. */
function samplePoints(root: THREE.Object3D, max = 24000): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  let total = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry?.attributes.position) total += m.geometry.attributes.position.count;
  });
  const stride = Math.max(1, Math.floor(total / max));
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.attributes.position) return;
    const pos = m.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      pts.push(v.clone());
    }
  });
  return pts;
}

/**
 * three.js hologram of the character body. Reports screen-space slot anchors through `anchorRef` and
 * calls `onFrame` after each rendered frame so connector lines can follow the sway.
 */
export function HoloModel({
  anchorRef,
  onFrame,
  onUnavailable,
  onReady,
}: {
  anchorRef: React.MutableRefObject<AnchorReader | null>;
  onFrame: () => void;
  onUnavailable: () => void;
  onReady?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onFrame, onUnavailable, onReady });
  callbacks.current = { onFrame, onUnavailable, onReady };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (modelState === "missing") {
      callbacks.current.onUnavailable();
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      callbacks.current.onUnavailable();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
    camera.position.set(0, 0.56, 2.45);
    camera.lookAt(0, 0.5, 0);

    const pivot = new THREE.Group();
    scene.add(pivot);

    // Platform: faint disc, solid ring, slowly turning dashed ring, and a projection cone.
    const platform = new THREE.Group();
    platform.position.y = 0.002;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 48), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.35, 64), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    const dashedPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) dashedPts.push(new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * 0.27, 0.003, Math.sin((i / 96) * Math.PI * 2) * 0.27));
    const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints(dashedPts), new THREE.LineDashedMaterial({ color: CYAN, dashSize: 0.06, gapSize: 0.035, transparent: true, opacity: 0.7 }));
    dashed.computeLineDistances();
    // Projection beam: fades out towards the top so there is no hard rim above the head.
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.34, 1.1, 48, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: CYAN.clone() } },
        vertexShader: "varying float vV; void main(){ vV = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform vec3 uColor; varying float vV; void main(){ float a = pow(1.0 - vV, 2.2) * 0.09; gl_FragColor = vec4(uColor * a, a); }",
      }),
    );
    cone.position.y = 0.55;
    platform.add(disc, ring, dashed, cone);
    scene.add(platform);

    const fillMat = holoMaterial(1);
    const wireMat = holoMaterial(0.22, true);
    const materials = [fillMat, wireMat];
    let anchorsLocal: Partial<Record<AugmentationSlot, THREE.Vector3>> = {};
    let disposed = false;
    let raf = 0;
    const start = performance.now();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const tmp = new THREE.Vector3();

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      // Keep the whole figure in frame on narrow hosts.
      camera.fov = w / h < 0.5 ? 34 : 28;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      renderOnce();
    });
    ro.observe(host);

    anchorRef.current = () => {
      if (!Object.keys(anchorsLocal).length) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const out: Partial<Record<AugmentationSlot, [number, number]>> = {};
      pivot.updateWorldMatrix(true, false);
      for (const [slot, p] of Object.entries(anchorsLocal) as [AugmentationSlot, THREE.Vector3][]) {
        tmp.copy(p).applyMatrix4(pivot.matrixWorld).project(camera);
        out[slot] = [rect.left + ((tmp.x + 1) / 2) * rect.width, rect.top + ((1 - tmp.y) / 2) * rect.height];
      }
      return out;
    };

    const renderOnce = () => {
      const t = (performance.now() - start) / 1000;
      for (const m of materials) m.uniforms.uTime!.value = t;
      pivot.rotation.y = reduced ? 0 : Math.sin(t * 0.35) * 0.42;
      dashed.rotation.y = reduced ? 0 : t * 0.25;
      renderer.render(scene, camera);
      callbacks.current.onFrame();
    };
    const loop = () => {
      if (disposed) return;
      if (document.visibilityState === "visible") renderOnce();
      raf = requestAnimationFrame(loop);
    };

    loadModel()
      .then((src) => {
        if (disposed) return;
        const model = src.clone(true);
        // Normalise: feet on the floor, 1 unit tall, centred.
        model.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 1 / (size.y || 1);
        const holder = new THREE.Group();
        holder.add(model);
        holder.scale.setScalar(scale);
        const centre = box.getCenter(new THREE.Vector3());
        model.position.set(-centre.x, -box.min.y, -centre.z);
        pivot.add(holder);
        holder.updateWorldMatrix(true, true);
        // Collect first: adding children while traversing would visit the new wire meshes too.
        const meshes: THREE.Mesh[] = [];
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
        });
        for (const m of meshes) {
          m.material = fillMat;
          m.frustumCulled = false;
          m.renderOrder = 2;
          const wire = new THREE.Mesh(m.geometry, wireMat);
          wire.renderOrder = 3;
          wire.frustumCulled = false;
          m.add(wire);
        }
        // Snap slot anchors to the nearest surface point (in pivot space, so they follow the sway).
        const cloud = samplePoints(holder).map((p) => pivot.worldToLocal(p));
        const next: typeof anchorsLocal = {};
        for (const [slot, [tx, ty, tz]] of Object.entries(ANCHOR_TARGETS) as [AugmentationSlot, [number, number, number]][]) {
          let best: THREE.Vector3 | null = null;
          let bestD = Infinity;
          for (const p of cloud) {
            const d = (p.x - tx) ** 2 + (p.y - ty) ** 2 + (p.z - tz) ** 2;
            if (d < bestD) {
              bestD = d;
              best = p;
            }
          }
          next[slot] = best ? best.clone() : new THREE.Vector3(tx, ty, tz);
        }
        anchorsLocal = next;
        callbacks.current.onReady?.();
        if (reduced) renderOnce();
        else raf = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!disposed) callbacks.current.onUnavailable();
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      anchorRef.current = null;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh || (o as THREE.Line).isLine) {
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [anchorRef]);

  return <div ref={hostRef} className="absolute inset-0" data-testid="holo-model" />;
}
