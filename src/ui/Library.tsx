import { useState } from 'react';
import { useStore } from '../state';
import { clone, uid, definitionSchema } from '../model';
import type { DeviceDefinition, PhysicalBox, Port, ShelfConfiguration } from '../model';
import { Button, Icon, IconButton, Badge, Field, NumberField, Modal, download } from './shared';
import { PlacementDialog } from './Forms';
import { catalogueReferences } from '../catalogue';
import {
  definitionParts,
  makeShelfConfiguration,
  validateShelfDefinition,
} from '../engineering/shelves';
import { U_MM } from '../engineering/geometry';
import { ConnectorRotation } from './ConnectorRotation';
import { DefinitionPowerFields } from './PowerPanel';
import { powerDefinitionIssues } from '../engineering/power';
import { portRotationDeg } from '../engineering/ports';
import { createGenericSwitch } from '../models/generic-switch';
const genericSwitch = createGenericSwitch();
import { createLacingBar } from '../models/lacing-bar';
const lacingBar = createLacingBar();
import {
  makePlateConfiguration,
  plateApertures,
  plateMountingSlots,
  validatePlateDefinition,
} from '../engineering/plates';
const categories = [
  'All equipment',
  'Servers',
  'Computers',
  'Network switches',
  'Patch panels',
  'AVoIP equipment',
  'Power equipment',
  'Shelves',
  'Cable management',
  'Custom equipment',
];
export function DeviceMini({ definition: d }: { definition: DeviceDefinition }) {
  if (d.plate) return <PlateMini definition={d} />;
  if (d.lacing)
    return (
      <div className="device-mini">
        <svg
          viewBox="0 0 500 180"
          width="100%"
          height="100%"
          role="img"
          aria-label="Open lacing bar with two returns and a crossbar"
        >
          <path d="M15 10H45V165H455V10H485" fill="none" stroke="#99a5ad" strokeWidth="10" />
        </svg>
      </div>
    );
  if (d.appearance === 'generic-switch-24' && !d.frontImage)
    return (
      <div className="device-mini" style={{ background: d.color, padding: 0 }}>
        <svg
          viewBox={`${-d.faceWidthMm / 2} 0 ${d.faceWidthMm} ${d.heightMm}`}
          width="100%"
          height="100%"
          role="img"
          aria-label="24 Ethernet ports in one row and two SFP cages"
        >
          {d.ports
            .filter((p) => p.surface === 'front')
            .map((p) => (
              <rect
                key={p.id}
                transform={`rotate(${portRotationDeg(p)} ${-p.position[0]} ${d.heightMm - p.position[1]})`}
                x={-p.position[0] - (p.widthMm ?? 14) / 2}
                y={d.heightMm - p.position[1] - (p.heightMm ?? 12) / 2}
                width={p.widthMm ?? 14}
                height={p.heightMm ?? 12}
                fill="#141a20"
                stroke="#87929a"
                strokeWidth="1"
              />
            ))}
        </svg>
      </div>
    );
  if (d.appearance === 'user-rack-pc' && !d.frontImage) {
    return (
      <div className="device-mini" style={{ background: '#242627', padding: 0 }}>
        <svg
          viewBox={`${-d.faceWidthMm / 2} 0 ${d.faceWidthMm} ${d.heightMm}`}
          width="100%"
          height="100%"
          role="img"
          aria-label="Rack PC front with two stacked USB ports"
        >
          <path
            d={`M${-d.widthMm / 2},7h${d.widthMm}M${-d.widthMm / 2},${d.heightMm - 7}h${d.widthMm}`}
            stroke="#667076"
            strokeDasharray="2 2"
            strokeWidth="5"
          />
          {d.ports
            .filter((p) => p.surface === 'front')
            .map((p) => (
              <rect
                key={p.id}
                transform={`rotate(${portRotationDeg(p)} ${-p.position[0]} ${d.heightMm - p.position[1]})`}
                x={-p.position[0] - (p.widthMm ?? 12) / 2}
                y={d.heightMm - p.position[1] - (p.heightMm ?? 4.5) / 2}
                width={p.widthMm ?? 12}
                height={p.heightMm ?? 4.5}
                fill={p.visualColor ?? '#2364ba'}
                stroke="#b1b9be"
                strokeWidth="0.6"
              />
            ))}
          <rect x="29" y="12" width="46" height="10" fill="#596064" />
          {[-231, 231].map((x) => (
            <rect
              key={x}
              x={x - 3}
              y="8"
              width="6"
              height="27"
              rx="2"
              fill="none"
              stroke="#bfc6ca"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
    );
  }
  return (
    <div
      className={`device-mini ${d.category === 'Computers' ? 'computer' : ''}`}
      style={{ background: d.color }}
    >
      {d.frontImage ? (
        <img src={d.frontImage} alt="Device front" />
      ) : (
        <>
          <span className="mini-ear" />
          <div className="mini-ports">
            {Array.from({ length: Math.min(d.ports.length || 6, 24) }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <b />
          <span className="mini-ear" />
        </>
      )}
    </div>
  );
}

function PlateMini({ definition: d }: { definition: DeviceDefinition }) {
  const width = d.faceWidthMm;
  const height = d.heightMm;
  const aperturePaths = plateApertures(d).map(
    ({ x, y, radius: r }) =>
      `M${x - r},${y}a${r},${r} 0 1 0 ${r * 2},0a${r},${r} 0 1 0 ${-r * 2},0`,
  );
  const slotPaths = plateMountingSlots(d).map(({ x, y, width: w, height: h }) => {
    const r = h / 2;
    const straight = (w - h) / 2;
    return `M${x - straight},${y - r}h${straight * 2}a${r},${r} 0 0 1 0,${h}h${-straight * 2}a${r},${r} 0 0 1 0,${-h}Z`;
  });
  const outline = `M${-width / 2},0h${width}v${height}h${-width}Z`;
  return (
    <div
      className="device-mini"
      style={{
        background: 'transparent',
        boxShadow: 'none',
        border: 0,
        padding: 0,
        height: Math.max(27, Math.min(68, height * 0.45)),
      }}
    >
      <svg
        viewBox={`${-width / 2} 0 ${width} ${height}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={`${d.plate?.style === 'perforated' ? 'Perforated' : 'Solid'} blanking plate`}
      >
        <path
          d={[outline, ...aperturePaths, ...slotPaths].join(' ')}
          fill={d.color}
          fillRule="evenodd"
        />
        <path
          d={`M${-d.widthMm / 2},1.2h${d.widthMm}M${-d.widthMm / 2},${height - 1.2}h${d.widthMm}`}
          stroke="#ffffff30"
          strokeWidth="0.8"
        />
      </svg>
    </div>
  );
}
export default function Library({
  expanded = false,
  onCollapse,
}: {
  expanded?: boolean;
  /** Designer sidebar only: collapse the panel to widen the 3D viewport. */
  onCollapse?: () => void;
}) {
  const { project, set, edit } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All equipment');
  const [editing, setEditing] = useState<DeviceDefinition | null>(null);
  const [placing, setPlacing] = useState<DeviceDefinition | null>(null);
  const definitions = project.definitions.filter(
    (d) =>
      (category === 'All equipment' || d.category === category) &&
      `${d.name} ${d.manufacturer} ${d.model}`.toLowerCase().includes(search.toLowerCase()),
  );
  function remove(d: DeviceDefinition) {
    if (project.devices.some((x) => x.definitionId === d.id)) {
      set({
        error:
          'This definition is installed in the project. Remove its instances before deleting it.',
      });
      return;
    }
    edit('Device definition deleted.', (p) => {
      p.definitions = p.definitions.filter((x) => x.id !== d.id);
    });
  }
  return (
    <section className={`library ${expanded ? 'expanded' : ''}`}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">EQUIPMENT</span>
          <h2>
            Device library <span>{project.definitions.length}</span>
          </h2>
        </div>
        <div className="panel-actions">
          <button
            className="icon-button teal"
            data-tooltip="New device"
            aria-label="New device"
            onClick={() =>
              setEditing({
                ...clone(project.definitions[0]),
                id: uid('def'),
                name: 'Custom device',
                lacing: undefined,
                manufacturer: '',
                model: '',
                category: 'Custom equipment',
                ports: [],
                parts: [],
                shelf: null,
                plate: null,
                appearance: null,
                frontImage: null,
                rearImage: null,
                evidence: 'user-entered',
                source: '',
              })
            }
          >
            <Icon name="plus" />
          </button>
          {onCollapse && (
            <IconButton icon="panel-left" label="Collapse equipment library" onClick={onCollapse} />
          )}
        </div>
      </div>
      <div className="search-field">
        <Icon name="search" />
        <input
          aria-label="Search equipment"
          placeholder="Search equipment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>/</kbd>
      </div>
      <select
        aria-label="Device category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <div className="library-items">
        {!project.definitions.some((d) => d.id === lacingBar.id) &&
          (category === 'All equipment' || category === 'Cable management') &&
          lacingBar.name.toLowerCase().includes(search.toLowerCase()) && (
            <article className="library-card">
              <DeviceMini definition={lacingBar} />
              <h3>{lacingBar.name}</h3>
              <p>
                One middle-hole screw per side · 150 mm inward reach · open cable support. Editable
                provisional dimensions.
              </p>
              <Button
                onClick={() =>
                  edit('Lacing bar added to this library.', (p) =>
                    p.definitions.push(clone(lacingBar)),
                  )
                }
              >
                Add lacing bar
              </Button>
            </article>
          )}
        {!project.definitions.some((d) => d.id === genericSwitch.id) &&
          (category === 'All equipment' || category === 'Network switches') &&
          genericSwitch.name.toLowerCase().includes(search.toLowerCase()) && (
            <article className="library-card">
              <DeviceMini definition={genericSwitch} />
              <h3>{genericSwitch.name}</h3>
              <p>
                24 front RJ45 · 2 front SFP cages · rear IEC power. Editable provisional geometry.
              </p>
              <Button
                onClick={() =>
                  edit('Generic 24-port switch added to this library.', (p) =>
                    p.definitions.push(clone(genericSwitch)),
                  )
                }
              >
                Add generic 24-port switch
              </Button>
            </article>
          )}
        {(category === 'All equipment' || category === 'Cable management') &&
          'perforated pvc cable tray pct110'.includes(search.toLowerCase()) && (
            <article
              className="library-card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/rack-tray', 'pct110-reference');
                set({ workspace: 'designer', selection: null });
              }}
            >
              <h3>Perforated PVC cable tray</h3>
              <p>
                110 mm wide · cut length 400 mm · 2.5 mm PVC reference. Slot pitch and lip height
                provisional. Drag into rack; select and use the green end handle in 3D to stretch.
              </p>
            </article>
          )}
        {catalogueReferences
          .filter(
            (r) =>
              (category === 'All equipment' || r.definition.category === category) &&
              `${r.definition.name} ${r.definition.manufacturer}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .map((r) => (
            <article className="library-card reference-card" key={r.definition.id}>
              <Badge tone="warn">Catalogue reference · geometry incomplete</Badge>
              <h3>{r.definition.name}</h3>
              <p>{r.published}</p>
              <p>Still needed: {r.missing}.</p>
              <Button
                icon="settings"
                onClick={() => setEditing({ ...clone(r.definition), id: uid('def') })}
              >
                Configure measured geometry
              </Button>
            </article>
          ))}
        {definitions.map((d) => (
          <article
            className="library-card"
            key={d.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/rack-definition', d.id);
              e.dataTransfer.effectAllowed = 'copy';
              set({
                dragDefinitionId: d.id,
                dragDeviceId: null,
                selection: null,
                workspace: 'designer',
              });
            }}
            onDragEnd={() => set({ dragDefinitionId: null, dragDeviceId: null, previewU: null })}
          >
            <DeviceMini definition={d} />
            <div className="card-heading">
              <h3>{d.name}</h3>
              <span className="u-badge">{d.heightU}U</span>
            </div>
            <p>
              {d.widthMm} W × {d.depthMm} D mm
              {d.lacing && <> · {d.depthMm - d.lacing.barWidthMm} mm clear reach · example</>}
            </p>
            {d.appearance === 'user-rack-pc' && (
              <Badge tone="warn">Photo ports · height provisional</Badge>
            )}
            {d.appearance === 'generic-switch-24' && (
              <Badge tone="warn">Generic layout · dimensions provisional</Badge>
            )}
            <div className="card-bottom">
              <span>
                {d.mounting === 'rails'
                  ? 'Rail mounted'
                  : d.mounting === 'freestanding'
                    ? 'Shelf required'
                    : d.category}
              </span>
              <div className="card-actions">
                <button
                  data-tooltip={`Place ${d.name}`}
                  aria-label={`Place ${d.name}`}
                  onClick={() => setPlacing(d)}
                >
                  <Icon name="plus" size={14} />
                </button>
                <button
                  data-tooltip={`Edit ${d.name}`}
                  aria-label={`Edit ${d.name}`}
                  onClick={() => setEditing(clone(d))}
                >
                  <Icon name="settings" size={14} />
                </button>
                <button
                  data-tooltip={`Duplicate ${d.name}`}
                  aria-label={`Duplicate ${d.name}`}
                  onClick={() =>
                    edit('Definition duplicated.', (p) =>
                      p.definitions.push({ ...clone(d), id: uid('def'), name: `${d.name} copy` }),
                    )
                  }
                >
                  <Icon name="copy" size={14} />
                </button>
                {expanded && (
                  <button
                    aria-label={`Delete ${d.name}`}
                    data-tooltip={`Delete ${d.name}`}
                    onClick={() => remove(d)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="library-footer">
        <Icon name="cube" size={16} />
        <span>
          Drag equipment into the rack.
          <br />
          Select an item to place it precisely.
        </span>
      </div>
      {expanded && (
        <div className="button-row">
          <Button
            icon="download"
            onClick={() =>
              download(
                'equipment-library.json',
                JSON.stringify(project.definitions, null, 2),
                'application/json',
              )
            }
          >
            Export library
          </Button>
          <label className="button">
            <Icon name="upload" />
            Import library
            <input
              hidden
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 20_000_000) throw new Error('Library exceeds 20 MB.');
                  const raw = JSON.parse(await f.text()) as unknown;
                  if (!Array.isArray(raw)) throw new Error('Expected an array of definitions.');
                  const defs = raw.map((x) => definitionSchema.parse(x));
                  edit('Library imported.', (p) =>
                    p.definitions.push(...defs.map((d) => ({ ...d, id: uid('def') }))),
                  );
                } catch (err) {
                  set({ error: String(err) });
                }
              }}
            />
          </label>
        </div>
      )}
      {editing && <DeviceEditor initial={editing} onClose={() => setEditing(null)} />}{' '}
      {placing && <PlacementDialog definition={placing} onClose={() => setPlacing(null)} />}
    </section>
  );
}
function DeviceEditor({ initial, onClose }: { initial: DeviceDefinition; onClose: () => void }) {
  const [d, setD] = useState(initial);
  const [supportDraft, setSupportDraft] = useState<ShelfSupportDraft | null>(null);
  const [tab, setTab] = useState<'dimensions' | 'ports' | 'shape' | 'power'>('dimensions');
  const { edit, set } = useStore();
  const update = (patch: Partial<DeviceDefinition>) => setD({ ...d, ...patch });
  async function image(file: File | undefined, face: 'frontImage' | 'rearImage') {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5_000_000) {
      set({ error: 'Choose a PNG, JPEG or WebP image smaller than 5 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ [face]: String(reader.result) });
    reader.readAsDataURL(file);
  }
  const n = (
    label: string,
    key: 'widthMm' | 'heightU' | 'heightMm' | 'depthMm' | 'faceWidthMm',
  ) => (
    <NumberField
      label={label}
      value={d[key]}
      min={key === 'heightU' ? 1 : 0.1}
      step={key === 'heightU' ? 1 : 0.1}
      hint={
        key === 'heightU' && d.plate
          ? 'Changing U regenerates the generic plate height with 1.5 mm total clearance and upper/lower hole positions.'
          : undefined
      }
      onChange={(v) =>
        update(
          key === 'heightU' && d.plate
            ? {
                heightU: v,
                heightMm: v * U_MM - 1.5,
                screwOffsetsMm: [6.35, v * U_MM - 6.35],
                evidence: 'example',
              }
            : key === 'heightU' && d.mounting === 'shelf' && d.shelf
              ? {
                  heightU: v,
                  heightMm: v * U_MM,
                  screwOffsetsMm: [6.35, v * U_MM - 6.35],
                }
              : { [key]: v },
        )
      }
    />
  );
  function addPort() {
    const i = d.ports.length + 1;
    update({
      ports: [
        ...d.ports,
        {
          id: uid('port'),
          name: `Port ${i}`,
          connector: 'RJ45',
          surface: 'rear',
          position: [0, d.heightMm / 2, d.depthMm + 2],
          direction: [0, 0, 1],
          multiple: false,
        },
      ],
    });
  }
  function portChange(index: number, patch: Partial<Port>) {
    update({ ports: d.ports.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  }
  const shelfNumber = (
    label: string,
    key: 'usableWidthMm' | 'usableDepthMm' | 'floorThicknessMm' | 'wallThicknessMm',
  ) =>
    d.shelf && (
      <NumberField
        label={label}
        value={d.shelf[key]}
        min={0.1}
        step={0.1}
        onChange={(value) => update({ shelf: { ...d.shelf!, [key]: value } })}
      />
    );
  return (
    <Modal title={`Device definition · ${d.name}`} onClose={onClose} wide>
      <div className="modal-tabs">
        {(d.plate || d.lacing
          ? (['dimensions', 'power'] as const)
          : (['dimensions', 'ports', 'shape', 'power'] as const)
        ).map((t) => (
          <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>
            {t === 'power'
              ? 'Power & weight'
              : t === 'shape'
                ? 'Compound geometry'
                : t === 'ports'
                  ? `Ports (${d.ports.length})`
                  : 'Dimensions & mounting'}
          </button>
        ))}
      </div>
      <div className="modal-content">
        <div className="callout">
          <Icon name="alert" />
          <span>
            {d.appearance === 'user-rack-pc'
              ? 'Width/depth are user measured; 1U is confirmed. Physical height 43 mm, ear thickness, port positions and fitting dimensions remain provisional. Edit port coordinates after measuring; changing chassis dimensions does not rescale stored ports or compound components.'
              : d.plate
                ? `Plate dimensions are ${d.evidence}. These generic sheet and aperture dimensions can be calibrated from measured parts. Zero return depth is valid for a flat plate.`
                : `Dimensions and ports are ${d.evidence}. A zero in this draft is an unresolved measurement and blocks saving. Catalogue depths do not establish the mounting-ear datum. Images do not establish physical scale.`}
          </span>
        </div>
        {tab === 'dimensions' && (
          <>
            <div className="form-grid">
              <Field label="Device name">
                <input value={d.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Category">
                <select value={d.category} onChange={(e) => update({ category: e.target.value })}>
                  {categories.slice(1).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Manufacturer">
                <input
                  value={d.manufacturer}
                  onChange={(e) => update({ manufacturer: e.target.value })}
                />
              </Field>
              <Field label="Model">
                <input value={d.model} onChange={(e) => update({ model: e.target.value })} />
              </Field>
              <Field label="Face construction">
                <select
                  disabled={Boolean(d.lacing)}
                  value={d.plate?.style ?? 'equipment'}
                  onChange={(e) => {
                    const style = e.target.value;
                    if (style === 'equipment') {
                      update({ plate: null, bodyMode: 'box', depthMm: Math.max(1, d.depthMm) });
                    } else if (d.plate) {
                      update({ plate: { ...d.plate, style: style as 'solid' | 'perforated' } });
                    } else {
                      update({
                        plate: makePlateConfiguration(style as 'solid' | 'perforated'),
                        widthMm: 430,
                        faceWidthMm: 482.6,
                        heightMm: d.heightU * U_MM - 1.5,
                        depthMm: 10,
                        earThicknessMm: 1.5,
                        screwOffsetsMm: [6.35, d.heightU * U_MM - 6.35],
                        bodyMode: 'parts',
                        mounting: 'direct',
                        category: 'Cable management',
                        appearance: null,
                        color: '#242526',
                        shelf: null,
                        ports: [],
                        parts: [],
                        evidence: 'example',
                      });
                    }
                  }}
                >
                  <option value="equipment">Equipment chassis</option>
                  <option value="solid">Solid blanking plate</option>
                  <option value="perforated">Perforated blanking plate</option>
                </select>
              </Field>
              {n(d.plate ? 'Fold / vent field width (mm)' : 'Chassis width (mm)', 'widthMm')}
              {n('Faceplate / ears width (mm)', 'faceWidthMm')}
              {!d.plate && (
                <NumberField
                  label="Rack ear thickness (mm)"
                  value={d.earThicknessMm ?? 2}
                  min={0.1}
                  step={0.1}
                  hint={
                    d.earThicknessMm === null
                      ? 'Unknown: the preview uses an illustrative 2 mm plate. Enter the measured thickness when available.'
                      : 'Example values are configurable. Ears contact the rail face with no gap; thickness extends outwards.'
                  }
                  onChange={(value) => update({ earThicknessMm: value })}
                />
              )}
              {!d.lacing && n('Allocated height (U)', 'heightU')}
              {n(
                d.plate ? 'Physical plate height (mm)' : 'Physical chassis height (mm)',
                'heightMm',
              )}
              {!d.plate && !d.lacing && n('Ear plane → rear fascia (mm)', 'depthMm')}
              {d.lacing && (
                <>
                  <NumberField
                    label="Lacing bar inward reach (mm)"
                    value={d.depthMm - d.lacing.barWidthMm}
                    min={1}
                    step={1}
                    hint="Ear bearing plane to inside face of the crossbar. The crossbar thickness is added beyond this reach."
                    onChange={(v) => update({ depthMm: v + d.lacing!.barWidthMm })}
                  />
                  <NumberField
                    label="Bar profile width (mm)"
                    value={d.lacing.barWidthMm}
                    min={1}
                    onChange={(v) =>
                      update({
                        depthMm: d.depthMm - d.lacing!.barWidthMm + v,
                        lacing: { ...d.lacing!, barWidthMm: v },
                      })
                    }
                  />
                  <NumberField
                    label="Bar profile height (mm)"
                    value={d.lacing.barHeightMm}
                    min={1}
                    onChange={(v) => update({ lacing: { ...d.lacing!, barHeightMm: v } })}
                  />
                </>
              )}
              <Field label="Mounting">
                <select
                  value={d.mounting}
                  disabled={Boolean(d.plate || d.lacing)}
                  onChange={(e) =>
                    update({
                      mounting: e.target.value as DeviceDefinition['mounting'],
                      appearance: ['direct', 'rails', 'bracket'].includes(e.target.value)
                        ? d.appearance
                        : null,
                    })
                  }
                >
                  {['direct', 'rails', 'shelf', 'freestanding', 'bracket', 'side', 'custom'].map(
                    (m) => (
                      <option key={m}>{m}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Solid geometry">
                <select
                  value={d.bodyMode}
                  disabled={Boolean(d.plate)}
                  onChange={(e) =>
                    update({
                      bodyMode: e.target.value as DeviceDefinition['bodyMode'],
                      appearance: e.target.value === 'box' ? d.appearance : null,
                    })
                  }
                >
                  <option value="box">Chassis box plus components</option>
                  <option value="parts">Explicit components only · openings</option>
                </select>
              </Field>
              {(d.appearance !== null || initial.appearance !== null) && (
                <Field
                  label="Visual model"
                  hint="Generic appearance follows explicit components and supports face images. Changing to parts-only or another mounting construction selects it automatically."
                >
                  <select
                    value={d.appearance ?? 'generic'}
                    onChange={(e) =>
                      update({
                        appearance:
                          e.target.value === 'generic'
                            ? null
                            : (e.target.value as DeviceDefinition['appearance']),
                      })
                    }
                  >
                    <option value="generic">Generic equipment / explicit components</option>
                    <option
                      value="user-rack-pc"
                      disabled={
                        d.bodyMode !== 'box' ||
                        d.shelf !== null ||
                        !['direct', 'rails', 'bracket'].includes(d.mounting)
                      }
                    >
                      Photographed rack PC
                    </option>
                    <option
                      value="generic-switch-24"
                      disabled={
                        d.bodyMode !== 'box' ||
                        d.shelf !== null ||
                        !['direct', 'rails', 'bracket'].includes(d.mounting)
                      }
                    >
                      Generic silver network switch
                    </option>
                  </select>
                </Field>
              )}
              <Field label="Specification status">
                <select
                  value={d.evidence}
                  onChange={(e) =>
                    update({ evidence: e.target.value as DeviceDefinition['evidence'] })
                  }
                >
                  {['example', 'user-entered', 'verified', 'unknown'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Colour">
                <input
                  type="color"
                  value={d.color}
                  onChange={(e) => update({ color: e.target.value })}
                />
              </Field>
            </div>
            {d.plate && (
              <section className="shape-row">
                <h3>Folded blanking plate</h3>
                <p className="muted">
                  Integrated ears contact the rail face. Top and bottom folds project into the rack;
                  ventilation and mounting holes cut through the sheet. Generic sheet, slot and
                  perforation dimensions remain provisional until measured. Converting equipment
                  into a plate replaces its ports and compound parts with this sheet geometry.
                </p>
                <div className="form-grid">
                  {(
                    [
                      ['Sheet thickness (mm)', 'thicknessMm'],
                      ['Fold return depth (mm)', 'returnDepthMm'],
                      ['Perforation edge margin (mm)', 'edgeMarginMm'],
                      ['Round hole diameter (mm)', 'holeDiameterMm'],
                      ['Round hole pitch (mm)', 'holePitchMm'],
                      ['Mounting column centres (mm)', 'mountingCentersMm'],
                      ['Mounting slot width (mm)', 'slotWidthMm'],
                      ['Mounting slot height (mm)', 'slotHeightMm'],
                    ] as const
                  ).map(([label, key]) => (
                    <NumberField
                      key={key}
                      label={label}
                      value={d.plate![key]}
                      min={key === 'returnDepthMm' || key === 'edgeMarginMm' ? 0 : 0.1}
                      step={0.1}
                      onChange={(value) =>
                        update({
                          plate: { ...d.plate!, [key]: value },
                          ...(key === 'returnDepthMm' ? { depthMm: value } : {}),
                          ...(key === 'thicknessMm' ? { earThicknessMm: value } : {}),
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            )}
            <Field label="Specification source / verification notes">
              <textarea value={d.source} onChange={(e) => update({ source: e.target.value })} />
            </Field>
            {d.mounting === 'shelf' && (
              <section className="shape-row">
                <h3>Configurable rack shelf</h3>
                <p className="muted">
                  Generic shelf dimensions and generated floor/walls are provisional examples until
                  calibrated. Overall depth comes from this shelf definition, independently of rack
                  depth. Usable width and depth remain independent when the overall dimensions
                  change. Place the shelf on either rack face in the placement dialog.
                </p>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={Boolean(d.shelf)}
                    onChange={(e) => {
                      if (supportDraft) {
                        set({
                          error:
                            'Add or cancel the pending shelf support before changing shelf generation.',
                        });
                        return;
                      }
                      if (e.target.checked) {
                        update({
                          shelf: makeShelfConfiguration(d),
                          bodyMode: 'parts',
                          evidence: 'example',
                        });
                      } else {
                        const retained = definitionParts(d);
                        update({
                          shelf: null,
                          bodyMode: 'parts',
                          parts: retained.map((part) => ({ ...part, id: uid('part') })),
                        });
                      }
                    }}
                  />
                  Generate shelf floor and side walls from dimensions
                </label>
                {d.shelf && (
                  <>
                    <p className="muted">
                      Enabling generation uses labelled example thicknesses. Existing compound
                      components are retained; check for duplicate floor or wall components when
                      converting an older definition. Disabling generation preserves the current
                      floor, walls and active supports as explicit compound components. Changing
                      allocated U height updates this generic shelf's physical height and screw
                      pattern.
                    </p>
                    <div className="form-grid">
                      {shelfNumber('Shelf usable width (mm)', 'usableWidthMm')}
                      {shelfNumber('Shelf usable depth (mm)', 'usableDepthMm')}
                      {shelfNumber('Shelf floor thickness (mm)', 'floorThicknessMm')}
                      {shelfNumber('Shelf side wall thickness (mm)', 'wallThicknessMm')}
                      <Field label="Shelf mounting arrangement">
                        <select
                          value={d.shelf.supportMode}
                          onChange={(e) =>
                            update({
                              shelf: {
                                ...d.shelf!,
                                supportMode: e.target.value as ShelfConfiguration['supportMode'],
                              },
                            })
                          }
                        >
                          <option value="front-only">
                            Mounting ears only · selected rack face
                          </option>
                          <option value="additional-supports">Ears plus additional supports</option>
                        </select>
                      </Field>
                    </div>
                    <p className="muted">
                      Supports use shelf-local coordinates: x from centre, y from chassis bottom, z
                      inward from the mounting-ear plane. Rear placement mirrors the assembly.
                      Support dimensions describe geometry; they do not establish a load rating or
                      verify attachment hardware. Stored supports are used only when the arrangement
                      includes additional supports.
                    </p>
                    <ShelfSupports
                      supports={d.shelf.supports}
                      draft={supportDraft}
                      setDraft={setSupportDraft}
                      onChange={(supports) => update({ shelf: { ...d.shelf!, supports } })}
                      onError={(error) => set({ error })}
                    />
                  </>
                )}
              </section>
            )}
            {d.mounting === 'rails' && (
              <div className="form-grid">
                <NumberField
                  label="Minimum rail spacing (mm)"
                  value={d.railMinMm ?? 0}
                  onChange={(v) => update({ railMinMm: v })}
                />
                <NumberField
                  label="Maximum rail spacing (mm)"
                  value={d.railMaxMm ?? 0}
                  onChange={(v) => update({ railMaxMm: v })}
                />
              </div>
            )}
            <Field label="Screw hole heights from allocated U bottom (mm)">
              <input
                value={d.screwOffsetsMm.join(', ')}
                onChange={(e) => {
                  const values = e.target.value.split(',').map(Number);
                  if (values.every((v) => Number.isFinite(v) && v >= 0))
                    update({ screwOffsetsMm: values });
                }}
              />
            </Field>
            {!d.plate && (
              <div className="form-grid">
                {(['frontImage', 'rearImage'] as const).map((face) => (
                  <Field
                    key={face}
                    label={`${face === 'frontImage' ? 'Front' : 'Rear'} image · embedded in project`}
                    hint="Images are fitted to the face; calibration and perspective correction are pending."
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void image(e.target.files?.[0], face)}
                    />
                    {d[face] && (
                      <>
                        <img className="image-preview" src={d[face]} alt={face} />
                        <Button onClick={() => update({ [face]: null })}>Remove image</Button>
                      </>
                    )}
                  </Field>
                ))}
              </div>
            )}
          </>
        )}
        {tab === 'power' && <DefinitionPowerFields definition={d} update={update} />}
        {tab === 'ports' && (
          <>
            <p className="muted">
              Local coordinates: x from centre; y from chassis bottom; z from the front mounting
              plane, increasing rearwards. Rear-installed devices mirror x and z.
            </p>
            <Button icon="plus" onClick={addPort}>
              Add port
            </Button>
            <div className="port-editor">
              {d.ports.map((p, i) => (
                <div className="port-edit-row" key={p.id}>
                  <Field label="Name">
                    <input
                      value={p.name}
                      onChange={(e) => portChange(i, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Connector">
                    <select
                      value={p.connector}
                      onChange={(e) => portChange(i, { connector: e.target.value })}
                    >
                      {[
                        ...new Set([
                          'RJ45',
                          'SFP',
                          'LC',
                          'SC',
                          'HDMI',
                          'DisplayPort',
                          'VGA',
                          'PS/2',
                          '3.5mm',
                          'Video-unconfirmed',
                          'USB-A',
                          'USB-C',
                          'Serial',
                          'Audio',
                          'DC',
                          'IEC-C13',
                          'IEC-C14',
                          'Coax',
                          'SDI',
                          'Custom',
                          p.connector,
                        ]),
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Surface">
                    <select
                      value={p.surface}
                      onChange={(e) =>
                        portChange(i, {
                          surface: e.target.value as Port['surface'],
                          direction:
                            e.target.value === 'front'
                              ? [0, 0, -1]
                              : e.target.value === 'rear'
                                ? [0, 0, 1]
                                : e.target.value === 'left'
                                  ? [-1, 0, 0]
                                  : [1, 0, 0],
                        })
                      }
                    >
                      {['front', 'rear', 'left', 'right', 'custom'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  {(['x', 'y', 'z'] as const).map((axis, a) => (
                    <NumberField
                      key={axis}
                      label={`${axis} (mm)`}
                      value={p.position[a]}
                      min={-10000}
                      step={0.1}
                      onChange={(v) => {
                        const position = [...p.position] as Port['position'];
                        position[a] = v;
                        portChange(i, { position });
                      }}
                    />
                  ))}
                  <Field label="Port evidence">
                    <select
                      value={p.evidence ?? 'inherit'}
                      onChange={(e) =>
                        portChange(i, {
                          evidence:
                            e.target.value === 'inherit'
                              ? undefined
                              : (e.target.value as Port['evidence']),
                        })
                      }
                    >
                      <option value="inherit">Inherit device evidence</option>
                      <option value="example">Photo / example estimate</option>
                      <option value="user-entered">User entered</option>
                      <option value="verified">Verified measurement</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </Field>
                  <ConnectorRotation
                    port={p}
                    onChange={(rotationDeg) => portChange(i, { rotationDeg })}
                  />
                  {(['widthMm', 'heightMm'] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={`Socket ${key === 'widthMm' ? 'width' : 'height'} (mm)`}
                      value={p[key] ?? (key === 'widthMm' ? 11 : 9)}
                      min={0.1}
                      step={0.1}
                      hint={
                        p[key] === undefined
                          ? 'Unknown; illustrative preview size until entered.'
                          : 'Schematic opening size; verify before marking measured.'
                      }
                      onChange={(value) => portChange(i, { [key]: value })}
                    />
                  ))}
                  <Field label="Port source / notes">
                    <input
                      value={p.source ?? ''}
                      onChange={(e) => portChange(i, { source: e.target.value })}
                    />
                  </Field>
                  <button
                    className="icon-button danger"
                    aria-label="Delete port"
                    data-tooltip="Delete port"
                    onClick={() => update({ ports: d.ports.filter((_, j) => j !== i) })}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'shape' && (
          <>
            <p className="muted">
              Add box components with measured offsets. Components contribute to placement and cable
              collision checks. Extrusions and imported 3D assets remain a later milestone.
            </p>
            <Button
              icon="plus"
              onClick={() =>
                update({
                  parts: [
                    ...d.parts,
                    {
                      id: uid('part'),
                      name: 'Custom component',
                      position: [0, d.heightMm, d.depthMm / 2],
                      size: [d.widthMm, 5, d.depthMm],
                    },
                  ],
                })
              }
            >
              Add box component
            </Button>
            {d.parts.map((part, i) => (
              <div className="shape-row" key={part.id}>
                <Field label="Component">
                  <input
                    value={part.name}
                    onChange={(e) =>
                      update({
                        parts: d.parts.map((v, j) =>
                          j === i ? { ...v, name: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </Field>
                <div className="form-grid three">
                  {part.position.map((v, a) => (
                    <NumberField
                      key={`p${a}`}
                      label={`${['x', 'y', 'z'][a]} centre (mm)`}
                      value={v}
                      min={-10000}
                      onChange={(n) =>
                        update({
                          parts: d.parts.map((v, j) =>
                            j === i
                              ? {
                                  ...v,
                                  position: v.position.map((x, k) =>
                                    k === a ? n : x,
                                  ) as Port['position'],
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  ))}
                  {part.size.map((v, a) => (
                    <NumberField
                      key={`s${a}`}
                      label={`${['Width', 'Height', 'Depth'][a]} (mm)`}
                      value={v}
                      min={0.1}
                      onChange={(n) =>
                        update({
                          parts: d.parts.map((v, j) =>
                            j === i
                              ? {
                                  ...v,
                                  size: v.size.map((x, k) => (k === a ? n : x)) as Port['position'],
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  ))}
                </div>
                <Button
                  className="danger"
                  icon="trash"
                  onClick={() => update({ parts: d.parts.filter((_, j) => j !== i) })}
                >
                  Remove component
                </Button>
              </div>
            ))}
          </>
        )}
      </div>
      <footer className="modal-footer">
        <Badge tone="warn">{d.evidence}</Badge>
        <div className="button-row">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            className="primary"
            icon="check"
            onClick={() => {
              if (supportDraft) {
                set({
                  error:
                    'Add or cancel the pending shelf support in Dimensions & mounting before saving.',
                });
                return;
              }
              const shelfIssues = validateShelfDefinition(d);
              if (shelfIssues.length) {
                set({ error: shelfIssues.join(' ') });
                return;
              }
              const powerIssues = powerDefinitionIssues(d);
              if (powerIssues.length) {
                set({ error: powerIssues.join(' ') });
                return;
              }
              const plateIssues = validatePlateDefinition(d);
              if (plateIssues.length) {
                set({ error: plateIssues.join(' ') });
                return;
              }
              if (
                edit('Device definition saved.', (p) => {
                  const index = p.definitions.findIndex((x) => x.id === d.id);
                  if (index < 0) p.definitions.push(d);
                  else p.definitions[index] = d;
                })
              )
                onClose();
            }}
          >
            Save definition
          </Button>
        </div>
      </footer>
    </Modal>
  );
}

type ShelfSupportDraft = { name: string; position: string[]; size: string[] };
function ShelfSupports({
  supports,
  draft,
  setDraft,
  onChange,
  onError,
}: {
  supports: PhysicalBox[];
  draft: ShelfSupportDraft | null;
  setDraft: (draft: ShelfSupportDraft | null) => void;
  onChange: (supports: PhysicalBox[]) => void;
  onError: (message: string) => void;
}) {
  const emptyDraft = () => ({ name: '', position: ['', '', ''], size: ['', '', ''] });
  const updateSupport = (index: number, patch: Partial<PhysicalBox>) =>
    onChange(supports.map((support, i) => (i === index ? { ...support, ...patch } : support)));
  return (
    <div>
      <h4>Additional shelf supports ({supports.length})</h4>
      {supports.map((support, index) => (
        <div className="shape-row" key={support.id}>
          <Field label={`Shelf support ${index + 1} name`}>
            <input
              value={support.name}
              onChange={(e) => updateSupport(index, { name: e.target.value })}
            />
          </Field>
          <div className="form-grid three">
            {(['position', 'size'] as const).flatMap((key) =>
              support[key].map((value, axis) => (
                <NumberField
                  key={`${key}${axis}`}
                  label={`Support ${index + 1} ${key === 'position' ? `${['x', 'y', 'z'][axis]} centre` : ['width', 'height', 'depth'][axis]} (mm)`}
                  value={value}
                  min={key === 'position' ? -10000 : 0.1}
                  step={0.1}
                  onChange={(next) =>
                    updateSupport(index, {
                      [key]: support[key].map((v, i) =>
                        i === axis ? next : v,
                      ) as Port['position'],
                    })
                  }
                />
              )),
            )}
          </div>
          <Button
            icon="trash"
            className="danger"
            onClick={() => onChange(supports.filter((_, i) => i !== index))}
          >
            Remove shelf support {index + 1}
          </Button>
        </div>
      ))}
      {draft === null ? (
        <Button
          icon="plus"
          onClick={() => {
            setDraft(emptyDraft());
          }}
        >
          Add configured shelf support
        </Button>
      ) : (
        <div className="shape-row">
          <p className="muted">
            Enter every position and size for the support. No hardware shape or position is assumed.
          </p>
          <Field label="New shelf support name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <div className="form-grid three">
            {(['position', 'size'] as const).flatMap((key) =>
              draft[key].map((value, axis) => (
                <Field
                  key={`${key}${axis}`}
                  label={`New support ${key === 'position' ? `${['x', 'y', 'z'][axis]} centre` : ['width', 'height', 'depth'][axis]} (mm)`}
                >
                  <input
                    type="number"
                    step="0.1"
                    min={key === 'size' ? 0.1 : undefined}
                    value={value}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [key]: draft[key].map((v, i) => (i === axis ? e.target.value : v)),
                      })
                    }
                  />
                </Field>
              )),
            )}
          </div>
          <div className="button-row">
            <Button onClick={() => setDraft(null)}>Cancel support</Button>
            <Button
              icon="check"
              onClick={() => {
                const position = draft.position.map(Number) as PhysicalBox['position'];
                const size = draft.size.map(Number) as PhysicalBox['size'];
                if (
                  !draft.name.trim() ||
                  [...draft.position, ...draft.size].some((value) => value.trim() === '') ||
                  !position.every(Number.isFinite) ||
                  !size.every((value) => Number.isFinite(value) && value > 0)
                ) {
                  onError(
                    'Enter a support name, all three centre coordinates and three positive dimensions.',
                  );
                  return;
                }
                onChange([
                  ...supports,
                  { id: uid('shelf-support'), name: draft.name.trim(), position, size },
                ]);
                setDraft(null);
              }}
            >
              Add shelf support
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
