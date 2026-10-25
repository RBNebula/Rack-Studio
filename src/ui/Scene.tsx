import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ComponentRef, CSSProperties, DragEvent, MutableRefObject, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import {
  Edges,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import type { Cable, Device, DeviceDefinition, Project, Rack, Vec3 } from '../model';
import { cableLabel, uid, clone } from '../model';
import { useStore } from '../state';
import {
  allObstacles,
  rackObstacles,
  deviceBoxes,
  devicePosition,
  effectiveEarThicknessMm,
  hasRackEars,
  mmToScene,
  mountingHoleY,
  mountingPlane,
  frontRailAt,
  portWorld,
  rearRailAt,
  U_MM,
  uBottom,
} from '../engineering/geometry';
import { placementIssues, projectWithPlacement as relocated } from '../engineering/placement';
import type { Obstacle } from '../engineering/geometry';
import { routeCable } from '../engineering/routing';
import type { CableRoute } from '../engineering/routing';
import { Icon } from './shared';
import { PlateGeometry } from './PlateGeometry';
import { UserRackPcGeometry } from './UserRackPcGeometry';
import { GenericSwitchGeometry } from './GenericSwitchGeometry';
import { LacingBarGeometry } from './LacingBarGeometry';
import { PortGlyph } from './PortGlyph';
import { portFaceAngle } from '../engineering/ports';
import { FaceFeatures } from './FaceFeatures';
import { PerforatedTray } from './PerforatedTray';
import { addAccessory } from './Inspector';
import { DeviceRails } from './DeviceRails';
import { WiringPanel } from './WiringPanel';
import { WiringPicker } from './WiringPicker';
import { clickWiringGuide, connectWiringPort } from './wiringActions';
import { ModellingPanel } from './ModellingPanel';
import { ModellingGizmo } from './ModellingGizmo';
import {
  add as addPosition,
  deviceRack,
  origin,
  pointAtPose,
  pointToLocal,
  relativeRotation,
  rackById,
  racks,
} from '../engineering/space';
import { accessoryBoxes, accessoryPose, targetPose } from '../engineering/attachments';
import { objectKey, objectPose, transformObject } from '../engineering/modelling';
import { resolvedGuidePoints } from '../engineering/wiring';
import './scene.css';

type Face = 'front' | 'rear';
type View = 'front' | 'rear' | 'left' | 'right' | 'top' | 'orbit';
interface SceneBridge {
  surfaceAt: (
    clientX: number,
    clientY: number,
  ) => {
    position: Vec3;
    normal: Vec3;
    target: NonNullable<Project['accessories'][number]['attachment']>;
  } | null;
  pointAt: (clientX: number, clientY: number, face: Face, u: number) => Vec3 | null;
}
interface PointerDrag {
  deviceId: string;
  startX: number;
  startY: number;
  offsetMm: number;
  moved: boolean;
  pointerId: number;
}
type MeshEvent = ThreeEvent<PointerEvent>;
type CaptureTarget = EventTarget & {
  setPointerCapture: (pointerId: number) => void;
  releasePointerCapture: (pointerId: number) => void;
};

const canSelectInViewport = () => {
  const s = useStore.getState();
  return !s.showModelTools || s.modelTool === 'select';
};
const finitePoint = (point: Vec3): boolean => point.every(Number.isFinite);
const centerOf = (box: Obstacle): Vec3 =>
  box.min.map((value, i) => (value + box.max[i]) / 2) as Vec3;
const sizeOf = (box: Obstacle): Vec3 => box.max.map((value, i) => value - box.min[i]) as Vec3;
const OverlayHost = createContext<HTMLDivElement | null>(null);

/** Each mount owns a fresh DOM container. Deferred root cleanup therefore cannot
 * delete a later StrictMode mount's children, and Canvas never shares its DOM
 * container with nested label roots. */
function SceneLabel({
  children,
  position = [0, 0, 0],
  center = false,
  zIndexRange = [5, 0],
  style,
}: {
  children: ReactNode;
  position?: Vec3;
  center?: boolean;
  zIndexRange?: [number, number];
  style?: CSSProperties;
}) {
  const host = useContext(OverlayHost);
  const object = useRef<THREE.Group | null>(null);
  const element = useRef<HTMLDivElement | null>(null);
  const root = useRef<Root | null>(null);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  useLayoutEffect(() => {
    if (!host) return;
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;top:0;left:0;will-change:transform;';
    host.appendChild(container);
    const contentRoot = createRoot(container);
    element.current = container;
    root.current = contentRoot;
    return () => {
      if (root.current === contentRoot) {
        root.current = null;
        element.current = null;
      }
      container.remove();
      // Finish outside the parent renderer's commit. The detached container and
      // its children stay owned by this root until its own unmount completes.
      queueMicrotask(() => contentRoot.unmount());
    };
  }, [host]);
  useLayoutEffect(() => {
    if (element.current) {
      element.current.style.pointerEvents = style?.pointerEvents ?? 'auto';
      element.current.style.zIndex = String(zIndexRange[0]);
    }
    root.current?.render(
      <div style={{ ...style, transform: center ? 'translate(-50%, -50%)' : undefined }}>
        {children}
      </div>,
    );
  }, [host, children, style, center, zIndexRange]);
  useFrame(({ camera, size }) => {
    if (!object.current || !element.current) return;
    object.current.updateWorldMatrix(true, false);
    object.current.getWorldPosition(scratch);
    scratch.project(camera);
    element.current.style.display = scratch.z < -1 || scratch.z > 1 ? 'none' : 'block';
    element.current.style.transform = `translate3d(${((scratch.x + 1) * size.width) / 2}px,${((1 - scratch.y) * size.height) / 2}px,0)`;
  });
  return <group ref={object} position={position} />;
}

export default function Scene() {
  const {
    project: storedProject,
    selection,
    view,
    orthographic,
    showCables,
    showLabels,
    showMeasurements,
    showGround,
    dragDefinitionId,
    dragDeviceId,
    previewU,
    placeFace,
    wiringTool,
    modelPreview,
    showModelTools,
    activeRackId,
    hiddenKeys,
    isolateKey,
    set,
    edit,
  } = useStore();
  const project = useMemo(() => {
    if (!modelPreview) return storedProject;
    const p = clone(storedProject);
    try {
      transformObject(p, modelPreview.selection, modelPreview.position, modelPreview.rotationDeg);
      return p;
    } catch {
      return storedProject;
    }
  }, [storedProject, modelPreview]);
  const activeRack = rackById(project, activeRackId ?? undefined);
  const shown = (kind: Parameters<typeof objectKey>[0]['kind'], id: string) =>
    !hiddenKeys.includes(objectKey({ kind, id })) &&
    (!isolateKey ||
      isolateKey === objectKey({ kind, id }) ||
      (kind === 'device' &&
        isolateKey ===
          objectKey({
            kind: 'rack',
            id: deviceRack(
              project,
              project.devices.find((d) => d.id === id)!,
            ).id,
          })));
  const bridge = useRef<SceneBridge | null>(null);
  const pointerDrag = useRef<PointerDrag | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [overViewport, setOverViewport] = useState(false);
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  const draggedDevice = project.devices.find((device) => device.id === dragDeviceId);
  const draggedDefinition = project.definitions.find(
    (definition) => definition.id === (draggedDevice?.definitionId ?? dragDefinitionId),
  );
  const dragging = Boolean(dragDefinitionId || dragDeviceId);

  const candidateAt = useCallback((u: number, definitionId?: string): Device | null => {
    const state = useStore.getState();
    const existing = state.project.devices.find((device) => device.id === state.dragDeviceId);
    const definition = state.project.definitions.find(
      (item) => item.id === (existing?.definitionId ?? definitionId ?? state.dragDefinitionId),
    );
    if (!definition) return null;
    const face = existing?.face ?? state.placeFace;
    const rack = rackById(state.project, existing?.rackId ?? state.activeRackId ?? undefined);
    const shelf =
      definition.mounting === 'freestanding'
        ? state.project.devices.find((device) => {
            const support = state.project.definitions.find(
              (item) => item.id === device.definitionId,
            );
            return (
              support?.mounting === 'shelf' &&
              deviceRack(state.project, device).id === rack.id &&
              device.face === face &&
              u >= device.startU &&
              u < device.startU + support.heightU
            );
          })
        : undefined;
    return {
      id: existing?.id ?? 'placement-preview',
      definitionId: definition.id,
      rackId: rack.id === state.project.rack.id ? undefined : rack.id,
      name:
        existing?.name ??
        `${definition.name} ${state.project.devices.filter((device) => device.definitionId === definition.id).length + 1}`,
      startU: shelf?.startU ?? u,
      face,
      supportId: shelf?.id ?? existing?.supportId ?? null,
      installation: 'installed',
    };
  }, []);

  const updatePreview = useCallback(
    (clientX: number, clientY: number, offsetMm = 0, definitionId?: string): Device | null => {
      const state = useStore.getState();
      const device = state.project.devices.find((item) => item.id === state.dragDeviceId);
      const face = device?.face ?? state.placeFace;
      let u =
        state.previewU ??
        device?.startU ??
        Math.ceil(
          rackById(state.project, device?.rackId ?? state.activeRackId ?? undefined).heightU / 2,
        );
      const rack = rackById(state.project, device?.rackId ?? state.activeRackId ?? undefined),
        offset = origin(rack);
      let point = bridge.current?.pointAt(clientX, clientY, face, u) ?? null;
      if (!point || Math.abs(point[0] - offset[0]) > rack.outerWidthMm / 2) {
        state.set({ previewU: null });
        return null;
      }
      const snap = device ? Math.round : Math.floor;
      u = snap((point[1] - offset[1] - offsetMm) / U_MM) + 1;
      // Rear planes may change depth at a section boundary. Reproject once on the target plane.
      if (face === 'rear' && u >= 1 && u <= rack.heightU) {
        point = bridge.current?.pointAt(clientX, clientY, face, u) ?? point;
        u = snap((point[1] - offset[1] - offsetMm) / U_MM) + 1;
      }
      const candidate = candidateAt(u, definitionId);
      state.set({ previewU: candidate?.startU ?? null });
      return candidate;
    },
    [candidateAt],
  );

  const commit = useCallback(
    (candidate: Device | null) => {
      const state = useStore.getState();
      if (!candidate) {
        state.set({
          error: 'Release over the rack to choose a mounting position.',
          previewU: null,
        });
        return;
      }
      const issues = placementIssues(state.project, candidate);
      if (issues.length) {
        state.set({
          error: `Cannot place ${candidate.name} at U${candidate.startU}: ${issues.join(' ')}`,
        });
        return;
      }
      const moving = state.project.devices.some((device) => device.id === candidate.id);
      const installed = moving ? candidate : { ...candidate, id: uid('device') };
      const next = relocated(state.project, installed);
      if (
        edit(
          `${moving ? 'Moved' : 'Placed'} ${installed.name} at U${installed.startU}. Connected cables remain linked; review their route validation. Installation animations are not implemented.`,
          (draft) => {
            draft.devices = next.devices;
          },
        )
      ) {
        set({ selection: { kind: 'device', id: installed.id } });
      }
    },
    [edit, set],
  );

  const clearDrag = useCallback(() => {
    pointerDrag.current = null;
    setOverViewport(false);
    set({ dragDeviceId: null, dragDefinitionId: null, previewU: null });
  }, [set]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearDrag();
    };
    const onBlur = () => clearDrag();
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [clearDrag]);

  const beginDeviceDrag = useCallback(
    (device: Device, event: MeshEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      if (
        useStore.getState().wiringTool !== 'off' ||
        (useStore.getState().showModelTools && useStore.getState().modelTool !== 'select')
      )
        return;
      const point = bridge.current?.pointAt(
        event.clientX,
        event.clientY,
        device.face,
        device.startU,
      );
      pointerDrag.current = {
        deviceId: device.id,
        startX: event.clientX,
        startY: event.clientY,
        offsetMm: point
          ? point[1] -
            origin(deviceRack(useStore.getState().project, device))[1] -
            uBottom(device.startU)
          : 0,
        moved: false,
        pointerId: event.pointerId,
      };
      (event.target as CaptureTarget | null)?.setPointerCapture(event.pointerId);
      set({
        selection: { kind: 'device', id: device.id },
        dragDeviceId: device.id,
        dragDefinitionId: null,
        previewU: device.startU,
      });
    },
    [set],
  );

  const moveDeviceDrag = useCallback(
    (event: MeshEvent) => {
      const current = pointerDrag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      event.stopPropagation();
      if (
        !current.moved &&
        Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 5
      )
        return;
      current.moved = true;
      updatePreview(event.clientX, event.clientY, current.offsetMm);
    },
    [updatePreview],
  );

  const endDeviceDrag = useCallback(
    (event: MeshEvent) => {
      const current = pointerDrag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      event.stopPropagation();
      if (current.moved) commit(updatePreview(event.clientX, event.clientY, current.offsetMm));
      (event.target as CaptureTarget | null)?.releasePointerCapture(event.pointerId);
      clearDrag();
    },
    [clearDrag, commit, updatePreview],
  );

  function dragOver(event: DragEvent<HTMLDivElement>) {
    if (
      !useStore.getState().dragDefinitionId &&
      !event.dataTransfer.types.includes('application/rack-definition')
    )
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setOverViewport(true);
    updatePreview(event.clientX, event.clientY);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.getData('application/rack-tray')) {
      event.preventDefault();
      const hit = bridge.current?.surfaceAt(event.clientX, event.clientY);
      const point =
        hit?.position ?? bridge.current?.pointAt(event.clientX, event.clientY, 'front', 1);
      if (point) {
        const state = useStore.getState();
        let id = '';
        if (
          state.edit(
            hit
              ? 'Tray placed on the chosen surface.'
              : 'Tray placed on the rack front workplane. Use Move / Rotate for free placement.',
            (p) => {
              addAccessory(p, 'tray');
              const tray = p.accessories.at(-1)!;
              id = tray.id;
              if (hit) {
                const parent = targetPose(p, hit.target);
                tray.attachment = hit.target;
                tray.position = pointToLocal(
                  parent,
                  point.map((v, i) => v + hit.normal[i] * (tray.size[1] / 2 + 1)) as Vec3,
                );
                const q = new THREE.Quaternion().setFromUnitVectors(
                  new THREE.Vector3(0, 1, 0),
                  new THREE.Vector3(...hit.normal),
                );
                const e = new THREE.Euler().setFromQuaternion(q);
                tray.rotationDeg = relativeRotation(
                  parent.rotationDeg,
                  [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI) as Vec3,
                );
              } else tray.position = point;
            },
          )
        )
          state.set({ selection: { kind: 'accessory', id } });
      }
      return;
    }
    const definitionId =
      event.dataTransfer.getData('application/rack-definition') ||
      useStore.getState().dragDefinitionId;
    if (!definitionId) return;
    event.preventDefault();
    event.stopPropagation();
    commit(updatePreview(event.clientX, event.clientY, 0, definitionId));
    clearDrag();
  }

  const preview = dragging && previewU !== null ? candidateAt(previewU) : null;
  const previewIssues = useMemo(
    () => (preview ? placementIssues(project, preview) : []),
    [project, preview],
  );
  const previewValid = preview !== null && previewIssues.length === 0;
  const previewProject = useMemo(
    () => (preview && dragDeviceId ? relocated(project, preview) : project),
    [project, preview, dragDeviceId],
  );
  const views: { id: View; label: string }[] = [
    { id: 'front', label: 'Front' },
    { id: 'rear', label: 'Rear' },
    { id: 'left', label: 'Left' },
    { id: 'right', label: 'Right' },
    { id: 'top', label: 'Top' },
    { id: 'orbit', label: '3D' },
  ];
  const label =
    preview && draggedDefinition
      ? `U${preview.startU}${draggedDefinition.heightU > 1 ? `–${preview.startU + draggedDefinition.heightU - 1}` : ''}`
      : '';

  return (
    <section
      className={`scene-container ${dragging ? 'is-dragging' : ''}`}
      aria-label="3D rack viewport"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/rack-tray')) e.preventDefault();
        else dragOver(e as DragEvent<HTMLDivElement>);
      }}
      onDrop={drop}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOverViewport(false);
      }}
    >
      <div className="scene-toolbar">
        <div className="view-buttons" role="group" aria-label="Camera views">
          {views.map((item) => (
            <button
              key={item.id}
              aria-label={`${item.label === '3D' ? 'Orbit 3D' : item.label} view`}
              aria-pressed={view === item.id}
              className={view === item.id ? 'active' : ''}
              disabled={dragging}
              onClick={() =>
                set({
                  view: item.id,
                  ...(item.id === 'front' || item.id === 'rear' ? { placeFace: item.id } : {}),
                })
              }
            >
              {item.id === 'orbit' && <Icon name="cube" size={14} />}
              {item.label}
            </button>
          ))}
        </div>
        <div className="scene-tools" role="group" aria-label="Viewport settings">
          <select
            aria-label="Drop mounting face"
            title="Mounting face for new equipment drops"
            value={placeFace}
            disabled={dragging}
            onChange={(e) => set({ placeFace: e.target.value as 'front' | 'rear' })}
          >
            <option value="front">Mount: Front</option>
            <option value="rear">Mount: Rear</option>
          </select>
          <button
            aria-label="Modelling tools"
            aria-pressed={showModelTools}
            className={showModelTools ? 'active' : ''}
            onClick={() =>
              set({
                showModelTools: !showModelTools,
                wiringTool: 'off',
                modelTool: 'select',
                modelPreview: null,
              })
            }
          >
            Tools
          </button>
          <button
            aria-label="Wiring mode"
            aria-pressed={wiringTool !== 'off'}
            className={wiringTool !== 'off' ? 'active' : ''}
            onClick={() =>
              set({
                wiringTool: wiringTool === 'off' ? 'connect' : 'off',
                showModelTools: false,
                modelTool: 'select',
                wiringSource: null,
                wiringLineStart: null,
                dragDeviceId: null,
                previewU: null,
              })
            }
          >
            Wiring
          </button>
          <button
            title="Toggle orthographic camera"
            aria-label="Orthographic camera"
            aria-pressed={orthographic}
            className={orthographic ? 'active' : ''}
            disabled={dragging}
            onClick={() => set({ orthographic: !orthographic })}
          >
            Ortho
          </button>
          <button
            title="Toggle port and U labels"
            aria-label="Show labels"
            aria-pressed={showLabels}
            className={showLabels ? 'active' : ''}
            onClick={() => set({ showLabels: !showLabels })}
          >
            <Icon name="layers" size={16} />
          </button>
          <button
            title="Show dimension guides"
            aria-label="Show measurements"
            aria-pressed={showMeasurements}
            className={showMeasurements ? 'active' : ''}
            onClick={() => set({ showMeasurements: !showMeasurements })}
          >
            <Icon name="ruler" size={16} />
          </button>
          <button
            title="Show cables"
            aria-label="Show cables"
            aria-pressed={showCables}
            className={showCables ? 'active' : ''}
            onClick={() => set({ showCables: !showCables })}
          >
            <Icon name="cable" size={16} />
          </button>
          <button
            title="Reset camera"
            aria-label="Reset camera"
            disabled={dragging}
            onClick={() => setResetKey((key) => key + 1)}
          >
            <Icon name="refresh" size={16} />
          </button>
        </div>
      </div>
      <WiringPanel />
      <ModellingPanel />
      <div className="scene-model-info">
        <span className="scene-model-kicker">RACK WORKSPACE</span>
        <strong>{activeRack.name}</strong>
        <span>
          {project.rack.heightU}U <i /> {project.rack.outerWidthMm} mm wide <i /> Millimetres
        </span>
      </div>
      <div className="canvas-wrap">
        <OverlayHost.Provider value={overlayHost}>
          <Canvas
            shadows
            dpr={[1, 1.75]}
            gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
            camera={{ position: [1.35, 1.05, -1.85], fov: 38, near: 0.01, far: 100 }}
            fallback={
              <div className="scene-fallback">
                WebGL is unavailable. Use the property editor and schedule, or enable browser
                hardware acceleration to view the rack.
              </div>
            }
            onPointerMissed={(event) => {
              if (
                event.type === 'click' &&
                !useStore.getState().dragDeviceId &&
                useStore.getState().wiringTool === 'off'
              )
                set({ selection: null });
            }}
          >
            <color attach="background" args={['#edf1f1']} />
            <ambientLight intensity={1.5} />
            <hemisphereLight args={['#f4fbff', '#87949b', 1.4]} />
            <directionalLight
              position={[-2.5, 4, -3]}
              intensity={3.8}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-2}
              shadow-camera-right={2}
              shadow-camera-top={3}
              shadow-camera-bottom={-2}
              shadow-bias={-0.00015}
            />
            <directionalLight position={[2, 1.5, 2]} intensity={2.4} color="#d6e5eb" />
            {orthographic ? (
              <OrthographicCamera
                makeDefault
                position={[1.35, 1.05, -1.85]}
                zoom={480}
                near={0.01}
                far={100}
              />
            ) : (
              <PerspectiveCamera
                makeDefault
                position={[1.35, 1.05, -1.85]}
                fov={38}
                near={0.01}
                far={100}
              />
            )}
            <CameraRig bridge={bridge} resetKey={resetKey} dragging={dragging} />
            <WiringPicker />
            {showGround && (
              <SceneGround
                frameMm={
                  (project.rack.frameStyle === 'explicit' ? 0 : project.rack.frameMm) +
                  (project.rack.endPanels?.base ? project.rack.endPanels.thicknessMm : 0)
                }
              />
            )}
            {racks(project)
              .filter((r) => shown('rack', r.id))
              .map((r) => (
                <RackStructure key={r.id} project={project} rack={r} />
              ))}
            {(project.sharedMembers ?? [])
              .filter((m) => shown('member', m.id))
              .map((m) => (
                <group
                  key={m.id}
                  userData={{ physicalTarget: { kind: 'member', id: m.id } }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!canSelectInViewport()) return;
                    set({ selection: { kind: 'member', id: m.id } });
                  }}
                >
                  {allObstacles(project)
                    .filter((b) => b.id.startsWith(`shared:rack:member:${m.id}`))
                    .map((b) => (
                      <SolidBox key={b.id} box={b} color="#67777d" />
                    ))}
                </group>
              ))}
            {project.devices
              .filter((d) => shown('device', d.id))
              .map((device) => (
                <Equipment
                  key={device.id}
                  project={project}
                  device={device}
                  selected={selection?.kind === 'device' && selection.id === device.id}
                  dimmed={dragDeviceId === device.id && Boolean(pointerDrag.current?.moved)}
                  onDown={beginDeviceDrag}
                  onMove={moveDeviceDrag}
                  onUp={endDeviceDrag}
                />
              ))}
            {preview && (dragDefinitionId ? overViewport : pointerDrag.current?.moved) && (
              <PlacementPreview
                project={relocated(project, preview)}
                device={preview}
                valid={previewValid}
              />
            )}
            <Management project={project} shown={shown} />
            <ModellingGizmo />
            {showModelTools && selection && objectPose(project, selection) && (
              <SceneLabel
                position={mmToScene(objectPose(project, selection)!.position)}
                center
                style={{ pointerEvents: 'none' }}
              >
                <span className="model-pivot" data-model-pivot={objectKey(selection)} />
              </SceneLabel>
            )}
            <UserMeasurements project={project} />
            {(wiringTool !== 'off' || showModelTools) && (
              <WiringGuides project={project} shown={shown} />
            )}
            {showCables &&
              project.cables
                .filter((c) => shown('cable', c.id))
                .map((cable) => (
                  <RenderedCable key={cable.id} project={previewProject} cable={cable} />
                ))}
            {showLabels && (
              <group position={mmToScene(origin(activeRack))}>
                <RackLabels
                  project={{ ...project, rack: activeRack }}
                  preview={preview}
                  rear={view === 'rear'}
                />
              </group>
            )}
            {showMeasurements && (
              <group position={mmToScene(origin(activeRack))}>
                <Measurements project={{ ...project, rack: activeRack }} />
              </group>
            )}
          </Canvas>
        </OverlayHost.Provider>
        <div className="scene-overlays" ref={setOverlayHost} />
      </div>
      {dragging && (
        <div
          className={`scene-placement-message ${previewValid ? 'valid' : 'invalid'}`}
          role="status"
        >
          <Icon name={previewValid ? 'check' : 'alert'} size={17} />
          <div>
            <strong>
              {preview
                ? `${label} · ${previewValid ? 'Ready to place' : 'Placement blocked'}`
                : 'Move over a rack mounting position'}
            </strong>
            <span>
              {preview
                ? previewValid
                  ? `${draggedDefinition?.name} · ${preview.face} mounting plane`
                  : previewIssues[0]
                : `Drop onto the ${placeFace} mounting plane. Press Esc to cancel.`}
            </span>
          </div>
        </div>
      )}
      <div className="scene-footer">
        <span>
          <span className="scene-status-dot" />
          {project.devices.length} devices <b>·</b> {project.cables.length} cables
        </span>
        <span>
          {dragging ? 'ESC to cancel' : 'Drag to orbit · Scroll to zoom · Right-drag to pan'}
        </span>
      </div>
      <div className="scene-axis" aria-hidden="true">
        <span className="axis-y">Y</span>
        <span className="axis-z">Z</span>
        <span className="axis-x">X</span>
        <i />
      </div>
    </section>
  );
}

