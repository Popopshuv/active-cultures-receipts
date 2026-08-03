"use client";

import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Mesh } from "three";

/** World-space radius of the sphere geometry. */
const RADIUS = 1.6;

/** Fraction of the shorter viewport axis the sphere may occupy. */
const FILL = 0.8;

function WireSphere() {
  const ref = useRef<Mesh>(null);
  // `viewport` is the visible area in world units at z=0, and it recomputes on
  // resize — so this tracks orientation changes without a listener.
  const { viewport } = useThree();

  // The camera's frustum is 4.14 world units tall at this distance and fov,
  // but only ~1.9 wide on a portrait phone. A 3.2-unit sphere therefore bleeds
  // off both sides. Fit against the *shorter* axis, and clamp at 1 so desktop
  // keeps the original composition rather than growing.
  const scale = Math.min(
    1,
    (Math.min(viewport.width, viewport.height) * FILL) / (RADIUS * 2),
  );

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.08;
    ref.current.rotation.x += delta * 0.03;
  });

  return (
    <mesh ref={ref} scale={scale}>
      <sphereGeometry args={[RADIUS, 24, 16]} />
      <meshBasicMaterial color="#1a1a1a" wireframe />
    </mesh>
  );
}

export function BackgroundCanvas() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <WireSphere />
      </Canvas>
    </div>
  );
}
