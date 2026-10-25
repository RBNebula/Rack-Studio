import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Device, DeviceDefinition, Port, Project } from '../model';
import { deviceRack, origin } from '../engineering/space';
import { portFootprint } from '../engineering/ports';
import { portAperture } from './portGeometry';
import {
  devicePosition,
  effectiveEarThicknessMm,
  mmToScene,
  mountingPlane,
  uBottom,
} from '../engineering/geometry';

const rect = (left: number, bottom: number, width: number, height: number): THREE.Path => {
  const path = new THREE.Path();
  path.moveTo(left, bottom);
  path.lineTo(left, bottom + height);
  path.lineTo(left + width, bottom + height);
  path.lineTo(left + width, bottom);
  path.closePath();
  return path;
};
const circle = (x: number, y: number, radius: number): THREE.Path => {
  const path = new THREE.Path();
  path.absarc(x, y, radius, 0, Math.PI * 2, true);
  return path;
};
function panel(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();
  return shape;
}
const clearOfPorts = (x: number, y: number, ports: Port[], margin = 2): boolean =>
  ports.every((port) => {
    const [w, h] = portFootprint(port);
    return (
      Math.abs(x - port.position[0]) > w / 2 + margin ||
      Math.abs(y - port.position[1]) > h / 2 + margin
    );
  });

/** Photo-derived shell and fittings. Small vents and connector details are visual
 * features; the engine retains a conservative chassis/part collision envelope. */
