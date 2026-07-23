import { useEffect, useRef } from "react";
import * as THREE from "three";

// A closed loop route so the chase-cam animation never has to jump-cut back
// to a start point — it just keeps circling, which reads fine as an ambient
// background scene rather than one literal trip.
const ROUTE_POINTS = [
  new THREE.Vector3(-10, 0, 6),
  new THREE.Vector3(-4, 0, -7),
  new THREE.Vector3(6, 0, -9),
  new THREE.Vector3(12, 0, 2),
  new THREE.Vector3(6, 0, 9),
  new THREE.Vector3(-4, 0, 8),
];

const PICKUP_T = 0.04;
const DROPOFF_T = 0.52;
const SPEED = 0.045; // fraction of the loop per second
const BANK_MAX = 0.5; // radians
const BANK_GAIN = 14;

function buildBike() {
  const root = new THREE.Group();

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.6 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.4 });

  function makeWheel(z) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.42, z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 20), rimMat);
    rim.rotation.y = Math.PI / 2;
    wheel.add(rim);
    return wheel;
  }

  const frontWheel = makeWheel(0.75);
  const rearWheel = makeWheel(-0.75);
  root.add(frontWheel, rearWheel);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf5b833, roughness: 0.4, metalness: 0.2 });
  const frameGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.5, 8);

  const lowerBar = new THREE.Mesh(frameGeo, frameMat);
  lowerBar.rotation.z = Math.PI / 2 - 0.35;
  lowerBar.position.set(0, 0.55, 0.05);
  root.add(lowerBar);

  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 8), frameMat);
  seatPost.position.set(0, 0.95, -0.35);
  seatPost.rotation.x = -0.25;
  root.add(seatPost);

  const forkPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8), frameMat);
  forkPost.position.set(0, 0.95, 0.55);
  forkPost.rotation.x = 0.3;
  root.add(forkPost);

  // rider
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), bodyMat);
  torso.position.set(0, 1.35, -0.25);
  torso.rotation.x = 0.5;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), bodyMat);
  head.position.set(0, 1.72, 0.1);
  root.add(head);

  // delivery box on the rear rack, brand-yellow
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.35, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xf5b833, roughness: 0.5 })
  );
  box.position.set(0, 0.95, -0.85);
  root.add(box);

  return { root, frontWheel, rearWheel };
}

function buildEnvironment(scene, curve) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ color: 0x141d30, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // dashed lane markings following the curve
  const dashGeo = new THREE.BoxGeometry(0.18, 0.02, 0.6);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xffc63d, roughness: 0.6 });
  const dashCount = 70;
  for (let i = 0; i < dashCount; i++) {
    const t = i / dashCount;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.position.set(p.x, 0.015, p.z);
    dash.rotation.y = Math.atan2(tangent.x, tangent.z);
    scene.add(dash);
  }

  // simple low-poly buildings scattered off both sides of the route for depth
  const buildingMats = [0x1b2436, 0x223049, 0x0e1626].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })
  );
  let seed = 42;
  function rand() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 1000) / 1000;
  }
  const buildingCount = 26;
  for (let i = 0; i < buildingCount; i++) {
    const t = rand();
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const side = rand() > 0.5 ? 1 : -1;
    const offset = 6 + rand() * 10;
    const height = 1.5 + rand() * 5;
    const width = 1.2 + rand() * 1.6;
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, width),
      buildingMats[i % buildingMats.length]
    );
    building.position.set(
      p.x + normal.x * side * offset,
      height / 2,
      p.z + normal.z * side * offset
    );
    scene.add(building);
  }
}

function buildMarker(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const stem = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1, 12), mat);
  stem.position.y = 0.5;
  stem.rotation.x = Math.PI;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), mat);
  head.position.y = 1.15;
  group.add(stem, head);
  return group;
}

