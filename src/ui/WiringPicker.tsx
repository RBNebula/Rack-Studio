import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Endpoint, Vec3, Accessory } from '../model';
import { uid } from '../model';
import { offsetSurfacePoint } from '../engineering/wiring';
import { useStore } from '../state';
import { clickWiringGuide, connectWiringPort, placeWiringGuide } from './wiringActions';
import { pointToLocal, relativeRotation } from '../engineering/space';
import { targetPose } from '../engineering/attachments';
import { fixingGuide } from '../engineering/modelling';

function data(object: THREE.Object3D, key: string): unknown {
  for (let current: THREE.Object3D | null = object; current; current = current.parent)
    if (current.userData[key] !== undefined) return current.userData[key];
}
function visible(object: THREE.Object3D) {
  for (let current: THREE.Object3D | null = object; current; current = current.parent)
    if (!current.visible) return false;
  return true;
}

/** Capture native pointer input before equipment dragging or OrbitControls.
 * Raycast actual rendered surfaces, never a fabricated camera/work plane. */
export function WiringPicker() {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    const canvas = gl.domElement,
      ray = new THREE.Raycaster();
    const down = (event: PointerEvent) => {
      const s = useStore.getState();
      const placing = s.showModelTools && ['measure', 'anchor', 'tie'].includes(s.modelTool);
      if (
        (!placing && (s.wiringTool === 'off' || s.wiringTool === 'select')) ||
        event.button !== 0 ||
        event.altKey
      )
        return;
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((event.clientY - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      scene.updateMatrixWorld(true);
      const hits = ray
        .intersectObjects(scene.children, true)
        .filter(
          (h) =>
            h.object instanceof THREE.Mesh &&
            visible(h.object) &&
            (data(h.object, 'wiringSurface') ||
              data(h.object, 'wiringGuideId') ||
              data(h.object, 'wiringPort')),
        );
      const hit = hits[0];
      const guide = hit && data(hit.object, 'wiringGuideId');
      const port = hit && data(hit.object, 'wiringPort');
      if (placing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const target = hit && (data(hit.object, 'physicalTarget') as Accessory['attachment']);
        if (!hit?.face || !target) {
          s.set({ notice: 'Aim at a physical rack, equipment or tray surface.' });
          return;
        }
        const point = hit.point.toArray().map((v) => v * 1000) as Vec3;
        const normal = hit.face.normal
          .clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
          .normalize();
        if (s.modelTool === 'measure') {
          if (!s.measureStart)
            s.set({
              measureStart: point,
              notice: 'First measurement point set. Click the second surface.',
            });
          else if (
            s.edit('Measurement added.', (p) =>
              (p.measurements ??= []).push({
                id: uid('measure'),
                name: `Measurement ${(p.measurements?.length ?? 0) + 1}`,
                start: s.measureStart!,
                end: point,
              }),
            )
          )
            s.set({ measureStart: null });
          return;
        }
        const parent = targetPose(s.project, target),
          q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal),
          angles = new THREE.Euler().setFromQuaternion(q);
        const a: Accessory = {
          id: uid(s.modelTool),
          name: `${s.modelTool === 'tie' ? 'Tie' : 'Clip'} ${s.project.accessories.filter((a) => a.kind === 'tie' || a.kind === 'anchor').length + 1}`,
          kind: s.modelTool === 'tie' ? 'tie' : 'anchor',
          position: pointToLocal(parent, point),
          rotationDeg: relativeRotation(
            parent.rotationDeg,
            [angles.x, angles.y, angles.z].map((v) => (v * 180) / Math.PI) as Vec3,
          ),
          attachment: target,
          openingMm: 20,
          size: [24, 24, 12],
          parentId: null,
          cableIds: [],
          evidence: 'user-entered',
        };
        if (
          s.edit('Physical fixing attached; its guide follows the parent surface.', (p) => {
            p.accessories.push(a);
            fixingGuide(p, a);
          })
        )
          s.set({ selection: { kind: 'accessory', id: a.id }, modelTool: 'select' });
        return;
      }
      if (s.wiringTool === 'waypoints' || guide || (s.wiringTool === 'connect' && port)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (typeof guide === 'string') clickWiringGuide(guide);
        else if (s.wiringTool === 'connect' && port) connectWiringPort(port as Endpoint);
        else if (hit?.face) {
          const normal = hit.face.normal
            .clone()
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
            .normalize();
          placeWiringGuide(
            offsetSurfacePoint(hit.point.toArray().map((v) => v * 1000) as Vec3, normal.toArray()),
            event.shiftKey,
          );
        } else
          s.set({
            notice: 'Aim at a visible rack, equipment or tray surface to place a waypoint.',
          });
      }
    };
    canvas.addEventListener('pointerdown', down, true);
    return () => canvas.removeEventListener('pointerdown', down, true);
  }, [gl, camera, scene]);
  return null;
}
