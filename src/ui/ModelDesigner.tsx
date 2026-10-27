import { useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { clone, uid, type DeviceDefinition } from '../model';
import { createUserRackPc } from '../models/user-rack-pc';
import { useStore } from '../state';
import { componentPalette, designerIssues } from '../engineering/model-designer';
import { Badge, Button, NumberField, Field, Modal } from './shared';
import { Note } from './Panels';
import { PortGlyph } from './PortGlyph';
import { FaceFeatures } from './FaceFeatures';
import { ConnectorRotation } from './ConnectorRotation';
import { portFaceAngle, portSize, portRotationDeg } from '../engineering/ports';

type Face = 'front' | 'rear';
function Preview({
  d,
  face,
  onDrop,
}: {
  d: DeviceDefinition;
  face: Face;
  onDrop: (kind: string, x: number, y: number) => void;
}) {
  const { camera, gl } = useThree();
  useEffect(() => {
    camera.position.set(120, d.heightMm + 100, face === 'front' ? -650 : d.depthMm + 650);
    camera.lookAt(0, d.heightMm / 2, d.depthMm / 2);
  }, [camera, d.heightMm, d.depthMm, face]);
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const rect = gl.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      const point = ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 0, 1), face === 'front' ? 2 : -d.depthMm),
        new THREE.Vector3(),
      );
      if (point)
        onDrop(e.dataTransfer?.getData('application/model-component') ?? '', point.x, point.y);
    };
    gl.domElement.addEventListener('dragover', over);
    gl.domElement.addEventListener('drop', drop);
    return () => {
      gl.domElement.removeEventListener('dragover', over);
      gl.domElement.removeEventListener('drop', drop);
    };
  }, [camera, gl, face, d.depthMm, onDrop]);
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[100, 300, -400]} intensity={3} />
      <mesh position={[0, d.heightMm / 2, d.depthMm / 2]}>
        <boxGeometry args={[d.widthMm, d.heightMm, d.depthMm]} />
        <meshStandardMaterial color={d.color} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[(s * (d.widthMm + (d.faceWidthMm - d.widthMm) / 2)) / 2, d.heightMm / 2, -1]}
        >
          <boxGeometry args={[(d.faceWidthMm - d.widthMm) / 2, d.heightMm, 2]} />
          <meshStandardMaterial color="#252d35" />
        </mesh>
      ))}
      {d.ports.map((p) => (
        <group
          key={p.id}
          position={p.position}
          rotation={p.surface === 'front' ? [0, Math.PI, 0] : [0, 0, 0]}
        >
          <group scale={1000} rotation={[0, 0, portFaceAngle(p)]}>
            <PortGlyph port={p} hovered={false} dimmed={false} />
          </group>
        </group>
      ))}
      <FaceFeatures definition={d} />
      <OrbitControls makeDefault target={[0, d.heightMm / 2, d.depthMm / 2]} />
    </>
  );
}
export default function ModelDesigner() {
  const { project, edit, set } = useStore();
  const fresh = (): DeviceDefinition => ({
    ...createUserRackPc(),
    id: uid('def'),
    name: 'Custom rack device',
    appearance: null,
    ports: [],
    parts: [],
    faceFeatures: [],
    source: 'Model designer: user-entered dimensions; components are schematic examples.',
    evidence: 'user-entered',
  });
  const [d, setD] = useState(fresh);
  const [face, setFace] = useState<Face>('front');
  const [selected, setSelected] = useState('');
  const [dragging, setDragging] = useState('');
  const [newName, setNewName] = useState<string | null>(null);
  const patch = (v: Partial<DeviceDefinition>) => setD({ ...d, ...v });
  function place(kind: string, x: number, y: number) {
    const spec = componentPalette.find((p) => p[0] === kind);
    if (!spec) return;
    const [, w, h] = spec;
    const id = uid('component');
    x = Math.max(-d.widthMm / 2 + w / 2, Math.min(d.widthMm / 2 - w / 2, Math.round(x)));
    y = Math.max(h / 2, Math.min(d.heightMm - h / 2, Math.round(y)));
    if (w > d.widthMm || h > d.heightMm) {
      set({ error: 'This component does not fit the chassis face.' });
      return;
    }
    if (kind === 'fan' || kind === 'grille')
      patch({
        faceFeatures: [
          ...(d.faceFeatures ?? []),
          { id, kind, surface: face, x, y, widthMm: w, heightMm: h },
        ],
      });
    else
      patch({
        ports: [
          ...d.ports,
          {
            id,
            name: kind,
            connector: kind,
            surface: face,
            position: [x, y, face === 'front' ? -2 : d.depthMm + 0.1],
            direction: [0, 0, face === 'front' ? -1 : 1],
            widthMm: w,
            heightMm: h,
            multiple: false,
            evidence: 'example',
            source: 'Schematic designer component; position user entered.',
          },
        ],
      });
    setSelected(id);
  }
  const items = [
    ...d.ports
      .filter((p) => p.surface === face)
      .map((p) => ({
        id: p.id,
        name: p.name,
        x: p.position[0],
        y: p.position[1],
        w: portSize(p)[0],
        h: portSize(p)[1],
        rotationDeg: portRotationDeg(p),
      })),
    ...(d.faceFeatures ?? [])
      .filter((f) => f.surface === face)
      .map((f) => ({
        id: f.id,
        name: f.kind,
        x: f.x,
        y: f.y,
        w: f.widthMm,
        h: f.heightMm,
        rotationDeg: 0,
      })),
  ];
  const move = (id: string, x: number, y: number) =>
    patch({
      ports: d.ports.map((p) => (p.id === id ? { ...p, position: [x, y, p.position[2]] } : p)),
      faceFeatures: d.faceFeatures?.map((f) => (f.id === id ? { ...f, x, y } : f)),
    });
  const issues = designerIssues(d);
  const nameExists = (name: string) =>
    project.definitions.some((v) => v.name.trim().toLowerCase() === name.trim().toLowerCase());
  const validate = () => {
    if (issues.length) {
      set({ error: issues.join(' ') });
      return false;
    }
    return true;
  };
  return (
    <section className="report-workspace model-designer">
      <div className="report-heading">
        <div>
          <span className="eyebrow">EQUIPMENT MODELLING</span>
          <h1>Device model designer</h1>
          <p>
            Drag components onto the 3D unit or the selected face below. Drag placed components in
            the face editor to reposition them. Fans and grilles are visual features; ports become
            cable endpoints.
          </p>
        </div>
        <div className="button-row designer-source">
          <Button
            icon="plus"
            onClick={() => {
              setD(fresh());
              setSelected('');
            }}
          >
            New model
          </Button>
          <Field label="Edit library model">
            <select
              value={project.definitions.some((v) => v.id === d.id) ? d.id : ''}
              onChange={(e) => {
                const item = project.definitions.find((v) => v.id === e.target.value);
                if (item) {
                  setD(clone(item));
                  setSelected('');
                }
              }}
            >
              <option value="">Choose model…</option>
              {project.definitions
                .filter((v) => !v.plate && v.bodyMode === 'box' && v.mounting === 'direct')
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </div>
      <div className="model-designer-grid">
        <div className="model-designer-column">
          <section className="surface">
            <div className="section-title">
              <h2>Model properties</h2>
              <Badge tone="warn">{d.evidence}</Badge>
            </div>
            <div className="form-grid">
              <Field label="Model name">
                <input value={d.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <NumberField
                label="Model height (U)"
                value={d.heightU}
                min={1}
                max={60}
                onChange={(v) => patch({ heightU: v, heightMm: v * 44.45 - 1.5 })}
              />
              <NumberField
                label="Model chassis width (mm)"
                value={d.widthMm}
                min={30}
                max={457.1}
                onChange={(v) => patch({ widthMm: v })}
              />
              <NumberField
                label="Model depth (mm)"
                value={d.depthMm}
                min={1}
                max={3000}
                onChange={(v) =>
                  patch({
                    depthMm: v,
                    ports: d.ports.map((p) =>
                      p.surface === 'rear'
                        ? { ...p, position: [p.position[0], p.position[1], v + 0.1] }
                        : p,
                    ),
                  })
                }
              />
            </div>
            <Note summary="Chassis width must stay below 457.2 mm (18 in); the rack's clear opening controls fit.">
              Chassis width must stay below 18 inches (457.2 mm). Ear width is 482.6 mm. The rack’s
              actual clear opening still controls installation fit. Physical height and component
              dimensions can be calibrated in the library editor.
            </Note>
          </section>
          <section className="surface">
            <div className="section-title">
              <h2>Face editor</h2>
              <div className="segmented" role="group" aria-label="Face being edited">
                {(['front', 'rear'] as const).map((f) => (
                  <button
                    key={f}
                    aria-pressed={face === f}
                    onClick={() => {
                      setFace(f);
                      setSelected('');
                    }}
                  >
                    {f === 'front' ? 'Design front' : 'Design rear'}
                  </button>
                ))}
              </div>
            </div>
            <p className="field-hint">
              Editing the <strong>{face}</strong> face. Drag a component onto the face or the 3D
              preview, or click it to add at the face centre.
            </p>
            <div className="component-palette" aria-label="Component palette">
              {componentPalette.map(([kind]) => (
                <button
                  className="button"
                  key={kind}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/model-component', kind)}
                  onClick={() => place(kind, 0, d.heightMm / 2)}
                >
                  {kind}
                </button>
              ))}
            </div>
            <svg
              aria-label="Device face editor"
              viewBox={`${-d.widthMm / 2} 0 ${d.widthMm} ${d.heightMm}`}
              style={{
                width: '100%',
                height: Math.max(120, d.heightMm * 2),
                background: '#202b34',
                touchAction: 'none',
                borderRadius: 4,
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
                  e.currentTarget.getScreenCTM()!.inverse(),
                );
                void r;
                place(
                  e.dataTransfer.getData('application/model-component'),
                  face === 'front' ? -pt.x : pt.x,
                  d.heightMm - pt.y,
                );
              }}
              onPointerMove={(e) => {
                if (!dragging) return;
                const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
                  e.currentTarget.getScreenCTM()!.inverse(),
                );
                move(
                  dragging,
                  Math.round(face === 'front' ? -pt.x : pt.x),
                  Math.round(d.heightMm - pt.y),
                );
              }}
              onPointerUp={() => setDragging('')}
              onPointerCancel={() => setDragging('')}
            >
              {items.map((p) => (
                <g
                  key={p.id}
                  data-component-id={p.id}
                  transform={`rotate(${p.rotationDeg} ${face === 'front' ? -p.x : p.x} ${d.heightMm - p.y})`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                    setSelected(p.id);
                    setDragging(p.id);
                  }}
                  style={{ cursor: 'move' }}
                >
                  <rect
                    x={(face === 'front' ? -p.x : p.x) - p.w / 2}
                    y={d.heightMm - p.y - p.h / 2}
                    width={p.w}
                    height={p.h}
                    fill={selected === p.id ? '#278f86' : '#7596af'}
                    stroke="#c3dee5"
                    strokeWidth={0.5}
                  />
                  <title>{p.name}</title>
                </g>
              ))}
            </svg>
            {selected && (
              <div className="button-row selected-component">
                {d.ports.find((p) => p.id === selected) && (
                  <ConnectorRotation
                    port={d.ports.find((p) => p.id === selected)!}
                    onChange={(rotationDeg) =>
                      patch({
                        ports: d.ports.map((p) => (p.id === selected ? { ...p, rotationDeg } : p)),
                      })
                    }
                  />
                )}
                <Field label="Selected component name">
                  <input
                    disabled={!d.ports.some((p) => p.id === selected)}
                    value={items.find((p) => p.id === selected)?.name ?? ''}
                    onChange={(e) =>
                      patch({
                        ports: d.ports.map((p) =>
                          p.id === selected ? { ...p, name: e.target.value } : p,
                        ),
                      })
                    }
                  />
                </Field>
                <Button
                  onClick={() => {
                    patch({
                      ports: d.ports.filter((p) => p.id !== selected),
                      faceFeatures: d.faceFeatures?.filter((p) => p.id !== selected),
                    });
                    setSelected('');
                  }}
                >
                  Remove component
                </Button>
              </div>
            )}
          </section>
        </div>
        <section className="surface model-preview-card">
          <div className="section-title">
            <h2>3D preview</h2>
            <span>Drop components here too</span>
          </div>
          <div className="model-preview">
            <Canvas
              orthographic
              camera={{ position: [100, 130, -650], zoom: 1.5, near: 0.1, far: 10000 }}
            >
              <Preview d={d} face={face} onDrop={place} />
            </Canvas>
          </div>
        </section>
      </div>
      {issues.map((v) => (
        <p role="alert" className="callout error" key={v}>
          {v}
        </p>
      ))}
      <div className="model-designer-actions">
        <Button
          className="primary"
          icon="save"
          onClick={() => {
            if (!validate()) return;
            edit('Designer model saved to library.', (p) => {
              const index = p.definitions.findIndex((v) => v.id === d.id);
              if (index < 0) p.definitions.push(clone(d));
              else p.definitions[index] = clone(d);
            });
          }}
        >
          Save model to library
        </Button>
        <Button
          onClick={() => {
            if (!validate()) return;
            const base = d.name.trim() || 'Custom rack device';
            let candidate = base,
              suffix = 1;
            while (nameExists(candidate)) {
              candidate = `${base} copy${suffix === 1 ? '' : ` ${suffix}`}`;
              suffix++;
            }
            setNewName(candidate);
          }}
        >
          Save as new
        </Button>
      </div>
      {newName !== null && (
        <Modal title="Save model as new" onClose={() => setNewName(null)}>
          <div className="modal-content">
            <Field label="New model name">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <p>
              The copy keeps your current edits as a separate library model. The original model and
              its installed devices stay unchanged. Further saves in this editor update the copy.
            </p>
            {nameExists(newName) && (
              <p role="alert">Choose a name that is not already in the library.</p>
            )}
          </div>
          <div className="modal-footer">
            <Button onClick={() => setNewName(null)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || nameExists(newName) || issues.length > 0}
              onClick={() => {
                if (!validate()) return;
                const copy = { ...clone(d), id: uid('def'), name: newName.trim() };
                if (
                  edit('New model saved to library. Further saves update this copy.', (p) => {
                    p.definitions.push(copy);
                  })
                ) {
                  setD(clone(copy));
                  setNewName(null);
                }
              }}
            >
              Save as new
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