export default function HeroLiveMap({ className = "" }) {
  const mountRef = useRef(null);
  const pickupLabelRef = useRef(null);
  const dropoffLabelRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 20, 48);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x8fa3c4, 0x0b1220, 0.9));
    const sun = new THREE.DirectionalLight(0xffe9c2, 1.1);
    sun.position.set(8, 14, 6);
    scene.add(sun);

    const curve = new THREE.CatmullRomCurve3(ROUTE_POINTS, true, "catmullrom", 0.5);
    buildEnvironment(scene, curve);

    const pickupMarker = buildMarker(0xff6b35);
    pickupMarker.position.copy(curve.getPointAt(PICKUP_T));
    scene.add(pickupMarker);

    const dropoffMarker = buildMarker(0x1fae6b);
    dropoffMarker.position.copy(curve.getPointAt(DROPOFF_T));
    scene.add(dropoffMarker);

    const { root: bike, frontWheel, rearWheel } = buildBike();
    scene.add(bike);

    function resize() {
      const w = mount.clientWidth || 1;
      // Defensive fallback: if the container ever reports zero height (e.g. an
      // older browser without CSS aspect-ratio support), derive a 4:3 height
      // from the width instead of rendering into a 0px-tall canvas.
      const h = mount.clientHeight || Math.round(w * 0.75);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.05 });
    io.observe(mount);

    let t = 0;
    let frameId;
    let last = performance.now();
    const cameraOffset = new THREE.Vector3(0, 2.6, 5.2);
    const cameraPos = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    function project(vec3, out) {
      const p = vec3.clone().project(camera);
      if (p.z > 1) return null;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      out.x = ((p.x + 1) / 2) * w;
      out.y = ((1 - p.y) / 2) * h;
      return out;
    }

    function positionLabel(el, worldPos) {
      if (!el) return;
      const screen = project(worldPos, { x: 0, y: 0 });
      if (!screen) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = "1";
      el.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -140%)`;
    }

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!reduceMotion) t = (t + dt * SPEED) % 1;

      const pos = curve.getPointAt(t);
      const nextPos = curve.getPointAt((t + 0.01) % 1);
      const forward = nextPos.clone().sub(pos).normalize();

      bike.position.copy(pos);
      bike.position.y = 0;
      bike.lookAt(pos.clone().add(forward));

      const ahead2 = curve.getPointAt((t + 0.02) % 1);
      const forward2 = ahead2.clone().sub(nextPos).normalize();
      const turn = forward.clone().cross(forward2).y;
      const bank = THREE.MathUtils.clamp(-turn * BANK_GAIN, -BANK_MAX, BANK_MAX);
      bike.rotateZ(bank);

      if (!reduceMotion) {
        const spin = dt * SPEED * 40;
        frontWheel.rotation.x += spin;
        rearWheel.rotation.x += spin;
      }

      const desiredCam = bike.localToWorld(cameraOffset.clone());
      cameraPos.lerp(desiredCam, reduceMotion ? 1 : 0.08);
      camera.position.copy(cameraPos);
      lookTarget.copy(pos).add(forward.clone().multiplyScalar(3));
      lookTarget.y = 0.9;
      camera.lookAt(lookTarget);

      positionLabel(pickupLabelRef.current, pickupMarker.position.clone().setY(1.6));
      positionLabel(dropoffLabelRef.current, dropoffMarker.position.clone().setY(1.6));

      renderer.render(scene, camera);
      if (visible || reduceMotion) frameId = requestAnimationFrame(tick);
      else frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      io.disconnect();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={mountRef}
        className="w-full rounded-2xl overflow-hidden"
        style={{ aspectRatio: "4 / 3", minHeight: 240 }}
      />

      <div
        ref={pickupLabelRef}
        className="absolute top-0 left-0 pointer-events-none font-mono text-[10px] text-paper bg-ink/80 border border-line rounded-full px-2 py-0.5 transition-opacity"
      >
        PICKUP
      </div>
      <div
        ref={dropoffLabelRef}
        className="absolute top-0 left-0 pointer-events-none font-mono text-[10px] text-paper bg-ink/80 border border-line rounded-full px-2 py-0.5 transition-opacity"
      >
        DROP-OFF
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-ink/90 border border-line rounded-full pl-2.5 pr-3 py-1.5 backdrop-blur-sm">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-delivered opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-delivered" />
        </span>
        <span className="font-mono text-xs text-paper">Live tracking, every trip</span>
      </div>
    </div>
  );
}