export function UserRackPcGeometry({
  project,
  device,
  definition,
  dimmed = false,
}: {
  project: Project;
  device: Device;
  definition: DeviceDefinition;
  dimmed?: boolean;
}) {
  const width = definition.widthMm;
  const height = definition.heightMm;
  const depth = definition.depthMm;
  const thickness = effectiveEarThicknessMm(definition);
  const frontPorts = useMemo(
    () => definition.ports.filter((port) => port.surface === 'front'),
    [definition.ports],
  );
  const rearPorts = useMemo(
    () => definition.ports.filter((port) => port.surface === 'rear'),
    [definition.ports],
  );
  const frontUsbX = frontPorts[0]?.position[0] ?? width * 0.035;
  const controlX = frontUsbX - width * 0.125;
  const powerPort = rearPorts.find((port) => port.connector.startsWith('IEC'));
  const fanX = (powerPort?.position[0] ?? -width * 0.435) + width * 0.095;
  const geometries = useMemo(() => {
    const face = panel(width, height);
    // Circular ventilation follows the photographed front fascia, leaving its
    // USB pair and status/button strip on unperforated islands.
    for (let row = 0, y = 5; y < height - 4; row++, y += 3.5) {
      for (let x = -width / 2 + 5 + (row % 2) * 1.75; x < width / 2 - 4; x += 3.5) {
        if (!clearOfPorts(x, y, frontPorts, 2.7)) continue;
        if (Math.abs(x - controlX) < width * 0.06 && Math.abs(y - height * 0.63) < 8) continue;
        face.holes.push(circle(x, y, 1.17));
      }
    }
    for (const port of frontPorts) {
      face.holes.push(portAperture(port));
    }
    const front = new THREE.ExtrudeGeometry(face, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 6,
    });
    front.translate(0, 0, -thickness);
    const back = panel(width, height);
    for (const port of rearPorts) {
      back.holes.push(portAperture(port, 0.2));
    }
    const fanRadius = Math.min(height * 0.39, width * 0.041);
    back.holes.push(circle(fanX, height / 2, fanRadius));
    // Motherboard I/O surround is an open square mesh in the reference, rather
    // than a printed generic label. Every real port retains its own opening.
    for (let y = 4; y < height - 3; y += 3.5) {
      for (let x = -width * 0.22; x < width * 0.145; x += 3.5) {
        if (clearOfPorts(x, y, rearPorts, 2.3)) back.holes.push(rect(x - 0.95, y - 0.95, 1.9, 1.9));
      }
    }
    // The right expansion cover has a perforated upper strip and a wider lower
    // ventilation strip. It is a blanking cover, not an invented data socket.
    for (let row = 0; row < 4; row++) {
      const y = row < 2 ? 8 + row * 3 : height * 0.67 + (row - 2) * 2.8;
      for (let x = width * 0.235 + (row % 2) * 1.5; x < width * 0.465; x += 3)
        back.holes.push(circle(x, y, 0.9));
    }
    for (let y = 5; y < height - 4; y += 3)
      for (let x = width * 0.177; x < width * 0.214; x += 3) back.holes.push(circle(x, y, 0.85));
    const rear = new THREE.ExtrudeGeometry(back, {
      depth: 0.8,
      bevelEnabled: false,
      curveSegments: 6,
    });
    rear.translate(0, 0, depth - 0.8);
    const ears = [-1, 1].map((side) => {
      const left = side < 0 ? -definition.faceWidthMm / 2 : width / 2;
      const ear = new THREE.Shape();
      ear.moveTo(left, 0);
      ear.lineTo(left + (definition.faceWidthMm - width) / 2, 0);
      ear.lineTo(left + (definition.faceWidthMm - width) / 2, height);
      ear.lineTo(left, height);
      ear.closePath();
      const x = (side * deviceRack(project, device).railCentersMm) / 2;
      const bottom = devicePosition(project, device)[1] - height / 2;
      for (const offset of definition.screwOffsetsMm) {
        const y = origin(deviceRack(project, device))[1] + uBottom(device.startU) + offset - bottom;
        if (y > 3 && y < height - 3) {
          const slot = new THREE.Path();
          slot.moveTo(x - 2.5, y - 1);
          slot.absarc(x, y - 1, 2.5, Math.PI, 0, false);
          slot.lineTo(x + 2.5, y + 1);
          slot.absarc(x, y + 1, 2.5, 0, Math.PI, false);
          slot.closePath();
          ear.holes.push(slot);
        }
      }
      const geometry = new THREE.ExtrudeGeometry(ear, {
        depth: thickness,
        bevelEnabled: false,
        curveSegments: 8,
      });
      geometry.translate(0, 0, -thickness);
      return geometry;
    });
    return { front, rear, ears };
  }, [
    definition,
    device,
    project,
    width,
    height,
    depth,
    thickness,
    frontPorts,
    rearPorts,
    controlX,
    fanX,
  ]);
  useEffect(
    () => () => {
      geometries.front.dispose();
      geometries.rear.dispose();
      geometries.ears.forEach((geometry) => geometry.dispose());
    },
    [geometries],
  );
  const position = devicePosition(project, device);
  const opacity = dimmed ? 0.22 : 1;
  const mat = { metalness: 0.55, roughness: 0.54, transparent: dimmed, opacity };
  const silver = '#a3a8ac';
  const black = '#242627';
  return (
    <group
      position={mmToScene([
        origin(deviceRack(project, device))[0],
        position[1] - height / 2,
        mountingPlane(project, device),
      ])}
      rotation={device.face === 'rear' ? [0, Math.PI, 0] : [0, 0, 0]}
      scale={0.001}
    >
      {/* Individual shell skins leave the visible perforations open. */}
      {[
        { p: [0, height - 0.4, depth / 2], s: [width, 0.8, depth] },
        { p: [0, 0.4, depth / 2], s: [width, 0.8, depth] },
        { p: [-width / 2 + 0.4, height / 2, depth / 2], s: [0.8, height, depth] },
        { p: [width / 2 - 0.4, height / 2, depth / 2], s: [0.8, height, depth] },
      ].map(({ p, s }, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow receiveShadow>
          <boxGeometry args={s as [number, number, number]} />
          <meshStandardMaterial color={silver} {...mat} />
        </mesh>
      ))}
      <mesh geometry={geometries.front} castShadow receiveShadow>
        <meshStandardMaterial color={black} side={THREE.DoubleSide} {...mat} />
      </mesh>
      <mesh geometry={geometries.rear} castShadow receiveShadow>
        <meshStandardMaterial color={silver} side={THREE.DoubleSide} {...mat} />
      </mesh>
      {geometries.ears.map((geometry, i) => (
        <mesh key={i} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color={black} side={THREE.DoubleSide} {...mat} />
        </mesh>
      ))}
      {/* Dark internal envelope behind ventilation, never a selectable port. */}
      <mesh position={[0, height / 2, 3]}>
        <planeGeometry args={[width - 2, height - 2]} />
        <meshStandardMaterial color="#111418" side={THREE.DoubleSide} {...mat} />
      </mesh>
      <mesh position={[0, height / 2, depth - 3]}>
        <planeGeometry args={[width - 2, height - 2]} />
        <meshStandardMaterial color="#151719" side={THREE.DoubleSide} {...mat} />
      </mesh>
      <group position={[controlX, height * 0.63, -thickness - 0.05]} rotation={[0, Math.PI, 0]}>
        <mesh>
          <planeGeometry args={[width * 0.112, 10]} />
          <meshStandardMaterial color="#444a4c" {...mat} />
        </mesh>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position={[-11 + i * 5, 0.5, 0.05]}>
            <planeGeometry args={[1.3, 2.1]} />
            <meshBasicMaterial
              color={i === 0 ? '#adc0ab' : '#b4b9ab'}
              transparent={dimmed}
              opacity={opacity}
            />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * width * 0.047, 0, 0.05]}>
            <ringGeometry args={[1.65, 2.15, 24]} />
            <meshBasicMaterial color="#c6d0cd" transparent={dimmed} opacity={opacity} />
          </mesh>
        ))}
      </group>
      <Fan x={fanX} y={height / 2} z={depth + 0.06} radius={height * 0.35} dimmed={dimmed} />
      {/* Silver PSU seam and two horizontal expansion-cover folds. */}
      {[
        { p: [-width * 0.245, height / 2, depth + 0.05], s: [0.55, height - 2, 0.2] },
        { p: [width * 0.35, height * 0.84, depth + 0.05], s: [width * 0.25, 0.7, 0.8] },
        { p: [width * 0.35, height * 0.47, depth + 0.05], s: [width * 0.25, 0.7, 0.8] },
      ].map(({ p, s }, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={s as [number, number, number]} />
          <meshStandardMaterial color="#757b7e" {...mat} />
        </mesh>
      ))}
      {definition.parts.map((part) => (
        <Fitting key={part.id} part={part} dimmed={dimmed} />
      ))}
      {[-1, 1].flatMap((side) =>
        [14, depth - 12].map((z) => (
          <mesh
            key={`${side}-${z}`}
            position={[side * (width / 2 - 6), height + 0.03, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[1.35, 12]} />
            <meshStandardMaterial color="#5f676c" {...mat} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Fan({
  x,
  y,
  z,
  radius,
  dimmed,
}: {
  x: number;
  y: number;
  z: number;
  radius: number;
  dimmed: boolean;
}) {
  return (
    <group position={[x, y, z]}>
      <mesh>
        <ringGeometry args={[radius * 0.83, radius, 40]} />
        <meshStandardMaterial
          color="#6e7376"
          metalness={0.7}
          roughness={0.45}
          transparent={dimmed}
          opacity={dimmed ? 0.22 : 1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <circleGeometry args={[radius * 0.43, 28]} />
        <meshStandardMaterial
          color="#8a9390"
          transparent={dimmed}
          opacity={dimmed ? 0.22 : 1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
          <mesh position={[radius * 0.66, 0, 0.02]}>
            <planeGeometry args={[radius * 0.53, radius * 0.13]} />
            <meshStandardMaterial
              color="#999fa0"
              transparent={dimmed}
              opacity={dimmed ? 0.22 : 1}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Fitting({ part, dimmed }: { part: DeviceDefinition['parts'][number]; dimmed: boolean }) {
  const geometry = useMemo(() => {
    if (!part.id.includes('handle')) return null;
    const [w, h, d] = part.size;
    const radius = Math.min(1.8, w / 5, h / 7, d / 6);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -h / 2 + radius, d / 2 - radius),
      new THREE.Vector3(0, -h / 2 + radius * 2, -d / 2 + radius * 2),
      new THREE.Vector3(0, -h / 2 + radius * 3, -d / 2 + radius),
      new THREE.Vector3(0, h / 2 - radius * 3, -d / 2 + radius),
      new THREE.Vector3(0, h / 2 - radius * 2, -d / 2 + radius * 2),
      new THREE.Vector3(0, h / 2 - radius, d / 2 - radius),
    ]);
    return new THREE.TubeGeometry(path, 30, radius, 8, false);
  }, [part]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return (
    <mesh
      position={part.position}
      geometry={geometry ?? undefined}
      rotation={part.id.includes('stud') ? [0, 0, Math.PI / 2] : [0, 0, 0]}
      castShadow
    >
      {!geometry && part.id.includes('stud') && (
        <cylinderGeometry
          args={[
            Math.min(part.size[1], part.size[2]) / 2,
            Math.min(part.size[1], part.size[2]) / 2,
            part.size[0],
            16,
          ]}
        />
      )}
      {!geometry && !part.id.includes('stud') && <boxGeometry args={part.size} />}
      <meshStandardMaterial
        color="#b7bfc3"
        metalness={0.85}
        roughness={0.25}
        transparent={dimmed}
        opacity={dimmed ? 0.22 : 1}
      />
    </mesh>
  );
}
