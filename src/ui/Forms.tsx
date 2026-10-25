import { useState } from 'react';
import { useStore } from '../state';
import { uid, cableLabel } from '../model';
import type { DeviceDefinition, Endpoint, Vec3 } from '../model';
import { baseCable } from '../examples';
import { validatePlacement } from '../engineering/geometry';
import { connectionIssues, endpointLabel, endpointPort } from '../engineering/connectivity';
import { Button, Field, Modal, NumberField, Icon, Badge } from './shared';
import { racks, rackById } from '../engineering/space';

export function PlacementDialog({
  definition,
  onClose,
}: {
  definition: DeviceDefinition;
  onClose: () => void;
}) {
  const { project, edit, set } = useStore();
  const [u, setU] = useState(1);
  const [rackId, setRackId] = useState(useStore.getState().activeRackId ?? project.rack.id);
  const [face, setFace] = useState<'front' | 'rear'>(useStore.getState().placeFace);
  const [supportId, setSupport] = useState<string | null>(null);
  const candidate = {
    id: uid('device'),
    definitionId: definition.id,
    rackId: rackId === project.rack.id ? undefined : rackId,
    name: `${definition.name} ${project.devices.filter((d) => d.definitionId === definition.id).length + 1}`,
    startU: u,
    face,
    supportId,
    installation: 'installed' as const,
  };
  const issues = validatePlacement(project, candidate);
  return (
    <Modal title="Place equipment precisely" onClose={onClose}>
      <div className="modal-content">
        <h3>{definition.name}</h3>
        <Badge tone="warn">{definition.evidence} dimensions</Badge>
        <Field label="Rack">
          <select value={rackId} onChange={(e) => setRackId(e.target.value)}>
            {racks(project).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label="Start U"
          value={u}
          min={1}
          max={rackById(project, rackId).heightU}
          onChange={setU}
        />
        <Field label="Mounting face">
          <select value={face} onChange={(e) => setFace(e.target.value as 'front' | 'rear')}>
            <option value="front">Front</option>
            <option value="rear">Rear</option>
          </select>
        </Field>
        {definition.mounting === 'freestanding' && (
          <Field label="Supporting shelf">
            <select
              value={supportId ?? ''}
              onChange={(e) => {
                const support = project.devices.find((d) => d.id === e.target.value);
                setSupport(support?.id ?? null);
                if (support) {
                  setU(support.startU);
                  setFace(support.face);
                }
              }}
            >
              <option value="">Choose shelf</option>
              {project.devices
                .filter(
                  (d) =>
                    project.definitions.find((x) => x.id === d.definitionId)?.mounting === 'shelf',
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · U{d.startU}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {issues.length > 0 ? (
          <div className="callout error">
            <Icon name="alert" />
            <span>{issues.join(' ')}</span>
          </div>
        ) : (
          <div className="callout good">
            <Icon name="check" />
            <span>No conflict detected in the configured example geometry.</span>
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          className="primary"
          onClick={() => {
            if (issues.length) {
              set({ error: issues.join('\n') });
              return;
            }
            if (
              edit('Equipment placed. Installation animation remains a later milestone.', (p) =>
                p.devices.push(candidate),
              )
            ) {
              set({ selection: { kind: 'device', id: candidate.id } });
              onClose();
            }
          }}
        >
          Place equipment
        </Button>
      </footer>
    </Modal>
  );
}
const endpointKey = (e: Endpoint) => JSON.stringify(e);
export function ConnectionDialog({ onClose }: { onClose: () => void }) {
  const { project, edit, set } = useStore();
  const endpoints: Endpoint[] = [
    ...project.devices.flatMap((d) =>
      (project.definitions.find((v) => v.id === d.definitionId)?.ports ?? []).map((port) => ({
        kind: 'device' as const,
        deviceId: d.id,
        portId: port.id,
      })),
    ),
    ...project.destinations.flatMap((d) =>
      d.ports.map((port) => ({ kind: 'external' as const, destinationId: d.id, portId: port.id })),
    ),
  ];
  const [source, setSource] = useState(endpoints[0] ? endpointKey(endpoints[0]) : '');
  const [destination, setDestination] = useState(endpoints[1] ? endpointKey(endpoints[1]) : '');
  const [purpose, setPurpose] = useState('');
  const [supply, setSupply] = useState<'preterminated' | 'bulk'>('preterminated');
  const [exitId, setExit] = useState(project.exits[0]?.id ?? '');
  const [id, setId] = useState(() => {
    const prefix = project.settings.cablePrefix;
    const label = (i: number) => (prefix ? `${prefix}-${String(i).padStart(3, '0')}` : String(i));
    let i = 0;
    while (project.cables.some((c) => cableLabel(c) === label(i))) i++;
    return label(i);
  });
  const from = endpoints.find((e) => endpointKey(e) === source),
    to = endpoints.find((e) => endpointKey(e) === destination);
  const issues =
    from && to ? connectionIssues(project, from, to) : ['Define at least two ports first.'];
  const external = from?.kind === 'external' || to?.kind === 'external';
  return (
    <Modal title="New cable connection" onClose={onClose}>
      <div className="modal-content">
        <Field label="Cable ID">
          <input value={id} onChange={(e) => setId(e.target.value)} />
        </Field>
        <Field label="Source port">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {endpoints.map((e) => (
              <option key={endpointKey(e)} value={endpointKey(e)}>
                {endpointLabel(project, e)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Destination port">
          <select value={destination} onChange={(e) => setDestination(e.target.value)}>
            {endpoints.map((e) => (
              <option key={endpointKey(e)} value={endpointKey(e)}>
                {endpointLabel(project, e)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Purpose">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        <Field label="Cable supply">
          <select value={supply} onChange={(e) => setSupply(e.target.value as typeof supply)}>
            <option value="preterminated">Preterminated · supplied length editable</option>
            <option value="bulk">Bulk cable · cut from reel</option>
          </select>
        </Field>
        {external && (
          <Field label="Rack exit">
            <select value={exitId} onChange={(e) => setExit(e.target.value)}>
              {project.exits.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {issues.length > 0 && (
          <div className="callout error">
            <Icon name="alert" />
            <span>{issues.join(' ')}</span>
          </div>
        )}
        <p className="muted small">
          Cable numbers are editable labels. A separate internal identifier preserves references
          when you renumber. Routing checks use the current model and declared cable constraints.
        </p>
      </div>
      <footer className="modal-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          className="primary"
          icon="cable"
          onClick={() => {
            if (!from || !to || issues.length) {
              set({ error: issues.join('\n') });
              return;
            }
            const connector = endpointPort(project, from)!.connector;
            const c = {
              ...baseCable(uid('cable')),
              label: id,
              name: `Cable ${id}`,
              source: from,
              destination: to,
              type:
                connector === 'RJ45' ? 'Cat6A' : connector.startsWith('IEC') ? 'Power' : connector,
              ...(connector === 'RJ45' ? {} : { terminationAMm: 0, terminationBMm: 0 }),
              purpose,
              supply,
              productId: project.products[0]?.id ?? '',
              exitId: external ? exitId : null,
              suppliedLengthMm: supply === 'preterminated' ? 2000 : null,
            };
            if (edit('Cable connection created.', (p) => p.cables.push(c))) {
              set({ selection: { kind: 'cable', id: c.id } });
              onClose();
            }
          }}
        >
          Connect ports
        </Button>
      </footer>
    </Modal>
  );
}
export function DestinationDialog({ onClose }: { onClose: () => void }) {
  const { edit } = useStore();
  const [name, setName] = useState('User position');
  const [location, setLocation] = useState('');
  const [portName, setPort] = useState('Network port 1');
  const [connector, setConnector] = useState('RJ45');
  const [positioned, setPositioned] = useState(false);
  const [position, setPosition] = useState<Vec3>([-700, 400, 1000]);
  return (
    <Modal title="External destination" onClose={onClose}>
      <div className="modal-content">
        <Field label="Destination name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Location / area">
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Port name">
          <input value={portName} onChange={(e) => setPort(e.target.value)} />
        </Field>
        <Field label="Connector">
          <select value={connector} onChange={(e) => setConnector(e.target.value)}>
            {['RJ45', 'HDMI', 'USB-C', 'LC', 'SDI', 'IEC-C14', 'Custom'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <label className="check-field">
          <input
            type="checkbox"
            checked={positioned}
            onChange={(e) => setPositioned(e.target.checked)}
          />
          Position vehicle endpoint in 3D
        </label>
        {positioned && (
          <div className="form-grid three">
            {position.map((v, i) => (
              <NumberField
                key={i}
                label={`Vehicle ${['X', 'Y', 'Z'][i]} (mm)`}
                value={v}
                min={-100000}
                onChange={(n) => setPosition(position.map((v, j) => (i === j ? n : v)) as Vec3)}
              />
            ))}
          </div>
        )}
        <div className="callout">
          <Icon name="cable" />
          <span>
            {positioned
              ? 'The full cable path to this endpoint is modelled through its rack exit. No separate manual external distance is added.'
              : 'This is a logical destination. Enter the surveyed external distance on each cable to calculate its complete length.'}
          </span>
        </div>
      </div>
      <footer className="modal-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          className="primary"
          onClick={() => {
            if (
              edit('External destination added.', (p) =>
                p.destinations.push({
                  id: uid('destination'),
                  name,
                  location,
                  notes: '',
                  position: positioned ? position : null,
                  routeIn3D: positioned,
                  ports: [
                    {
                      id: uid('port'),
                      name: portName,
                      connector,
                      surface: 'custom',
                      position: [0, 0, 0],
                      direction: [0, 0, 1],
                      multiple: false,
                    },
                  ],
                }),
              )
            )
              onClose();
          }}
        >
          Add destination
        </Button>
      </footer>
    </Modal>
  );
}
export function ExitDialog({ onClose }: { onClose: () => void }) {
  const { project, edit } = useStore();
  const [name, setName] = useState(`Rack exit ${project.exits.length + 1}`);
  const [position, setPosition] = useState<Vec3>([-260, 100, 700]);
  const [width, setWidth] = useState(60);
  const [height, setHeight] = useState(60);
  return (
    <Modal title="Define rack cable exit" onClose={onClose}>
      <div className="modal-content">
        <Field label="Exit name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="form-grid three">
          {position.map((v, i) => (
            <NumberField
              key={i}
              label={`${['x', 'y', 'z'][i]} (mm)`}
              value={v}
              min={-10000}
              onChange={(n) => setPosition(position.map((x, j) => (j === i ? n : x)) as Vec3)}
            />
          ))}
        </div>
        <div className="form-grid">
          <NumberField label="Clear width (mm)" value={width} min={1} onChange={setWidth} />
          <NumberField label="Clear height (mm)" value={height} min={1} onChange={setHeight} />
        </div>
        <div className="callout">
          <Icon name="alert" />
          <span>
            Opening dimensions are user-entered. Cutting an opening through an enclosure panel is
            not implemented; place exits in an unobstructed opening in this milestone.
          </span>
        </div>
      </div>
      <footer className="modal-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          className="primary"
          onClick={() => {
            if (
              edit('Rack exit added.', (p) =>
                p.exits.push({
                  id: uid('exit'),
                  name,
                  position,
                  size: [width, height],
                  direction: [0, 0, 1],
                  evidence: 'user-entered',
                }),
              )
            )
              onClose();
          }}
        >
          Add exit
        </Button>
      </footer>
    </Modal>
  );
}