function CameraRig({
  bridge,
  resetKey,
  dragging,
}: {
  bridge: MutableRefObject<SceneBridge | null>;
  resetKey: number;
  dragging: boolean;
}) {
  const { camera, gl, size, invalidate, scene } = useThree();
  const { project, view, orthographic } = useStore();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const bounds = useMemo(() => {
    const points: Vec3[] = racks(project).flatMap((r) => [
      addPosition(origin(r), [-r.outerWidthMm / 2, 0, -r.frontInsetMm]),
      addPosition(origin(r), [
        r.outerWidthMm / 2,
        r.heightU * U_MM,
        Math.max(...r.sections.map((s) => s.overallDepthMm)) - r.frontInsetMm,
      ]),
    ]);
    for (const box of allObstacles(project).filter((b) => !b.id.startsWith('rack:')))
      points.push(box.min, box.max);
    for (const d of project.destinations) if (d.routeIn3D && d.position) points.push(d.position);
    return {
      min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec3,
      max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vec3,
    };
  }, [project]);
  const height = mmToScene(bounds.max[1] - bounds.min[1]),
    width = mmToScene(bounds.max[0] - bounds.min[0]),
    depth = mmToScene(bounds.max[2] - bounds.min[2]);
  const centerX = mmToScene((bounds.min[0] + bounds.max[0]) / 2),
    baseY = mmToScene(bounds.min[1]),
    baseZ = mmToScene(bounds.min[2]);

  useEffect(() => {
    const target = new THREE.Vector3(centerX, height * 0.48 + baseY, depth * 0.38 + baseZ);
    const extent = Math.max(height, width, depth, 0.45);
    const distance = extent * 2.15;
    const positions: Record<View, THREE.Vector3> = {
      front: new THREE.Vector3(target.x, target.y, target.z - distance),
      rear: new THREE.Vector3(target.x, target.y, target.z + distance),
      left: new THREE.Vector3(target.x - distance, target.y, target.z),
      right: new THREE.Vector3(target.x + distance, target.y, target.z),
      top: new THREE.Vector3(target.x + 0.00001, target.y + distance, target.z),
      orbit: new THREE.Vector3(
        target.x + extent * 1.15,
        target.y + extent * 0.58,
        target.z - extent * 1.85,
      ),
    };
    camera.position.copy(positions[view]);
    camera.up.set(0, 1, 0);
    if (view === 'top') camera.up.set(0, 0, 1);
    camera.lookAt(target);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.min(
        size.height / (extent * 1.42),
        size.width / (Math.max(width, depth) * 1.8),
      );
      camera.updateProjectionMatrix();
    }
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
    invalidate();
  }, [
    camera,
    view,
    orthographic,
    height,
    width,
    centerX,
    baseY,
    baseZ,
    depth,
    resetKey,
    size.height,
    size.width,
    invalidate,
  ]);

  useEffect(() => {
    const raycaster = new THREE.Raycaster(),
      ndc = new THREE.Vector2(),
      hit = new THREE.Vector3();
    bridge.current = {
      surfaceAt(clientX, clientY) {
        const bounds = gl.domElement.getBoundingClientRect();
        ndc.set(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          1 - ((clientY - bounds.top) / bounds.height) * 2,
        );
        raycaster.setFromCamera(ndc, camera);
        scene.updateMatrixWorld(true);
        const targetFor = (object: THREE.Object3D) => {
          for (let o: THREE.Object3D | null = object; o; o = o.parent) {
            if (!o.visible) return null;
            if (o.userData.physicalTarget)
              return o.userData.physicalTarget as NonNullable<
                Project['accessories'][number]['attachment']
              >;
          }
          return null;
        };
        const hit = raycaster
          .intersectObjects(scene.children, true)
          .find((h) => h.object instanceof THREE.Mesh && targetFor(h.object));
        if (!hit?.face) return null;
        const target = targetFor(hit.object)!;
        const normal = hit.face.normal
          .clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
          .normalize();
        return {
          position: hit.point.toArray().map((v) => v * 1000) as Vec3,
          normal: normal.toArray(),
          target,
        };
      },
      pointAt(clientX, clientY, face, u) {
        const bounds = gl.domElement.getBoundingClientRect();
        ndc.set(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          (-(clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const state = useStore.getState();
        const device = state.project.devices.find((d) => d.id === state.dragDeviceId);
        const rack = rackById(state.project, device?.rackId ?? state.activeRackId ?? undefined);
        const rail =
          origin(rack)[2] +
          (face === 'rear'
            ? rearRailAt(rack, Math.max(1, Math.min(rack.heightU, u)))
            : frontRailAt(rack, Math.max(1, Math.min(rack.heightU, u))));
        if (!Number.isFinite(rail)) return null;
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -mmToScene(rail));
        if (!raycaster.ray.intersectPlane(plane, hit)) return null;
        return [hit.x * 1000, hit.y * 1000, hit.z * 1000];
      },
    };
    const screenshot = () => {
      invalidate();
      requestAnimationFrame(() => {
        const link = document.createElement('a');
        link.download = 'rack-studio-view.png';
        link.href = gl.domElement.toDataURL('image/png');
        link.click();
      });
    };
    window.addEventListener('rack-screenshot', screenshot);
    return () => {
      bridge.current = null;
      window.removeEventListener('rack-screenshot', screenshot);
    };
  }, [bridge, camera, gl, invalidate, scene]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!dragging}
      enableDamping
      dampingFactor={0.12}
      minDistance={0.25}
      maxDistance={12}
      minZoom={70}
      maxZoom={3000}
      maxPolarAngle={Math.PI * 0.94}
    />
  );
}

