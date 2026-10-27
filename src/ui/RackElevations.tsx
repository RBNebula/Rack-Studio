import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, KeyboardEvent, PointerEvent } from 'react';
import type { Device, Project, Rack } from '../model';
import { useStore } from '../state';
import { U_MM } from '../engineering/geometry';
import { placementIssues, supportRoot } from '../engineering/placement';
import { deviceRack, origin, racks } from '../engineering/space';
import { DeviceMini } from './Library';
import { commitPlacement } from './placementActions';

/**
 * 2D rack elevations: each rack's front and rear side by side, racks ordered left to right as seen
 * from the front (the 3D front camera looks along +Z, so larger X is further left). Equipment is
 * dropped from the library or dragged between U positions, faces and racks. The drop runs the same
 * placement checks as the 3D viewport, and the project only changes when the drop is committed.
 */

type Face = 'front' | 'rear';
interface Target {
  rackId: string;
  face: Face;
  u: number;
}
/** What is being dragged: a library definition or an installed device. */
type Payload = { definitionId: string } | { deviceId: string; grabU: number; selectId?: string };

// Pixel chrome per face (U-number gutter + borders) and gaps; keep in step with styles.css.
const FRAME_CHROME = 32;
const FACE_GAP = 20;
const RACK_GAP = 40;

export const elevationOrder = (p: Project): Rack[] =>
  [...racks(p)].sort((a, b) => origin(b)[0] - origin(a)[0]);

/** Candidate device for a drop target, with UI-level blocks the engineering checks do not cover. */
export function elevationCandidate(
  p: Project,
  payload: Payload,
  target: Target,
): { candidate: Device; blocks: string[] } | null {
  const existing =
    'deviceId' in payload ? p.devices.find((d) => d.id === payload.deviceId) : undefined;
  const definition = p.definitions.find(
    (d) => d.id === (existing?.definitionId ?? ('definitionId' in payload && payload.definitionId)),
  );
  if (!definition) return null;
  const rack = racks(p).find((r) => r.id === target.rackId) ?? p.rack;
  let u = target.u - ('grabU' in payload ? payload.grabU : 0);
  let supportId: string | null = null;
  if (definition.mounting === 'freestanding') {
    const shelf = p.devices.find((d) => {
      const support = p.definitions.find((x) => x.id === d.definitionId);
      return (
        d.id !== existing?.id &&
        support?.mounting === 'shelf' &&
        deviceRack(p, d).id === rack.id &&
        d.face === target.face &&
        target.u >= d.startU &&
        target.u < d.startU + support.heightU
      );
    });
    if (shelf) {
      u = shelf.startU;
      supportId = shelf.id;
    }
  }
  const blocks: string[] = [];
  return {
    candidate: {
      ...(existing ?? {
        id: 'placement-preview',
        definitionId: definition.id,
        name: `${definition.name} ${p.devices.filter((d) => d.definitionId === definition.id).length + 1}`,
        installation: 'installed' as const,
      }),
      rackId: rack.id === p.rack.id ? undefined : rack.id,
      startU: u,
      face: target.face,
      supportId,
    },
    blocks,
  };
}

const where = (rack: Rack, face: Face, single: boolean) =>
  ` (${face}${single ? '' : `, ${rack.name}`})`;

