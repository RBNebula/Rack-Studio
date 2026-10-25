import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Device, DeviceDefinition, Project } from '../model';
import {
  devicePosition,
  effectiveEarThicknessMm,
  mmToScene,
  mountingPlane,
} from '../engineering/geometry';
import { deviceRack, origin } from '../engineering/space';
import { switchMountingSlots } from '../models/generic-switch';
import { portFootprint, portPanelAngle } from '../engineering/ports';
import { portAperture } from './portGeometry';

function panel(left: number, w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(left, 0);
  s.lineTo(left + w, 0);
  s.lineTo(left + w, h);
  s.lineTo(left, h);
  s.closePath();
  return s;
}
function slot(x: number, y: number) {
  const p = new THREE.Path();
  p.absarc(x - 2, y, 3, Math.PI / 2, Math.PI * 1.5, false);
  p.absarc(x + 2, y, 3, -Math.PI / 2, Math.PI / 2, false);
  p.closePath();
  return p;
}

/** Local millimetre shell. Apertures and artwork follow the same editable port records.
 * Collision continues to use conservative chassis/ear envelopes. */
export function SwitchShell({
  definition: d,
  dimmed = false,
  railCentersMm = 465.1,
}: {
  definition: DeviceDefinition;
  dimmed?: boolean;
  railCentersMm?: number;
}) {
  const t = effectiveEarThicknessMm(d),
    w = d.widthMm,
    h = d.heightMm,
    depth = d.depthMm;
  const geometry = useMemo(() => {
    const make = (front: boolean) => {
      const s = panel(-w / 2, w, h);
      for (const port of d.ports.filter((p) => p.surface === (front ? 'front' : 'rear')))
        s.holes.push(portAperture(port, 0.15));
      const g = new THREE.ExtrudeGeometry(s, { depth: front ? t : 1, bevelEnabled: false });
      g.translate(0, 0, front ? -t : depth - 1);
      return g;
    };
    const ears = [-1, 1].map((side) => {
      const ew = (d.faceWidthMm - w) / 2;
      const s = panel(side < 0 ? -d.faceWidthMm / 2 : w / 2, ew, h);
      // Standard interface centres are shared with mounting marks; keep editable offsets.
      for (const hole of switchMountingSlots(d, railCentersMm).filter(
        (hole) => Math.sign(hole.x) === side,
      ))
        s.holes.push(slot(hole.x, hole.y));
      const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 12 });
      g.translate(0, 0, -t);
      return g;
    });
    return { front: make(true), rear: make(false), ears };
  }, [d, railCentersMm, w, h, depth, t]);
  const label = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 256;
    const c = canvas.getContext('2d')!;
    c.scale(canvas.width / w, canvas.height / h);
    c.fillStyle = '#303a43';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '3.4px Arial';
    for (const p of d.ports.filter((p) => p.surface === 'front'))
      c.fillText(
        p.connector === 'RJ45' ? p.name.replace('Ethernet ', '') : p.name.replace(' · cage', ''),
        w / 2 - p.position[0],
        h - p.position[1] - portFootprint(p)[1] / 2 - 4,
      );
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [d.ports, w, h]);
  useEffect(
    () => () => {
      geometry.front.dispose();
      geometry.rear.dispose();
      geometry.ears.forEach((g) => g.dispose());
    },
    [geometry],
  );
  useEffect(() => () => label.dispose(), [label]);
  const mat = { metalness: 0.55, roughness: 0.43, transparent: dimmed, opacity: dimmed ? 0.22 : 1 };
  return (
    <group>
      {[
        { p: [0, h - 0.5, depth / 2], s: [w, 1, depth] },
        { p: [0, 0.5, depth / 2], s: [w, 1, depth] },
        { p: [-w / 2 + 0.5, h / 2, depth / 2], s: [1, h, depth] },
        { p: [w / 2 - 0.5, h / 2, depth / 2], s: [1, h, depth] },
      ].map(({ p, s }, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow receiveShadow>
          <boxGeometry args={s as [number, number, number]} />
          <meshStandardMaterial color={d.color} {...mat} />
        </mesh>
      ))}
      {[geometry.front, geometry.rear, ...geometry.ears].map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial color={d.color} side={THREE.DoubleSide} {...mat} />
        </mesh>
      ))}
      <mesh position={[0, h / 2, -t - 0.03]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={label} transparent opacity={dimmed ? 0.22 : 1} depthWrite={false} />
      </mesh>
      {d.ports.map((p) => (
        <mesh
          key={p.id}
          rotation={[0, 0, portPanelAngle(p)]}
          position={[p.position[0], p.position[1], p.surface === 'front' ? 1 : depth - 1.2]}
        >
          <boxGeometry args={[(p.widthMm ?? 14) + 0.4, (p.heightMm ?? 12) + 0.4, 1]} />
          <meshStandardMaterial color="#10151b" {...mat} />
        </mesh>
      ))}
      {[-1, 1].flatMap((side) =>
        [12, depth - 12].map((z) => (
          <mesh
            key={`${side}-${z}`}
            position={[side * (w / 2 - 7), h + 0.03, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[1.25, 12]} />
            <meshStandardMaterial color="#697279" {...mat} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function GenericSwitchGeometry({
  project,
  device,
  definition,
  dimmed,
}: {
  project: Project;
  device: Device;
  definition: DeviceDefinition;
  dimmed: boolean;
}) {
  const p = devicePosition(project, device);
  return (
    <group
      position={mmToScene([
        origin(deviceRack(project, device))[0],
        p[1] - definition.heightMm / 2,
        mountingPlane(project, device),
      ])}
      rotation={device.face === 'rear' ? [0, Math.PI, 0] : [0, 0, 0]}
      scale={0.001}
    >
      <SwitchShell
        definition={definition}
        dimmed={dimmed}
        railCentersMm={deviceRack(project, device).railCentersMm}
      />
    </group>
  );
}