function SceneGround({ frameMm }: { frameMm: number }) {
  const y = -mmToScene(frameMm) - 0.002;
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, y - 0.001, 0]}>
        <planeGeometry args={[200, 200]} />
        <shadowMaterial transparent opacity={0.16} />
      </mesh>
      <gridHelper args={[12, 120, '#d7dfe0', '#e0e6e6']} position={[0, y, 0]} />
    </group>
  );
}

function SolidBox({
  box,
  color,
  selected = false,
  opacity = 1,
}: {
  box: Obstacle;
  color: string;
  selected?: boolean;
  opacity?: number;
}) {
  const center = centerOf(box),
    size = sizeOf(box);
  if (!finitePoint(center) || !size.every((value) => Number.isFinite(value) && value > 0))
    return null;
  return (
    <mesh
      position={mmToScene(center)}
      userData={{ wiringSurface: true, obstacleId: box.id }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={mmToScene(size)} />
      <meshStandardMaterial
        color={color}
        metalness={0.62}
        roughness={0.38}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity >= 1}
      />
      <Edges
        color={selected ? '#20bdb0' : '#687682'}
        transparent
        opacity={selected ? 0.95 : 0.16}
      />
    </mesh>
  );
}

function RackStructure({ project, rack }: { project: Project; rack: Rack }) {
  const boxes = useMemo(() => rackObstacles(project, rack), [project, rack]);
  return (
    <group
      userData={{ physicalTarget: { kind: 'rack', id: rack.id } }}
      onPointerDown={(e) => {
        if (useStore.getState().showModelTools && canSelectInViewport()) {
          e.stopPropagation();
          useStore
            .getState()
            .set({ selection: { kind: 'rack', id: rack.id }, activeRackId: rack.id });
        }
      }}
    >
      {boxes.map((box) => (
        <SolidBox key={box.id} box={box} color={rack.color} />
      ))}
      {rack.sections.flatMap((section) =>
        Array.from(
          { length: section.endU - section.startU + 1 },
          (_, index) => section.startU + index,
        ).flatMap((u) =>
          [-1, 1].flatMap((side) =>
            [0, 1, 2].flatMap((hole) =>
              [false, true].map((rear) => {
                const y = mountingHoleY(u, hole),
                  z = (rear ? section.rearRailZMm : section.frontRailZMm) + (rear ? 1 : -1) * 0.04;
                return (
                  <mesh
                    key={`${section.id}-${u}-${side}-${hole}-${rear}`}
                    position={mmToScene(
                      addPosition(origin(rack), [(side * rack.railCentersMm) / 2, y, z]),
                    )}
                    rotation={rear ? [0, 0, 0] : [0, Math.PI, 0]}
                  >
                    {rack.holeType === 'round' || rack.holeType === 'threaded' ? (
                      <circleGeometry args={[0.0019, 8]} />
                    ) : (
                      <planeGeometry args={[0.0038, 0.0038]} />
                    )}
                    <meshBasicMaterial color="#17212a" />
                  </mesh>
                );
              }),
            ),
          ),
        ),
      )}
    </group>
  );
}

