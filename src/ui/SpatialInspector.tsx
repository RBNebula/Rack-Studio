import { useStore } from '../state';
import { objectPose, transformObject } from '../engineering/modelling';
import type { Vec3 } from '../model';
import { Field, NumberField, Button } from './shared';

export function SpatialInspector() {
  const s = useStore(),
    { selection, project: p, edit, set } = s;
  if (!selection) return null;
  const pose = objectPose(p, selection);
  const dest =
    selection.kind === 'destination' ? p.destinations.find((v) => v.id === selection.id) : null;
  const exit = selection.kind === 'exit' ? p.exits.find((v) => v.id === selection.id) : null;
  const guide =
    selection.kind === 'guide' ? p.wiringGuides?.find((v) => v.id === selection.id) : null;
  const member =
    selection.kind === 'member' ? p.sharedMembers?.find((v) => v.id === selection.id) : null;
  const record = dest ?? exit ?? guide ?? member;
  return (
    <div className="inspector-content">
      {record && (
        <Field label="Object name">
          <input
            value={record.name}
            onChange={(e) =>
              edit('Object renamed.', (p) => {
                const list =
                  selection.kind === 'destination'
                    ? p.destinations
                    : selection.kind === 'exit'
                      ? p.exits
                      : selection.kind === 'guide'
                        ? p.wiringGuides
                        : p.sharedMembers;
                list!.find((v) => v.id === selection.id)!.name = e.target.value;
              })
            }
          />
        </Field>
      )}
      {dest && (
        <>
          <Field label="Vehicle location">
            <input
              value={dest.location}
              onChange={(e) =>
                edit('Endpoint location updated.', (p) => {
                  p.destinations.find((v) => v.id === dest.id)!.location = e.target.value;
                })
              }
            />
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              checked={!!dest.routeIn3D}
              onChange={(e) =>
                edit('Vehicle endpoint routing mode updated.', (p) => {
                  const d = p.destinations.find((v) => v.id === dest.id)!;
                  d.routeIn3D = e.target.checked;
                  if (d.routeIn3D && !d.position) d.position = [-700, 400, 1000];
                })
              }
            />
            Position and route in 3D
          </label>
          <p className="small muted">
            Positioned endpoints include the complete modelled route through the rack exit. Stored
            manual external distances are ignored in this mode.
          </p>
          {dest.ports.map((port, index) => (
            <details key={port.id}>
              <summary>
                {port.name} · {port.connector}
              </summary>
              <Field label={`Endpoint port ${index + 1} name`}>
                <input
                  value={port.name}
                  onChange={(e) =>
                    edit('Endpoint port renamed.', (p) => {
                      p.destinations.find((v) => v.id === dest.id)!.ports[index].name =
                        e.target.value;
                    })
                  }
                />
              </Field>
              <div className="form-grid three">
                {port.direction.map((v, i) => (
                  <NumberField
                    key={i}
                    label={`Port direction ${['X', 'Y', 'Z'][i]}`}
                    min={-1}
                    max={1}
                    step={0.1}
                    value={v}
                    onChange={(n) =>
                      edit('Endpoint direction updated.', (p) => {
                        p.destinations.find((v) => v.id === dest.id)!.ports[index].direction[i] = n;
                      })
                    }
                  />
                ))}
              </div>
            </details>
          ))}
        </>
      )}
      {pose && (
        <div className="form-grid three">
          {pose.position.map((v, i) => (
            <NumberField
              key={i}
              label={`Position ${['X', 'Y', 'Z'][i]} (mm)`}
              min={-100000}
              value={v}
              onChange={(n) =>
                edit('Object moved.', (p) =>
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
      )}
      <Button
        onClick={() => set({ showModelTools: true, modelTool: 'translate', wiringTool: 'off' })}
      >
        Move in 3D
      </Button>
      {guide && (
        <p className="small muted">
          Edit line endpoints and linking in Wiring mode. Physical guides move with their fixing or
          tray.
        </p>
      )}
    </div>
  );
}
