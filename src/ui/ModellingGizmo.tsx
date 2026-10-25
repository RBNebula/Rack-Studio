import { useRef, useLayoutEffect, useEffect } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useStore } from '../state';
import { objectPose, transformObject } from '../engineering/modelling';
import type { Vec3 } from '../model';
export function ModellingGizmo() {
  const s = useStore(),
    ref = useRef<THREE.Group>(null!),
    dragging = useRef(false);
  const pose = objectPose(s.project, s.selection);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  useEffect(() => {
    if (!['translate', 'rotate'].includes(s.modelTool) && controls) {
      dragging.current = false;
      controls.enabled = true;
    }
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [s.modelTool, controls]);
  useLayoutEffect(() => {
    if (ref.current && pose && !dragging.current) {
      ref.current.position.fromArray(pose.position.map((v) => v / 1000));
      ref.current.rotation.set(
        ...(pose.rotationDeg.map((v) => (v * Math.PI) / 180) as [number, number, number]),
      );
    }
  }, [s.selection, s.project, s.modelTool, pose]);
  if (!s.showModelTools || !s.selection || !pose || !['translate', 'rotate'].includes(s.modelTool))
    return null;
  const g =
    s.selection.kind === 'guide'
      ? s.project.wiringGuides?.find((g) => g.id === s.selection!.id)
      : null;
  if (g && ((g.kind === 'point' && g.accessoryId) || (g.kind === 'line' && g.trayId))) return null;
  if (s.modelTool === 'rotate' && !['accessory', 'guide'].includes(s.selection.kind)) return null;
  const values = () => ({
    position: ref.current!.position.toArray().map((v) => v * 1000) as Vec3,
    rotationDeg: [ref.current!.rotation.x, ref.current!.rotation.y, ref.current!.rotation.z].map(
      (v) => (v * 180) / Math.PI,
    ) as Vec3,
  });
  return (
    <>
      <group ref={ref} />
      <TransformControls
        object={ref}
        mode={s.modelTool === 'rotate' ? 'rotate' : 'translate'}
        space="world"
        translationSnap={0.005}
        rotationSnap={Math.PI / 12}
        size={0.8}
        showX={s.selection.kind !== 'device'}
        showZ={s.selection.kind !== 'device'}
        onMouseDown={() => {
          dragging.current = true;
        }}
        onObjectChange={() => {
          if (dragging.current && ref.current && s.selection)
            s.set({ modelPreview: { selection: s.selection, ...values() } });
        }}
        onMouseUp={() => {
          if (ref.current && s.selection) {
            const v = values();
            s.edit('Object transformed.', (p) =>
              transformObject(p, s.selection!, v.position, v.rotationDeg),
            );
          }
          dragging.current = false;
          s.set({ modelPreview: null });
        }}
      />
    </>
  );
}