function makeFaceTexture(definition: DeviceDefinition, device: Device): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = Math.max(144, Math.round(144 * definition.heightU));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const w = canvas.width,
      h = canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#687883');
    gradient.addColorStop(0.07, definition.color);
    gradient.addColorStop(1, '#202e39');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f2f7f9';
    ctx.font = `600 ${Math.min(30, h * 0.17)}px system-ui`;
    ctx.fillText(device.name.toUpperCase(), 58, Math.min(46, h * 0.29));
    ctx.fillStyle = '#9daeb9';
    ctx.font = '18px system-ui';
    ctx.fillText(
      definition.evidence === 'example' ? 'GENERIC EXAMPLE' : definition.manufacturer.toUpperCase(),
      60,
      definition.heightU === 1 ? h - 12 : 73,
    );
    if (definition.category === 'Servers' || definition.category === 'Computers') {
      ctx.fillStyle = '#18252e';
      for (let x = 360; x < w - 200; x += 14)
        for (let y = 30; y < h - 22; y += 15) ctx.fillRect(x, y, 5, 8);
    }
    ctx.fillStyle = '#71818d';
    ctx.fillRect(28, 15, 3, h - 30);
    ctx.fillRect(w - 31, 15, 3, h - 30);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function FaceImage({ source, width, height }: { source: string; width: number; height: number }) {
  const texture = useMemo(() => {
    const image = new Image();
    const map = new THREE.Texture(image);
    map.colorSpace = THREE.SRGBColorSpace;
    image.onload = () => {
      map.needsUpdate = true;
    };
    image.src = source;
    return map;
  }, [source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

function Equipment({
  project,
  device,
  selected,
  dimmed,
  onDown,
  onMove,
  onUp,
}: {
  project: Project;
  device: Device;
  selected: boolean;
  dimmed: boolean;
  onDown: (device: Device, event: MeshEvent) => void;
  onMove: (event: MeshEvent) => void;
  onUp: (event: MeshEvent) => void;
}) {
  const definition = project.definitions.find((item) => item.id === device.definitionId);
  if (!definition) return null;
  return (
    <EquipmentModel
      project={project}
      device={device}
      definition={definition}
      selected={selected}
      dimmed={dimmed}
      onDown={onDown}
      onMove={onMove}
      onUp={onUp}
    />
  );
}

function EquipmentModel({
  project,
  device,
  definition,
  selected,
  dimmed,
  onDown,
  onMove,
  onUp,
}: {
  project: Project;
  device: Device;
  definition: DeviceDefinition;
  selected: boolean;
  dimmed: boolean;
  onDown: (device: Device, event: MeshEvent) => void;
  onMove: (event: MeshEvent) => void;
  onUp: (event: MeshEvent) => void;
}) {
  const { set, showLabels } = useStore();
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const boxes = deviceBoxes(project, device),
    position = devicePosition(project, device);
  const sign = device.face === 'rear' ? -1 : 1;
  const frontZ =
    mountingPlane(project, device) -
    sign *
      ((definition.plate?.thicknessMm ??
        (hasRackEars(definition) ? effectiveEarThicknessMm(definition) : 0)) +
        0.02);
  const texture = useMemo(
    () =>
      definition.plate || definition.lacing || definition.appearance !== null
        ? null
        : makeFaceTexture(definition, device),
    [definition, device],
  );
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!finitePoint(position)) return null;
  const selectedBox = {
    id: 'selection',
    min: [
      origin(deviceRack(project, device))[0] - definition.faceWidthMm / 2 - 2,
      position[1] - definition.heightMm / 2 - 1,
      frontZ - 0.1,
    ] as Vec3,
    max: [
      origin(deviceRack(project, device))[0] + definition.faceWidthMm / 2 + 2,
      position[1] + definition.heightMm / 2 + 1,
      frontZ + 0.1,
    ] as Vec3,
  };
  return (
    <group
      onPointerDown={(event) => onDown(device, event)}
      userData={{ wiringSurface: true, physicalTarget: { kind: 'device', id: device.id } }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => useStore.getState().set({ dragDeviceId: null, previewU: null })}
    >
      {definition.lacing ? (
        <LacingBarGeometry
          project={project}
          device={device}
          definition={definition}
          dimmed={dimmed}
        />
      ) : definition.plate ? (
        <PlateGeometry project={project} device={device} definition={definition} dimmed={dimmed} />
      ) : definition.appearance === 'user-rack-pc' ? (
        <UserRackPcGeometry
          project={project}
          device={device}
          definition={definition}
          dimmed={dimmed}
        />
      ) : definition.appearance === 'generic-switch-24' ? (
        <GenericSwitchGeometry
          project={project}
          device={device}
          definition={definition}
          dimmed={dimmed}
        />
      ) : (
        boxes.map((box) => (
          <SolidBox
            key={box.id}
            box={box}
            color={definition.color}
            selected={selected}
            opacity={dimmed ? 0.22 : 1}
          />
        ))
      )}
      <DeviceRails project={project} device={device} />
      <group
        position={mmToScene([
          origin(deviceRack(project, device))[0],
          position[1] - definition.heightMm / 2,
          mountingPlane(project, device),
        ])}
        rotation={device.face === 'rear' ? [0, Math.PI, 0] : [0, 0, 0]}
        scale={0.001}
      >
        <FaceFeatures definition={definition} />
      </group>
      {!definition.plate &&
        definition.appearance === null &&
        definition.mounting !== 'shelf' &&
        definition.bodyMode !== 'parts' && (
          <group
            position={mmToScene([origin(deviceRack(project, device))[0], position[1], frontZ])}
            rotation={device.face === 'front' ? [0, Math.PI, 0] : [0, 0, 0]}
          >
            <mesh>
              <planeGeometry
                args={[mmToScene(definition.widthMm), mmToScene(definition.heightMm)]}
              />
              <meshStandardMaterial
                map={texture}
                metalness={0.42}
                roughness={0.56}
                transparent={dimmed}
                opacity={dimmed ? 0.25 : 1}
              />
            </mesh>
            {definition.frontImage && (
              <FaceImage
                source={definition.frontImage}
                width={mmToScene(definition.faceWidthMm)}
                height={mmToScene(definition.heightMm)}
              />
            )}
          </group>
        )}
      {!definition.plate &&
        !definition.lacing &&
        definition.appearance === null &&
        hasRackEars(definition) && (
          <EarMountingMarks
            project={project}
            device={device}
            definition={definition}
            dimmed={dimmed}
          />
        )}
      {!definition.plate &&
        definition.appearance === null &&
        definition.mounting !== 'shelf' &&
        definition.bodyMode !== 'parts' &&
        definition.rearImage && (
          <group
            position={mmToScene([
              origin(deviceRack(project, device))[0],
              position[1],
              position[2] + sign * (definition.depthMm / 2 + 0.3),
            ])}
            rotation={device.face === 'front' ? [0, 0, 0] : [0, Math.PI, 0]}
          >
            <FaceImage
              source={definition.rearImage}
              width={mmToScene(definition.widthMm)}
              height={mmToScene(definition.heightMm)}
            />
          </group>
        )}
      {selected && (
        <group position={mmToScene(centerOf(selectedBox))}>
          <Line
            points={[
              [
                -mmToScene(definition.faceWidthMm / 2 + 2),
                -mmToScene(definition.heightMm / 2 + 1),
                0,
              ],
              [
                mmToScene(definition.faceWidthMm / 2 + 2),
                -mmToScene(definition.heightMm / 2 + 1),
                0,
              ],
              [
                mmToScene(definition.faceWidthMm / 2 + 2),
                mmToScene(definition.heightMm / 2 + 1),
                0,
              ],
              [
                -mmToScene(definition.faceWidthMm / 2 + 2),
                mmToScene(definition.heightMm / 2 + 1),
                0,
              ],
              [
                -mmToScene(definition.faceWidthMm / 2 + 2),
                -mmToScene(definition.heightMm / 2 + 1),
                0,
              ],
            ]}
            color="#28bbae"
            lineWidth={2}
          />
        </group>
      )}
      {!definition.plate &&
        definition.ports.map((port) => {
          const point = portWorld(project, {
            kind: 'device',
            deviceId: device.id,
            portId: port.id,
          });
          if (!point || !finitePoint(point)) return null;
          const direction = new THREE.Vector3(
            port.direction[0] * sign,
            port.direction[1],
            port.direction[2] * sign,
          ).normalize();
          const quaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            direction.lengthSq() ? direction : new THREE.Vector3(0, 0, -1),
          );
          return (
            <group
              key={port.id}
              userData={{
                wiringPort: { kind: 'device', deviceId: device.id, portId: port.id },
                wiringSurface: true,
              }}
              position={mmToScene(
                point.map((value, axis) => value + direction.getComponent(axis) * 0.06) as Vec3,
              )}
              quaternion={quaternion}
            >
              {useStore.getState().wiringTool === 'connect' && (
                <SceneLabel style={{ pointerEvents: 'none' }} center>
                  <span className="wiring-port-pin" data-port={`${device.id}:${port.id}`} />
                </SceneLabel>
              )}
              <group rotation={[0, 0, portFaceAngle(port)]}>
                <mesh
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    set({
                      selection: { kind: 'device', id: device.id },
                      notice: `${device.name} · ${port.name} (${port.connector}). Open Cable Connections to connect this port.`,
                    });
                  }}
                  onPointerOver={(event) => {
                    event.stopPropagation();
                    setHoveredPort(port.id);
                  }}
                  onPointerOut={() => setHoveredPort(null)}
                >
                  <planeGeometry
                    args={[
                      (port.widthMm ?? (port.connector.startsWith('IEC') ? 21 : 11)) / 1000,
                      (port.heightMm ?? (port.connector.startsWith('IEC') ? 14 : 9)) / 1000,
                    ]}
                  />
                  <meshBasicMaterial
                    color={hoveredPort === port.id ? '#23beb0' : '#111b24'}
                    side={THREE.DoubleSide}
                    transparent={dimmed}
                    opacity={dimmed ? 0.3 : 1}
                    visible={definition.appearance === null}
                  />
                  {definition.appearance === null && (
                    <Edges color={hoveredPort === port.id ? '#8ff6de' : '#8e9eaa'} />
                  )}
                  {definition.appearance !== null && (
                    <PortGlyph port={port} hovered={hoveredPort === port.id} dimmed={dimmed} />
                  )}
                </mesh>
                {definition.appearance === null && port.connector === 'RJ45' && (
                  <mesh position={[0, -0.0023, 0.00003]}>
                    <planeGeometry args={[0.0067, 0.0011]} />
                    <meshBasicMaterial color="#bba56e" />
                  </mesh>
                )}
              </group>
              {showLabels && hoveredPort === port.id && (
                <SceneLabel
                  position={[0, 0.021, 0]}
                  center
                  zIndexRange={[8, 0]}
                  style={{ pointerEvents: 'none' }}
                >
                  <div className="scene-port-tooltip">
                    {device.name} · {port.name}
                    <small>
                      {port.connector} ·{' '}
                      {definition.appearance === 'user-rack-pc'
                        ? 'photo-estimated position'
                        : 'position marker'}
                    </small>
                  </div>
                </SceneLabel>
              )}
            </group>
          );
        })}
      {showLabels && selected && (
        <SceneLabel
          position={mmToScene([
            origin(deviceRack(project, device))[0] + definition.faceWidthMm / 2 + 65,
            position[1] + 8,
            frontZ,
          ])}
          center
          zIndexRange={[7, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="scene-device-label">
            <span>{device.name}</span>
            <small>
              U{device.startU} · {definition.heightU}U high
            </small>
          </div>
        </SceneLabel>
      )}
    </group>
  );
}

/** Surface marks identify the specified mounting-hole centres; these are not animated fasteners. */
function EarMountingMarks({
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
  const rear = device.face === 'rear';
  const z =
    mountingPlane(project, device) + (rear ? 1 : -1) * (effectiveEarThicknessMm(definition) + 0.04);
  return (
    <group>
      {[-1, 1].flatMap((side) =>
        definition.screwOffsetsMm.map((offset, index) => (
          <mesh
            key={`${side}-${index}`}
            position={mmToScene([
              origin(deviceRack(project, device))[0] +
                (side * deviceRack(project, device).railCentersMm) / 2,
              origin(deviceRack(project, device))[1] + uBottom(device.startU) + offset,
              z,
            ])}
            rotation={rear ? [0, 0, 0] : [0, Math.PI, 0]}
          >
            <circleGeometry args={[0.0019, 12]} />
            <meshBasicMaterial color="#111a23" transparent={dimmed} opacity={dimmed ? 0.3 : 1} />
          </mesh>
        )),
      )}
    </group>
  );
}

function PlacementPreview({
  project,
  device,
  valid,
}: {
  project: Project;
  device: Device;
  valid: boolean;
}) {
  const color = valid ? '#21bfa8' : '#e3655c';
  return (
    <group>
      {deviceBoxes(project, device)
        .filter((box) => finitePoint(centerOf(box)))
        .map((box) => (
          <mesh key={box.id} position={mmToScene(centerOf(box))} renderOrder={3}>
            <boxGeometry args={mmToScene(sizeOf(box))} />
            <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
            <Edges color={color} />
          </mesh>
        ))}
    </group>
  );
}

function RackLabels({
  project,
  preview,
  rear,
}: {
  project: Project;
  preview: Device | null;
  rear: boolean;
}) {
  const rack = project.rack;
  const definition = project.definitions.find((item) => item.id === preview?.definitionId);
  return (
    <group>
      {Array.from({ length: rack.heightU }, (_, index) => index + 1).map((u) => {
        const highlighted =
          preview && u >= preview.startU && u < preview.startU + (definition?.heightU ?? 1);
        const z = rear ? rearRailAt(rack, u) + rack.frameMm : -rack.frontInsetMm - 8;
        return Number.isFinite(z) ? (
          <SceneLabel
            key={u}
            position={mmToScene([
              (rear ? 1 : -1) * (rack.outerWidthMm / 2 + 20),
              uBottom(u) + U_MM / 2,
              z,
            ])}
            center
            zIndexRange={[3, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className={`rack-u-label ${highlighted ? 'highlighted' : ''}`}>
              {String(u).padStart(2, '0')}
            </span>
          </SceneLabel>
        ) : null;
      })}
    </group>
  );
}

function Management({
  project,
  shown,
}: {
  project: Project;
  shown: (kind: Parameters<typeof objectKey>[0]['kind'], id: string) => boolean;
}) {
  const { selection, set, showLabels, showModelTools } = useStore();
  const obstacles = useMemo(
    () => allObstacles(project).filter((box) => box.id.startsWith('accessory:')),
    [project],
  );
  return (
    <group userData={{ wiringSurface: true }}>
      {project.accessories
        .filter((a) => shown('accessory', a.id))
        .map((accessory) => {
          const selected = selection?.kind === 'accessory' && selection.id === accessory.id;
          const solids = obstacles.filter(
            (box) =>
              box.id.startsWith(`accessory:${accessory.id}:`) ||
              box.id === `accessory:${accessory.id}`,
          );
          if (!solids.length)
            solids.push({
              id: accessory.id,
              min: accessory.position.map((value, i) => value - accessory.size[i] / 2) as Vec3,
              max: accessory.position.map((value, i) => value + accessory.size[i] / 2) as Vec3,
            });
          return (
            <group
              key={accessory.id}
              userData={{ physicalTarget: { kind: 'accessory', id: accessory.id } }}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (!canSelectInViewport()) return;
                set({ selection: { kind: 'accessory', id: accessory.id } });
              }}
            >
              {accessory.perforated && accessory.kind === 'tray' ? (
                <>
                  <PerforatedTray
                    project={project}
                    accessory={accessory}
                    selected={selected && !showModelTools}
                  />
                  {selected && !showModelTools && (
                    <SceneLabel
                      position={mmToScene(
                        pointAtPose(accessoryPose(project, accessory), [
                          0,
                          0,
                          accessory.size[2] / 2 + 8,
                        ]),
                      )}
                      center
                      style={{ pointerEvents: 'none' }}
                    >
                      <span
                        className="tray-stretch-label"
                        style={{ color: '#087d70', fontSize: 10 }}
                      >
                        Stretch length
                      </span>
                    </SceneLabel>
                  )}
                </>
              ) : (
                <group
                  position={mmToScene(accessoryPose(project, accessory).position)}
                  rotation={
                    accessoryPose(project, accessory).rotationDeg.map(
                      (v) => (v * Math.PI) / 180,
                    ) as Vec3
                  }
                >
                  {accessoryBoxes(project, {
                    ...accessory,
                    attachment: undefined,
                    position: [0, 0, 0],
                    rotationDeg: [0, 0, 0],
                  }).map((box) => (
                    <SolidBox
                      key={box.id}
                      box={box}
                      color={
                        accessory.kind === 'tray'
                          ? '#6f7d85'
                          : accessory.kind === 'obstruction'
                            ? '#637386'
                            : '#97a9ae'
                      }
                      selected={selected}
                    />
                  ))}
                </group>
              )}
            </group>
          );
        })}
      {project.destinations
        .filter((d) => d.routeIn3D && d.position && shown('destination', d.id))
        .map((d) => (
          <group
            key={d.id}
            position={mmToScene(d.position!)}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!canSelectInViewport()) return;
              set({ selection: { kind: 'destination', id: d.id } });
            }}
          >
            <mesh>
              <boxGeometry args={[0.07, 0.05, 0.025]} />
              <meshStandardMaterial
                color={selection?.id === d.id ? '#26a597' : '#677e91'}
                transparent
                opacity={0.65}
              />
            </mesh>
            {d.ports.map((port) => (
              <group
                key={port.id}
                position={mmToScene(port.position)}
                userData={{
                  wiringPort: { kind: 'external', destinationId: d.id, portId: port.id },
                }}
              >
                <mesh
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!canSelectInViewport()) return;
                    if (useStore.getState().wiringTool === 'connect')
                      connectWiringPort({ kind: 'external', destinationId: d.id, portId: port.id });
                    else set({ selection: { kind: 'destination', id: d.id } });
                  }}
                >
                  <sphereGeometry args={[0.009, 12, 8]} />
                  <meshBasicMaterial color="#62efd5" />
                </mesh>
                <SceneLabel position={[0, 0.025, 0]} center style={{ pointerEvents: 'none' }}>
                  <span className="scene-exit-label">
                    {d.name} · {port.name}
                  </span>
                </SceneLabel>
              </group>
            ))}
          </group>
        ))}
      {project.exits
        .filter((e) => shown('exit', e.id))
        .map((exit) => {
          const selected = selection?.kind === 'exit' && selection.id === exit.id;
          const direction = new THREE.Vector3(...exit.direction).normalize();
          const rotation = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            direction.lengthSq() ? direction : new THREE.Vector3(0, 0, 1),
          );
          const w = mmToScene(exit.size[0]) / 2,
            h = mmToScene(exit.size[1]) / 2;
          return (
            <group
              key={exit.id}
              position={mmToScene(exit.position)}
              quaternion={rotation}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (!canSelectInViewport()) return;
                set({ selection: { kind: 'exit', id: exit.id } });
              }}
            >
              <Line
                points={[
                  [-w, -h, 0],
                  [w, -h, 0],
                  [w, h, 0],
                  [-w, h, 0],
                  [-w, -h, 0],
                ]}
                color={selected ? '#087e79' : '#35afa4'}
                lineWidth={selected ? 2.5 : 1.5}
                dashed
                dashSize={0.008}
                gapSize={0.005}
              />
              <mesh>
                <planeGeometry args={[w * 2, h * 2]} />
                <meshBasicMaterial
                  color="#46b8aa"
                  transparent
                  opacity={selected ? 0.2 : 0.08}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
              {showLabels && selected && (
                <SceneLabel
                  position={[0, h + 0.025, 0]}
                  center
                  zIndexRange={[6, 0]}
                  style={{ pointerEvents: 'none' }}
                >
                  <span className="scene-exit-label">{exit.name}</span>
                </SceneLabel>
              )}
            </group>
          );
        })}
    </group>
  );
}

