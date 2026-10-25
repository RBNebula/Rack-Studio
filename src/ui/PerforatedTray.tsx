import { useMemo, useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Accessory, Project, Vec3 } from '../model';
import { useStore } from '../state';
import { traySlots } from '../engineering/model-designer';
import { accessoryPose } from '../engineering/attachments';
import { add, pointAtPose, pointToLocal, rotate } from '../engineering/space';
export function PerforatedTray({
  accessory: a,
  selected,
  project,
}: {
  accessory: Accessory;
  selected: boolean;
  project: Project;
}) {
  const { edit } = useStore();
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const [draft, setDraft] = useState<number | null>(null);
  const [w, h, originalLength] = a.size;
  const length = draft ?? originalLength;
  const thickness = Math.min(2.5, w / 4, h / 4, length / 4);
  const pose = accessoryPose(project, a);
  const center = pointAtPose(pose, [0, 0, (length - originalLength) / 2]);
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -length / 2);
    s.lineTo(w / 2, -length / 2);
    s.lineTo(w / 2, length / 2);
    s.lineTo(-w / 2, length / 2);
    s.closePath();
    for (const hole of traySlots(w, length)) {
      const p = new THREE.Path();
      p.moveTo(hole.x - hole.width / 2, hole.z - length / 2 - hole.length / 2);
      p.lineTo(hole.x - hole.width / 2, hole.z - length / 2 + hole.length / 2);
      p.lineTo(hole.x + hole.width / 2, hole.z - length / 2 + hole.length / 2);
      p.lineTo(hole.x + hole.width / 2, hole.z - length / 2 - hole.length / 2);
      p.closePath();
      s.holes.push(p);
    }
    return new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  }, [w, length, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      if (controls) controls.enabled = true;
    },
    [controls],
  );
  return (
    <group
      position={center.map((v) => v / 1000) as Vec3}
      rotation={pose.rotationDeg.map((v) => (v * Math.PI) / 180) as Vec3}
      scale={0.001}
    >
      <mesh
        geometry={geometry}
        position={[0, -h / 2 + thickness, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial color="#22272b" side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (w - thickness)) / 2, thickness / 2, 0]}>
          <boxGeometry args={[thickness, h - thickness, length]} />
          <meshStandardMaterial color="#252b30" />
        </mesh>
      ))}
      {selected && (
        <mesh
          userData={{ wiringSurface: false }}
          position={[0, 0, length / 2 + 8]}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as unknown as { setPointerCapture(id: number): void }).setPointerCapture(
              e.pointerId,
            );
            setDraft(originalLength);
            if (controls) controls.enabled = false;
          }}
          onPointerMove={(e) => {
            if (draft === null) return;
            e.stopPropagation();
            const near = new THREE.Vector3(
              ...(pointAtPose(pose, [0, 0, -originalLength / 2]).map((v) => v / 1000) as Vec3),
            );
            const far = new THREE.Vector3(
              ...(pointAtPose(pose, [0, 0, -originalLength / 2 + 3000]).map(
                (v) => v / 1000,
              ) as Vec3),
            );
            const segment = new THREE.Vector3();
            e.ray.distanceSqToSegment(near, far, undefined, segment);
            setDraft(
              Math.max(
                40,
                Math.min(
                  2000,
                  Math.round(
                    (pointToLocal(pose, segment.toArray().map((v) => v * 1000) as Vec3)[2] +
                      originalLength / 2 -
                      8) /
                      10,
                  ) * 10,
                ),
              ),
            );
          }}
          onPointerUp={(e) => {
            if (draft === null) return;
            e.stopPropagation();
            if (controls) controls.enabled = true;
            (
              e.target as unknown as { releasePointerCapture(id: number): void }
            ).releasePointerCapture(e.pointerId);
            const next = draft;
            setDraft(null);
            edit('Tray stretched; fixed slot pattern regenerated.', (p) => {
              const tray = p.accessories.find((v) => v.id === a.id)!;
              tray.size[2] = next;
              tray.position = add(
                a.position,
                rotate([0, 0, (next - originalLength) / 2], a.rotationDeg),
              );
            });
          }}
          onPointerCancel={() => {
            setDraft(null);
            if (controls) controls.enabled = true;
          }}
        >
          <boxGeometry args={[22, 22, 16]} />
          <meshBasicMaterial color="#1bac9c" />
        </mesh>
      )}
    </group>
  );
}
