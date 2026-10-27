import { useMemo } from 'react';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { Device, DeviceDefinition, MeshAsset, Project } from '../model';
import { deviceBoxes, devicePosition, mmToScene, mountingPlane } from '../engineering/geometry';
import { deviceRack, origin } from '../engineering/space';
import { decodeMeshAsset } from '../data/step';

/**
 * Display mesh of an imported STEP model. Every project edit clones the definitions, so decoded
 * geometry is cached by the asset's content shape rather than object identity. The mesh does not
 * take pointer rays; the definition's collision boxes are transparent pick volumes instead, which
 * keeps selection, dragging and tray-surface hits cheap.
 */
const cache = new Map<string, { color: string; geometry: THREE.BufferGeometry }[]>();
const keyOf = (m: MeshAsset) =>
  [
    m.fileName,
    m.triangles,
    m.quantumMm,
    ...m.boundsMm.min,
    ...m.boundsMm.max,
    ...m.groups.map((g) => `${g.color}:${g.positions.length}:${g.indices.length}`),
  ].join('|');
function geometriesFor(mesh: MeshAsset) {
  const key = keyOf(mesh);
  let found = cache.get(key);
  if (!found) {
    found = decodeMeshAsset(mesh).map((g) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return { color: g.color, geometry };
    });
    cache.set(key, found);
  }
  return found;
}
const noRaycast = () => undefined;

export function StepModelGeometry({
  project,
  device,
  definition,
  selected,
  dimmed,
}: {
  project: Project;
  device: Device;
  definition: DeviceDefinition & { mesh: MeshAsset };
  selected: boolean;
  dimmed: boolean;
}) {
  const parts = useMemo(() => geometriesFor(definition.mesh), [definition.mesh]);
  const bottom = devicePosition(project, device)[1] - definition.heightMm / 2;
  const opacity = dimmed ? 0.22 : 1;
  return (
    <>
      <group
        position={mmToScene([
          origin(deviceRack(project, device))[0],
          bottom,
          mountingPlane(project, device),
        ])}
        rotation={device.face === 'rear' ? [0, Math.PI, 0] : [0, 0, 0]}
        scale={0.001}
      >
        <group position={definition.mesh.offsetMm}>
          {parts.map((part, i) => (
            <mesh key={i} geometry={part.geometry} raycast={noRaycast} castShadow receiveShadow>
              <meshStandardMaterial
                color={part.color}
                metalness={0.35}
                roughness={0.55}
                transparent={opacity < 1}
                opacity={opacity}
                depthWrite={opacity >= 1}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      </group>
      {deviceBoxes(project, device).map((box) => (
        <mesh
          key={box.id}
          position={mmToScene(box.min.map((v, i) => (v + box.max[i]) / 2) as typeof box.min)}
          userData={{ wiringSurface: true, obstacleId: box.id }}
        >
          <boxGeometry args={mmToScene(box.max.map((v, i) => v - box.min[i]) as typeof box.min)} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          {selected && <Edges color="#20bdb0" transparent opacity={0.95} />}
        </mesh>
      ))}
    </>
  );
}