/** Parameterised by vertex index so TubeGeometry places a ring at every validated point.
 * This deliberately introduces no second spline or path smoothing. */
class ValidatedPolyline extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly points: THREE.Vector3[]) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const index = Math.max(0, Math.min(this.points.length - 1, t * (this.points.length - 1)));
    const low = Math.min(Math.floor(index), this.points.length - 2);
    return target.copy(this.points[low]).lerp(this.points[low + 1], index - low);
  }
  getPointAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.getPoint(u, target);
  }
  getTangent(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const index = Math.round(Math.max(0, Math.min(1, t)) * (this.points.length - 1));
    const before = this.points[Math.max(0, index - 1)],
      after = this.points[Math.min(this.points.length - 1, index + 1)];
    return target.copy(after).sub(before).normalize();
  }
  getTangentAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.getTangent(u, target);
  }
}

function CableTube({
  route,
  cable,
  selected,
}: {
  route: CableRoute;
  cable: Cable;
  selected: boolean;
}) {
  const geometry = useMemo(() => {
    const points = route.points
      .filter(finitePoint)
      .map((point) => new THREE.Vector3(...mmToScene(point)));
    if (points.length < 2) return null;
    return new THREE.TubeGeometry(
      new ValidatedPolyline(points),
      points.length - 1,
      mmToScene(cable.diameterMm) / 2,
      10,
      false,
    );
  }, [route, cable.diameterMm]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial
        color={route.valid ? cable.color : '#e67666'}
        metalness={0.08}
        roughness={0.48}
        emissive={selected ? (route.valid ? cable.color : '#c95c4f') : '#000000'}
        emissiveIntensity={selected ? 0.5 : 0}
      />
    </mesh>
  );
}

