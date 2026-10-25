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
import { definitionParts } from '../engineering/shelves';

export function LacingBarGeometry({
  project,
  device,
  definition: d,
  dimmed,
}: {
  project: Project;
  device: Device;
  definition: DeviceDefinition;
  dimmed: boolean;
}) {
  const rack = deviceRack(project, device);
  const t = effectiveEarThicknessMm(d);
  const ears = useMemo(
    () =>
      [-1, 1].map((side) => {
        const left = side < 0 ? -d.faceWidthMm / 2 : d.widthMm / 2;
        const w = (d.faceWidthMm - d.widthMm) / 2;
        const s = new THREE.Shape();
        s.moveTo(left, 0);
        s.lineTo(left + w, 0);
        s.lineTo(left + w, d.heightMm);
        s.lineTo(left, d.heightMm);
        s.closePath();
        const hole = new THREE.Path();
        hole.absarc((side * rack.railCentersMm) / 2, d.heightMm / 2, 2.75, 0, 2 * Math.PI, true);
        s.holes.push(hole);
        const g = new THREE.ExtrudeGeometry(s, {
          depth: t,
          bevelEnabled: false,
          curveSegments: 12,
        });
        g.translate(0, 0, -t);
        return g;
      }),
    [d, rack.railCentersMm, t],
  );
  useEffect(() => () => ears.forEach((g) => g.dispose()), [ears]);
  const mat = {
    color: d.color,
    metalness: 0.55,
    roughness: 0.48,
    transparent: dimmed,
    opacity: dimmed ? 0.22 : 1,
  };
  return (
    <group
      scale={0.001}
      position={mmToScene([
        origin(rack)[0],
        devicePosition(project, device)[1] - d.heightMm / 2,
        mountingPlane(project, device),
      ])}
      rotation={device.face === 'rear' ? [0, Math.PI, 0] : [0, 0, 0]}
    >
      {definitionParts(d).map((p) => (
        <mesh key={p.id} position={p.position}>
          <boxGeometry args={p.size} />
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}
      {ears.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}
    </group>
  );
}
