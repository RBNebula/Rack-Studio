import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Device, DeviceDefinition, Project } from '../model';
import { deviceRack, origin } from '../engineering/space';
import { devicePosition, mmToScene, mountingPlane } from '../engineering/geometry';
import { plateApertures, plateFoldBoxes, plateMountingSlots } from '../engineering/plates';

function roundedOutline(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const left = -width / 2;
  const right = width / 2;
  const radius = Math.min(1, height / 4);
  shape.moveTo(left + radius, 0);
  shape.lineTo(right - radius, 0);
  shape.quadraticCurveTo(right, 0, right, radius);
  shape.lineTo(right, height - radius);
  shape.quadraticCurveTo(right, height, right - radius, height);
  shape.lineTo(left + radius, height);
  shape.quadraticCurveTo(left, height, left, height - radius);
  shape.lineTo(left, radius);
  shape.quadraticCurveTo(left, 0, left + radius, 0);
  return shape;
}

function mountingSlot(x: number, y: number, width: number, height: number): THREE.Path {
  const path = new THREE.Path();
  const radius = height / 2;
  const straight = Math.max(0, (width - height) / 2);
  path.moveTo(x - straight, y - radius);
  path.absarc(x - straight, y, radius, -Math.PI / 2, Math.PI / 2, true);
  path.lineTo(x + straight, y + radius);
  path.absarc(x + straight, y, radius, Math.PI / 2, -Math.PI / 2, true);
  path.closePath();
  return path;
}

/**
 * Thin folded sheet with real visual apertures, including the integrated rack ears.
 * Cable routing deliberately uses the engine's conservative sheet envelope: these
 * small ventilation holes are not certified cable-entry apertures.
 */
export function PlateGeometry({
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
  const geometries = useMemo(() => {
    const plate = definition.plate;
    if (!plate) return [];
    const shape = roundedOutline(definition.faceWidthMm, definition.heightMm);
    for (const aperture of plateApertures(definition)) {
      const hole = new THREE.Path();
      hole.absellipse(
        aperture.x,
        aperture.y,
        aperture.radius,
        aperture.radius,
        0,
        Math.PI * 2,
        true,
      );
      shape.holes.push(hole);
    }
    for (const slot of plateMountingSlots(definition)) {
      shape.holes.push(mountingSlot(slot.x, slot.y, slot.width, slot.height));
    }
    const face = new THREE.ExtrudeGeometry(shape, {
      depth: plate.thicknessMm,
      bevelEnabled: false,
      curveSegments: 10,
      steps: 1,
    });
    // Local z=0 is the ear's rear bearing surface against the mounting rail.
    face.translate(0, 0, -plate.thicknessMm);
    const folds = plateFoldBoxes(definition).map((fold) => {
      const geometry = new THREE.BoxGeometry(...fold.size);
      geometry.translate(...fold.position);
      return geometry;
    });
    return [face, ...folds];
  }, [definition]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  if (!definition.plate) return null;
  const position = devicePosition(project, device);
  const bottom = position[1] - definition.heightMm / 2;
  return (
    <group
      position={mmToScene([
        origin(deviceRack(project, device))[0],
        bottom,
        mountingPlane(project, device),
      ])}
      rotation={device.face === 'rear' ? [0, Math.PI, 0] : [0, 0, 0]}
      scale={0.001}
    >
      {geometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={definition.color}
            metalness={0.42}
            roughness={0.7}
            transparent={dimmed}
            opacity={dimmed ? 0.22 : 1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