function WiringGuides({
  project,
  shown,
}: {
  project: Project;
  shown: (kind: Parameters<typeof objectKey>[0]['kind'], id: string) => boolean;
}) {
  const { wiringLineStart, wiringGuideId, selection, showModelTools, set } = useStore();
  const cable =
    selection?.kind === 'cable' ? project.cables.find((c) => c.id === selection.id) : undefined;
  return (
    <group>
      {(project.wiringGuides ?? [])
        .filter((g) => shown('guide', g.id))
        .map((g) => {
          const reverse = cable?.guideLinks?.find((l) => l.guideId === g.id)?.reverse ?? false;
          const points = resolvedGuidePoints(project, g).points;
          const color = g.id === wiringGuideId ? '#f3ad35' : '#117dba';
          const a = new THREE.Vector3(...mmToScene(points[0]));
          const b = new THREE.Vector3(...mmToScene(points.at(-1)!));
          const direction = b.clone().sub(a);
          return (
            <group
              key={g.id}
              userData={{ wiringGuideId: g.id }}
              onPointerDown={(e) => {
                if (showModelTools && canSelectInViewport()) {
                  e.stopPropagation();
                  set({ selection: { kind: 'guide', id: g.id }, wiringGuideId: g.id });
                }
              }}
            >
              {g.kind === 'line' && (
                <mesh
                  position={a.clone().add(b).multiplyScalar(0.5)}
                  quaternion={new THREE.Quaternion().setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    direction.clone().normalize(),
                  )}
                >
                  <cylinderGeometry args={[0.003, 0.003, direction.length(), 8]} />
                  <meshBasicMaterial color={color} transparent opacity={0.7} />
                </mesh>
              )}
              {points.map((point, index) => (
                <group key={index} position={mmToScene(point)}>
                  <mesh>
                    <sphereGeometry args={[0.006, 12, 8]} />
                    <meshBasicMaterial color={color} />
                  </mesh>
                  <SceneLabel
                    position={[0, 0.014, 0]}
                    center
                    zIndexRange={[9, 0]}
                    style={{ pointerEvents: 'none' }}
                  >
                    <button
                      className="wiring-guide-label"
                      style={{ pointerEvents: 'auto' }}
                      aria-label={`Select guide ${g.name}${g.kind === 'line' ? (index ? ' B' : ' A') : ''}`}
                      onClick={() => {
                        if (showModelTools)
                          set({ selection: { kind: 'guide', id: g.id }, wiringGuideId: g.id });
                        else clickWiringGuide(g.id);
                      }}
                    >
                      {g.name}
                      {g.kind === 'line' ? (index ? ' · B' : ' · A') : ''}
                      {g.kind === 'line' && index === (reverse ? 1 : 0) ? ' →' : ''}
                    </button>
                  </SceneLabel>
                </group>
              ))}
            </group>
          );
        })}
      {wiringLineStart && (
        <mesh position={mmToScene(wiringLineStart)}>
          <sphereGeometry args={[0.007, 12, 8]} />
          <meshBasicMaterial color="#f3ad35" />
        </mesh>
      )}
    </group>
  );
}