export default function RackElevations() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const dragDefinitionId = useStore((s) => s.dragDefinitionId);
  const set = useStore((s) => s.set);
  const ordered = elevationOrder(project);
  const single = ordered.length === 1;
  // Installed devices move with pointer events (HTML5 drag cancels on re-render and skips touch).
  const moving = useRef<{ deviceId: string; grabU: number; selectId: string } | null>(null);
  const press = useRef<{
    deviceId: string;
    /** The device that was grabbed; `deviceId` is its shelf when it stands on one. */
    selectId: string;
    grabU: number;
    x: number;
    y: number;
    id: number;
  } | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  // Frames are sized from the available height (rack proportions); CSS alone cannot do this here.
  const area = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(480);
  // Width of each frame per mm of height, and the fixed pixels around frames (see styles.css).
  const ratios = ordered.flatMap((r) => [0, 1].map(() => r.outerWidthMm / (r.heightU * U_MM)));
  const fixed =
    ordered.length * (2 * (FRAME_CHROME + FACE_GAP) - FACE_GAP) + (ordered.length - 1) * RACK_GAP;
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const fit = () => {
      // Leave room for the rack title and face captions above each frame.
      const byHeight = el.clientHeight - 64;
      const byWidth = (el.clientWidth - fixed) / ratioSum;
      setFrameHeight(Math.max(240, Math.floor(Math.min(byHeight, byWidth))));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, [fixed, ratioSum]);

  const payload = (): Payload | null =>
    moving.current ?? (dragDefinitionId ? { definitionId: dragDefinitionId } : null);
  // Recomputed per render; a render only follows a change of drop target or project.
  const preview = (() => {
    const p = target && payload();
    if (!target || !p) return null;
    const result = elevationCandidate(project, p, target);
    if (!result) return null;
    const definition = project.definitions.find((d) => d.id === result.candidate.definitionId)!;
    return {
      ...result,
      definition,
      issues: [...result.blocks, ...placementIssues(project, result.candidate)],
    };
  })();

  function uAt(box: DOMRect, clientY: number, rack: Rack) {
    const row = Math.floor(((clientY - box.top) / box.height) * rack.heightU);
    return Math.min(rack.heightU, Math.max(1, rack.heightU - row));
  }
  /** The face under a viewport point, for pointer moves (which are captured by the device). */
  function targetAt(x: number, y: number): Target | null {
    const slots = document
      .elementsFromPoint(x, y)
      .find((el) => el.classList.contains('elevation-slots')) as HTMLElement | undefined;
    const rack = slots && racks(project).find((r) => r.id === slots.dataset.rackId);
    if (!slots || !rack) return null;
    return {
      rackId: rack.id,
      face: slots.dataset.face as Face,
      u: uAt(slots.getBoundingClientRect(), y, rack),
    };
  }
  const retarget = (next: Target | null) => {
    if (next?.rackId !== target?.rackId || next?.face !== target?.face || next?.u !== target?.u)
      setTarget(next);
  };
  function over(event: DragEvent<HTMLElement>, rack: Rack, face: Face) {
    if (!payload()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    retarget({
      rackId: rack.id,
      face,
      u: uAt(event.currentTarget.getBoundingClientRect(), event.clientY, rack),
    });
  }
  function drop(event: DragEvent<HTMLElement>, rack: Rack, face: Face) {
    if (!payload()) return;
    event.preventDefault();
    event.stopPropagation();
    place({
      rackId: rack.id,
      face,
      u: uAt(event.currentTarget.getBoundingClientRect(), event.clientY, rack),
    });
  }
  function place(at: Target | null) {
    const p = payload();
    end();
    if (!p) return;
    const rack = at && racks(project).find((r) => r.id === at.rackId);
    if (!at || !rack) {
      commitPlacement(null);
      return;
    }
    const face = at.face;
    const result = elevationCandidate(project, p, at);
    if (!result) return;
    const old = 'deviceId' in p ? project.devices.find((d) => d.id === p.deviceId) : undefined;
    if (
      old &&
      old.startU === result.candidate.startU &&
      old.face === face &&
      deviceRack(project, old).id === rack.id
    )
      return;
    commitPlacement(
      result.candidate,
      result.blocks,
      where(rack, face, single),
      'selectId' in p ? p.selectId : undefined,
    );
  }
  function end() {
    moving.current = null;
    press.current = null;
    setTarget(null);
    set({ dragDefinitionId: null, dragDeviceId: null, previewU: null });
  }
  function drag(e: PointerEvent<HTMLElement>) {
    const start = press.current;
    if (!start || start.id !== e.pointerId) return;
    if (!moving.current) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
      moving.current = { deviceId: start.deviceId, grabU: start.grabU, selectId: start.selectId };
      set({ selection: { kind: 'device', id: start.selectId } });
    }
    retarget(targetAt(e.clientX, e.clientY));
  }
  function nudge(event: KeyboardEvent<HTMLElement>, device: Device) {
    const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    // Equipment on a shelf moves with its shelf.
    const root = supportRoot(project, device);
    const rack = deviceRack(project, root);
    const result = elevationCandidate(
      project,
      { deviceId: root.id, grabU: 0 },
      { rackId: rack.id, face: root.face, u: root.startU + step },
    );
    if (result)
      commitPlacement(result.candidate, result.blocks, where(rack, root.face, single), device.id);
  }

  const status = preview
    ? `${preview.candidate.name} → U${preview.candidate.startU}${preview.definition.heightU > 1 ? `–${preview.candidate.startU + preview.definition.heightU - 1}` : ''}${where(
        racks(project).find((r) => r.id === target!.rackId)!,
        target!.face,
        single,
      )}: ${preview.issues.length ? preview.issues[0] : 'no conflict detected'}`
    : 'Drag equipment from the library, or drag installed equipment to another U, face or rack. Arrow keys move the focused device by 1U.';

  return (
    <section className="elevations" aria-label="2D rack elevations">
      <p
        className={`elevations-status ${preview ? (preview.issues.length ? 'blocked' : 'valid') : ''}`}
        role="status"
      >
        {status}
      </p>
      <div className="elevations-racks" ref={area}>
        {ordered.map((rack) => (
          <div className="elevation-rack" key={rack.id}>
            <h3 title={rack.name}>{rack.name}</h3>
            <div className="elevation-faces">
              {(['front', 'rear'] as const).map((face) => {
                const pct = (u: number) => `${(u / rack.heightU) * 100}%`;
                const box = (startU: number, heightU: number) => ({
                  top: pct(rack.heightU - (startU + heightU - 1)),
                  height: pct(heightU),
                });
                const inRack = project.devices.filter((d) => deviceRack(project, d).id === rack.id);
                const show =
                  preview && target?.rackId === rack.id && target.face === face ? preview : null;
                return (
                  <figure className="elevation-face" key={face}>
                    <figcaption>{face === 'front' ? 'Front' : 'Rear'}</figcaption>
                    <div
                      className="elevation-frame"
                      style={{
                        height: frameHeight,
                        width: (frameHeight * rack.outerWidthMm) / (rack.heightU * U_MM),
                      }}
                    >
                      <ol className="elevation-units" aria-hidden="true">
                        {Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i).map(
                          (u) => (
                            <li key={u}>{u}</li>
                          ),
                        )}
                      </ol>
                      <div
                        className="elevation-slots"
                        role="group"
                        aria-label={`${rack.name} ${face}`}
                        data-rack-id={rack.id}
                        data-face={face}
                        style={
                          {
                            '--opening': `${(rack.clearWidthMm / rack.outerWidthMm) * 100}%`,
                            '--rows': rack.heightU,
                          } as CSSProperties
                        }
                        onDragOver={(e) => over(e, rack, face)}
                        onDrop={(e) => drop(e, rack, face)}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                            setTarget(null);
                        }}
                      >
                        {inRack.map((device) => {
                          const definition = project.definitions.find(
                            (d) => d.id === device.definitionId,
                          );
                          if (!definition) return null;
                          const width =
                            definition.mounting === 'freestanding'
                              ? definition.widthMm
                              : definition.faceWidthMm;
                          const style = {
                            ...box(device.startU, definition.heightU),
                            width: `${Math.min(100, (width / rack.outerWidthMm) * 100)}%`,
                          };
                          const range = `U${device.startU}${definition.heightU > 1 ? `–${device.startU + definition.heightU - 1}` : ''}`;
                          if (device.face !== face)
                            return (
                              <div
                                key={device.id}
                                className="elevation-ghost"
                                style={style}
                                aria-hidden="true"
                              >
                                <span>{device.name}</span>
                              </div>
                            );
                          const selected =
                            selection?.kind === 'device' && selection.id === device.id;
                          return (
                            // A div, not <button>: Firefox does not start drags on buttons.
                            <div
                              key={device.id}
                              role="button"
                              tabIndex={0}
                              className={`elevation-device ${definition.mounting} ${selected ? 'selected' : ''} ${moving.current?.deviceId === device.id ? 'moving' : ''}`}
                              style={style}
                              aria-label={`${device.name}, ${range}`}
                              aria-pressed={selected}
                              data-tooltip={`${device.name} · ${range}`}
                              onClick={() => set({ selection: { kind: 'device', id: device.id } })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  set({ selection: { kind: 'device', id: device.id } });
                                } else nudge(e, device);
                              }}
                              onPointerDown={(e) => {
                                if (e.button !== 0) return;
                                const box = e.currentTarget.getBoundingClientRect();
                                const fromTop = Math.floor(
                                  ((e.clientY - box.top) / box.height) * definition.heightU,
                                );
                                // Equipment on a shelf drags its shelf, so the pair moves together.
                                const root = supportRoot(project, device);
                                press.current = {
                                  deviceId: root.id,
                                  selectId: device.id,
                                  grabU: Math.max(
                                    0,
                                    device.startU + definition.heightU - 1 - fromTop - root.startU,
                                  ),
                                  x: e.clientX,
                                  y: e.clientY,
                                  id: e.pointerId,
                                };
                                e.currentTarget.setPointerCapture(e.pointerId);
                              }}
                              onPointerMove={(e) => drag(e)}
                              onPointerUp={(e) => {
                                if (moving.current && press.current?.id === e.pointerId)
                                  place(targetAt(e.clientX, e.clientY));
                                else press.current = null;
                              }}
                              onPointerCancel={(e) => {
                                // Chrome also cancels the last hovered device's pointer when a
                                // library drag starts; only end this device's own press.
                                if (press.current?.id !== e.pointerId) return;
                                press.current = null;
                                moving.current = null;
                                setTarget(null);
                              }}
                            >
                              <DeviceMini definition={definition} />
                              <span className="elevation-label">{device.name}</span>
                            </div>
                          );
                        })}
                        {show && (
                          <div
                            className={`elevation-preview ${show.issues.length ? 'blocked' : 'valid'}`}
                            style={{
                              ...box(show.candidate.startU, show.definition.heightU),
                              width: `${Math.min(100, (show.definition.faceWidthMm / rack.outerWidthMm) * 100)}%`,
                            }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
