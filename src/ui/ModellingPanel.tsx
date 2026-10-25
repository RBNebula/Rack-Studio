import { useRef, useState } from 'react';
import { useStore } from '../state';
import type { Selection } from '../state';
import { clone, uid } from '../model';
import type { Vec3 } from '../model';
import { racks, rackById } from '../engineering/space';
import { duplicateObject, objectKey, objectPose, transformObject } from '../engineering/modelling';
import { bundlePacking } from '../engineering/wiring';
import { rackAssembly, insertAssembly, nextRackOrigin } from '../engineering/assemblies';
import { parseProject, serializeProject } from '../data/project';
import { NumberField } from './shared';
import { StructuralMembers } from './StructuralMembers';

export function ModellingPanel() {
  const s = useStore(),
    { project: p, set, edit, selection } = s;
  const [alignTarget, setAlignTarget] = useState(''),
    [cables, setCables] = useState<string[]>([]),
    [guides, setGuides] = useState<string[]>([]),
    [bundleName, setBundleName] = useState('Cable bundle');
  const file = useRef<HTMLInputElement>(null);
  const entries: { selection: NonNullable<Selection>; name: string }[] = [
    ...racks(p).map((r) => ({ selection: { kind: 'rack' as const, id: r.id }, name: r.name })),
    ...p.devices.map((v) => ({ selection: { kind: 'device' as const, id: v.id }, name: v.name })),
    ...p.accessories.map((v) => ({
      selection: { kind: 'accessory' as const, id: v.id },
      name: v.name,
    })),
    ...(p.wiringGuides ?? []).map((v) => ({
      selection: { kind: 'guide' as const, id: v.id },
      name: v.name,
    })),
    ...p.destinations.map((v) => ({
      selection: { kind: 'destination' as const, id: v.id },
      name: v.name,
    })),
    ...p.exits.map((v) => ({ selection: { kind: 'exit' as const, id: v.id }, name: v.name })),
    ...(p.sharedMembers ?? []).map((v) => ({
      selection: { kind: 'member' as const, id: v.id },
      name: v.name,
    })),
  ];
  if (!s.showModelTools) return null;
  const pose = objectPose(p, selection),
    active = rackById(p, s.activeRackId ?? undefined),
    key = selection ? objectKey(selection) : '';
  const guide =
    selection?.kind === 'guide' ? p.wiringGuides?.find((g) => g.id === selection.id) : null;
  const bound = guide && (guide.kind === 'point' ? guide.accessoryId : guide.trayId);
  const download = () => {
    try {
      const blob = new Blob([serializeProject(rackAssembly(p, active.id))], {
          type: 'application/json',
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'rack-assembly.rack.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      set({ error: String(e) });
    }
  };
  return (
    <aside className="model-tools-panel" aria-label="Modelling tools">
      <label className="check-field">
        <input
          type="checkbox"
          checked={s.showGround}
          onChange={(e) => set({ showGround: e.target.checked })}
        />
        Show ground plane
      </label>
      <div className="wiring-tools">
        {(['select', 'translate', 'rotate', 'measure', 'anchor', 'tie'] as const).map((tool) => (
          <button
            key={tool}
            aria-pressed={s.modelTool === tool}
            onClick={() =>
              set({ modelTool: tool, wiringTool: 'off', measureStart: null, modelPreview: null })
            }
          >
            {
              {
                select: 'Select',
                translate: 'Move',
                rotate: 'Rotate',
                measure: 'Measure',
                anchor: 'Place clip',
                tie: 'Place tie',
              }[tool]
            }
          </button>
        ))}
      </div>
      <small>
        {s.modelTool === 'measure'
          ? 'Click two visible surfaces to measure. Esc cancels.'
          : s.modelTool === 'anchor' || s.modelTool === 'tie'
            ? 'Click a physical surface to attach the fixing. Select it to adjust orientation and opening.'
            : 'Move: 5 mm snap. Rotate: 15° snap. Numeric positions allow any value. Devices move in U steps.'}
      </small>
      <label>
        Selected object
        <select
          aria-label="Model object"
          value={key}
          onChange={(e) => {
            const item = entries.find((v) => objectKey(v.selection) === e.target.value);
            set({
              selection: item?.selection ?? null,
              wiringGuideId: item?.selection.kind === 'guide' ? item.selection.id : null,
            });
          }}
        >
          <option value="">Choose object</option>
          {entries.map((v) => (
            <option key={objectKey(v.selection)} value={objectKey(v.selection)}>
              {v.selection.kind} · {v.name}
            </option>
          ))}
        </select>
      </label>
      {selection && (
        <div className="wiring-tools">
          <button
            onClick={() => {
              let next: Selection = null;
              if (
                edit('Object duplicated.', (p) => {
                  next = duplicateObject(p, selection);
                })
              )
                set({ selection: next });
            }}
          >
            Duplicate object
          </button>
          <button
            onClick={() =>
              set({ hiddenKeys: [...new Set([...s.hiddenKeys, key])], selection: null })
            }
          >
            Hide selected
          </button>
          <button
            aria-pressed={s.isolateKey === key}
            onClick={() => set({ isolateKey: s.isolateKey === key ? null : key })}
          >
            Isolate selected
          </button>
        </div>
      )}
      <button onClick={() => set({ hiddenKeys: [], isolateKey: null })}>Show all objects</button>
      {bound ? (
        <button
          onClick={() =>
            set({ selection: { kind: 'accessory', id: bound }, modelTool: 'translate' })
          }
        >
          Move attached hardware
        </button>
      ) : (
        pose &&
        selection && (
          <>
            <div className="form-grid three">
              {pose.position.map((v, i) => (
                <NumberField
                  key={i}
                  label={`World ${['X', 'Y', 'Z'][i]} (mm)`}
                  min={-100000}
                  value={v}
                  onChange={(n) =>
                    edit('Object position updated.', (p) =>
                      transformObject(
                        p,
                        selection,
                        pose.position.map((v, j) => (i === j ? n : v)) as Vec3,
                        pose.rotationDeg,
                      ),
                    )
                  }
                />
              ))}
            </div>
            {selection.kind === 'accessory' ||
            (selection.kind === 'guide' && guide?.kind === 'line') ? (
              <div className="form-grid three">
                {pose.rotationDeg.map((v, i) => (
                  <NumberField
                    key={i}
                    label={`Rotate ${['X', 'Y', 'Z'][i]} (°)`}
                    min={-3600}
                    value={v}
                    onChange={(n) =>
                      edit('Object rotation updated.', (p) =>
                        transformObject(
                          p,
                          selection,
                          pose.position,
                          pose.rotationDeg.map((v, j) => (i === j ? n : v)) as Vec3,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            ) : null}
          </>
        )
      )}
      {pose && selection && (
        <details>
          <summary>Align centres</summary>
          <select
            aria-label="Alignment target"
            value={alignTarget}
            onChange={(e) => setAlignTarget(e.target.value)}
          >
            <option value="">Choose target</option>
            {entries
              .filter((v) => objectKey(v.selection) !== key)
              .map((v) => (
                <option key={objectKey(v.selection)} value={objectKey(v.selection)}>
                  {v.name}
                </option>
              ))}
          </select>
          <div className="wiring-tools">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <button
                key={axis}
                onClick={() => {
                  const target = entries.find((v) => objectKey(v.selection) === alignTarget),
                    targetPose = target && objectPose(p, target.selection);
                  if (targetPose)
                    edit(`Centres aligned on ${axis}.`, (p) =>
                      transformObject(
                        p,
                        selection,
                        pose.position.map((v, j) => (i === j ? targetPose.position[j] : v)) as Vec3,
                        pose.rotationDeg,
                      ),
                    );
                }}
              >
                Align {axis}
              </button>
            ))}
          </div>
        </details>
      )}
      <details>
        <summary>Rack assemblies</summary>
        <label>
          Active rack
          <select
            aria-label="Active rack"
            value={active.id}
            onChange={(e) =>
              set({ activeRackId: e.target.value, selection: { kind: 'rack', id: e.target.value } })
            }
          >
            {racks(p).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="wiring-tools">
          <button
            onClick={() => {
              const r = clone(active);
              r.id = uid('rack');
              r.name = `Rack ${racks(p).length + 1}`;
              r.originMm = nextRackOrigin(p, active);
              r.sections.forEach((v) => (v.id = uid('section')));
              if (edit('Adjacent rack added.', (p) => (p.additionalRacks ??= []).push(r)))
                set({ activeRackId: r.id, selection: { kind: 'rack', id: r.id } });
            }}
          >
            Add adjacent rack
          </button>
          <button
            onClick={() => {
              let id = '';
              if (
                edit('Rack assembly duplicated.', (p) => {
                  id = insertAssembly(p, rackAssembly(p, active.id), nextRackOrigin(p, active));
                })
              )
                set({ activeRackId: id, selection: { kind: 'rack', id } });
            }}
          >
            Duplicate rack assembly
          </button>
          <button onClick={download}>Export rack assembly</button>
          <button onClick={() => file.current?.click()}>Import rack assembly</button>
          <input
            ref={file}
            type="file"
            hidden
            accept=".json"
            aria-label="Import rack assembly JSON"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const src = parseProject(await f.text());
                let id = '';
                if (
                  edit('Assembly imported without changing existing IDs.', (p) => {
                    id = insertAssembly(p, src, nextRackOrigin(p, active));
                  })
                )
                  set({ activeRackId: id, selection: { kind: 'rack', id } });
              } catch (error) {
                set({ error: String(error) });
              }
              e.target.value = '';
            }}
          />
        </div>
        <small>
          Each rack keeps its own U layout and dimensions. Select a rack to edit it. Connections can
          cross racks.
        </small>
      </details>
      <details>
        <summary>Shared beams / crossmembers</summary>
        <StructuralMembers
          members={p.sharedMembers ?? []}
          onChange={(members) =>
            edit('Shared structure updated.', (p) => {
              p.sharedMembers = members;
            })
          }
          onDraftPendingChange={() => {}}
        />
      </details>
      <details>
        <summary>Bundles and breakouts</summary>
        <label>
          Bundle name
          <input value={bundleName} onChange={(e) => setBundleName(e.target.value)} />
        </label>
        <small>
          Select the member cables and shared guides in order. Each cable keeps its own endpoints
          and schedule row; individual breakouts follow the shared guides.
        </small>
        {p.cables.map((c) => (
          <label className="check-field" key={c.id}>
            <input
              type="checkbox"
              checked={cables.includes(c.id)}
              onChange={(e) =>
                setCables(e.target.checked ? [...cables, c.id] : cables.filter((id) => id !== c.id))
              }
            />
            {c.label} · {c.name}
          </label>
        ))}
        <div className="wiring-guide-list">
          {p.wiringGuides?.map((g) => (
            <button
              key={g.id}
              aria-pressed={guides.includes(g.id)}
              onClick={() =>
                setGuides(
                  guides.includes(g.id) ? guides.filter((id) => id !== g.id) : [...guides, g.id],
                )
              }
            >
              {g.name}
              {guides.includes(g.id) ? ` · ${guides.indexOf(g.id) + 1}` : ''}
            </button>
          ))}
        </div>
        <button
          disabled={cables.length < 2 || guides.length < 1 || !bundleName.trim()}
          onClick={() => {
            if (
              edit('Bundle created with independent cable breakouts.', (p) =>
                p.looms.push({
                  id: uid('loom'),
                  name: bundleName,
                  cableIds: cables,
                  guideIds: guides,
                  packingFactor: 1,
                  waypoints: [],
                }),
              )
            ) {
              setCables([]);
              setGuides([]);
            }
          }}
        >
          Create cable bundle
        </button>
        {p.looms.map((l) => (
          <div key={l.id}>
            <strong>{l.name}</strong>
            <small>
              {l.cableIds.length} cables · conservative packed envelope{' '}
              {bundlePacking(p, l.cableIds).diameterMm.toFixed(1)} mm
            </small>
            <button
              onClick={() =>
                edit('Bundle removed; cables retained.', (p) => {
                  p.looms = p.looms.filter((v) => v.id !== l.id);
                })
              }
            >
              Remove {l.name}
            </button>
          </div>
        ))}
      </details>
      {(p.measurements?.length ?? 0) > 0 && (
        <details>
          <summary>Measurements</summary>
          {p.measurements?.map((m) => (
            <div key={m.id}>
              {m.name} · {Math.hypot(...m.end.map((v, i) => v - m.start[i])).toFixed(1)} mm{' '}
              <button
                aria-label={`Delete ${m.name}`}
                onClick={() =>
                  edit('Measurement removed.', (p) => {
                    p.measurements = p.measurements!.filter((v) => v.id !== m.id);
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
        </details>
      )}
    </aside>
  );
}