function UserMeasurements({ project }: { project: Project }) {
  const { measureStart, showModelTools } = useStore();
  return (
    <group>
      {project.measurements?.map((m) => (
        <group key={m.id}>
          <Line points={[mmToScene(m.start), mmToScene(m.end)]} color="#b97821" lineWidth={2} />
          <SceneLabel
            position={mmToScene(m.start.map((v, i) => (v + m.end[i]) / 2) as Vec3)}
            center
            style={{ pointerEvents: 'none' }}
          >
            <span className="scene-dimension">
              {Math.hypot(...m.end.map((v, i) => v - m.start[i])).toFixed(1)} mm
            </span>
          </SceneLabel>
        </group>
      ))}
      {showModelTools && measureStart && (
        <mesh position={mmToScene(measureStart)}>
          <sphereGeometry args={[0.006, 12, 8]} />
          <meshBasicMaterial color="#b97821" />
        </mesh>
      )}
    </group>
  );
}

function RenderedCable({ project, cable }: { project: Project; cable: Cable }) {
  const { selection, set, showLabels } = useStore();
  const selected = selection?.kind === 'cable' && selection.id === cable.id;
  const route = useMemo(() => routeCable(project, cable), [project, cable]);
  const anchor =
    route.points[Math.floor(route.points.length / 2)] ?? portWorld(project, cable.source);
  return (
    <group
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!canSelectInViewport()) return;
        set({ selection: { kind: 'cable', id: cable.id } });
      }}
    >
      <CableTube route={route} cable={cable} selected={selected} />
      {anchor && showLabels && (selected || !route.valid) && (
        <SceneLabel position={mmToScene(anchor)} center zIndexRange={[5, 0]}>
          <button
            className={`scene-cable-label ${route.valid ? '' : 'needs-review'} ${selected ? 'selected' : ''}`}
            title={
              route.issues.join('\n') ||
              `${cableLabel(cable)}: ${(route.lengthMm / 1000).toFixed(2)} m calculated route`
            }
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (!canSelectInViewport()) return;
              set({ selection: { kind: 'cable', id: cable.id } });
            }}
          >
            {!route.valid && <Icon name="alert" size={12} />}
            {cableLabel(cable)}
            <small>
              {route.valid
                ? `${(route.lengthMm / 1000).toFixed(2)} m`
                : route.points.length < 2
                  ? 'Route unavailable'
                  : 'Needs review'}
            </small>
          </button>
        </SceneLabel>
      )}
      {anchor && route.points.length < 2 && (
        <mesh position={mmToScene(anchor)}>
          <sphereGeometry args={[0.008, 12, 8]} />
          <meshBasicMaterial color="#dc7a68" wireframe />
        </mesh>
      )}
    </group>
  );
}

function Measurements({ project }: { project: Project }) {
  const rack = project.rack,
    height = mmToScene(rack.heightU * U_MM),
    width = mmToScene(rack.outerWidthMm);
  const front = -mmToScene(rack.frontInsetMm) - 0.045,
    x = -width / 2 - 0.085,
    y = -mmToScene(rack.frameMm) - 0.045;
  return (
    <group>
      <Line
        points={[
          [x, 0, front],
          [x, height, front],
        ]}
        color="#628a8b"
        lineWidth={1}
      />
      {[0, height].map((level) => (
        <Line
          key={level}
          points={[
            [x - 0.012, level, front],
            [x + 0.012, level, front],
          ]}
          color="#628a8b"
          lineWidth={1}
        />
      ))}
      <SceneLabel
        position={[x - 0.035, height / 2, front]}
        center
        zIndexRange={[3, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span className="scene-dimension vertical">
          {rack.heightU}U · {(rack.heightU * U_MM).toFixed(1)} mm
        </span>
      </SceneLabel>
      <Line
        points={[
          [-width / 2, y, front],
          [width / 2, y, front],
        ]}
        color="#628a8b"
        lineWidth={1}
      />
      {[-width / 2, width / 2].map((side) => (
        <Line
          key={side}
          points={[
            [side, y - 0.012, front],
            [side, y + 0.012, front],
          ]}
          color="#628a8b"
          lineWidth={1}
        />
      ))}
      <SceneLabel
        position={[0, y - 0.025, front]}
        center
        zIndexRange={[3, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span className="scene-dimension">{rack.outerWidthMm} mm</span>
      </SceneLabel>
      {rack.sections.map((section) => (
        <SceneLabel
          key={section.id}
          position={mmToScene([
            rack.outerWidthMm / 2 + 75,
            uBottom(section.startU) + ((section.endU - section.startU + 1) * U_MM) / 2,
            section.rearRailZMm,
          ])}
          center
          zIndexRange={[3, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span className="scene-dimension">
            U{section.startU}–{section.endU} · {section.overallDepthMm} mm
            <br />
            <small>Example external depth</small>
          </span>
        </SceneLabel>
      ))}
    </group>
  );
}
