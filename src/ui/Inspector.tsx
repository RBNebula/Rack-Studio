import { useState } from 'react';
import { useStore } from '../state';
import type { Accessory, Cable, Device, Project, Rack } from '../model';
import { clone, uid, cableLabel } from '../model';
import { validateRack } from '../engineering/geometry';
import { supportRailAssessment } from '../engineering/support-rails';
import { placementIssues, projectWithPlacement } from '../engineering/placement';
import { analyseProject } from '../engineering/analysis';
import { Button, Field, NumberField, Icon, IconButton, Badge, metres } from './shared';
import { DeviceMini } from './Library';
import { StructuralMembers } from './StructuralMembers';
import { SpatialInspector } from './SpatialInspector';
import { rackById, racks } from '../engineering/space';
import { accessoryPose } from '../engineering/attachments';
import { positionedExternalCable } from '../engineering/external';
import { transformObject } from '../engineering/modelling';
import { guideCableIds, bundlePacking } from '../engineering/wiring';
import { DevicePowerSection } from './PowerPanel';
import { Note, Section } from './Panels';

export default function Inspector({ onCollapse }: { onCollapse?: () => void } = {}) {
  const { project, selection, set, activeRackId } = useStore();
  const device =
    selection?.kind === 'device' ? project.devices.find((d) => d.id === selection.id) : null;
  const cable =
    selection?.kind === 'cable' ? project.cables.find((c) => c.id === selection.id) : null;
  const accessory =
    selection?.kind === 'accessory' ? project.accessories.find((c) => c.id === selection.id) : null;
  return (
    <aside className="inspector">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PROPERTIES</span>
          <h2>
            {device
              ? 'Equipment'
              : cable
                ? 'Cable connection'
                : accessory
                  ? 'Accessory'
                  : selection?.kind === 'destination'
                    ? 'Vehicle endpoint'
                    : selection?.kind === 'exit'
                      ? 'Rack exit'
                      : selection?.kind === 'guide'
                        ? 'Wiring guide'
                        : selection?.kind === 'member'
                          ? 'Shared member'
                          : 'Rack configuration'}
          </h2>
        </div>
        <div className="panel-actions">
          {selection && (
            <IconButton
              icon="x"
              size={18}
              label="Select rack"
              tooltip="Close · show rack properties"
              onClick={() => set({ selection: null })}
            />
          )}
          {onCollapse && (
            <IconButton icon="panel-right" label="Collapse properties panel" onClick={onCollapse} />
          )}
        </div>
      </div>
      {device ? (
        <DeviceInspector key={`${device.id}-${project.revision}`} device={device} />
      ) : cable ? (
        <CableInspector key={cable.id} cable={cable} />
      ) : accessory ? (
        <AccessoryInspector key={accessory.id} accessory={accessory} />
      ) : selection && ['destination', 'exit', 'guide', 'member'].includes(selection.kind) ? (
        <SpatialInspector />
      ) : (
        <RackInspector
          key={`${project.id}-${project.revision}-${selection?.kind === 'rack' ? selection.id : (activeRackId ?? '')}`}
        />
      )}
    </aside>
  );
}
export function RackInspector({ full = false }: { full?: boolean }) {
  const { project, edit, set } = useStore();
  const rack = rackById(
    project,
    useStore.getState().selection?.kind === 'rack'
      ? useStore.getState().selection!.id
      : (useStore.getState().activeRackId ?? undefined),
  );
  const [r, setR] = useState(clone(rack));
  const [memberDraftPending, setMemberDraftPending] = useState(false);
  const update = (patch: Partial<Rack>) => setR({ ...r, ...patch });
  const errors = validateRack(r);
  function apply() {
    if (memberDraftPending) {
      set({
        error: 'Add the new structural member to the rack draft, or cancel it, before applying.',
      });
      return;
    }
    if (errors.length) {
      set({ error: errors.join('\n') });
      return;
    }
    edit('Rack configuration updated.', (p) => {
      if (p.rack.id === r.id) p.rack = r;
      else p.additionalRacks![p.additionalRacks!.findIndex((v) => v.id === r.id)] = r;
    });
  }
  function split() {
    const last = r.sections.at(-1)!;
    if (last.startU === last.endU) {
      set({ error: 'The last depth section must contain at least two U before splitting.' });
      return;
    }
    const start = Math.floor((last.startU + last.endU) / 2) + 1;
    update({
      sections: [
        ...r.sections.slice(0, -1),
        { ...last, endU: start - 1 },
        { ...last, id: uid('section'), startU: start },
      ],
    });
  }
  return (
    <div className={`inspector-content ${full ? 'full-settings' : ''}`}>
      <div className="rack-summary">
        <div className="rack-outline">
          <Icon name="cube" size={28} />
        </div>
        <div>
          <strong>{r.name}</strong>
          <p>
            {r.heightU}U · {r.outerWidthMm} mm wide
          </p>
        </div>
        <Badge tone={r.evidence === 'verified' ? 'good' : 'warn'}>{r.evidence}</Badge>
      </div>
      <Section id="rack.identity" title="Identity">
        <Field label="Rack name">
          <input value={r.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Rack colour">
          <input type="color" value={r.color} onChange={(e) => update({ color: e.target.value })} />
        </Field>
      </Section>
      <Section id="rack.dimensions" title="Dimensions" badge="mm">
        <div className="form-grid">
          <NumberField
            label="Height (U)"
            value={r.heightU}
            min={1}
            max={60}
            onChange={(v) => {
              const sections = r.sections
                .filter((s) => s.startU <= v)
                .map((s, i, arr) => ({
                  ...s,
                  endU: i === arr.length - 1 ? v : Math.min(s.endU, v),
                }));
              update({ heightU: v, sections });
            }}
          />
          <NumberField
            label="Exterior width (mm)"
            value={r.outerWidthMm}
            min={100}
            onChange={(v) => update({ outerWidthMm: v })}
          />
          <NumberField
            label="Clear opening (mm)"
            value={r.clearWidthMm}
            min={100}
            onChange={(v) => update({ clearWidthMm: v })}
          />
          <NumberField
            label="Rail centres (mm)"
            value={r.railCentersMm}
            min={100}
            step={0.1}
            onChange={(v) => update({ railCentersMm: v })}
          />
          <NumberField
            label="Front inset (mm)"
            value={r.frontInsetMm}
            onChange={(v) => update({ frontInsetMm: v })}
          />
          <NumberField
            label="Frame section (mm)"
            value={r.frameMm}
            min={5}
            onChange={(v) => update({ frameMm: v })}
          />
          <OptionalRailDimension
            label="Rail face width (mm)"
            value={r.railWidthMm}
            onChange={(v) => update({ railWidthMm: v })}
          />
          <OptionalRailDimension
            label="Rail thickness (mm)"
            value={r.railThicknessMm}
            onChange={(v) => update({ railThicknessMm: v })}
          />
        </div>
        <Note
          tone="warn"
          summary="Empty rail dimensions are Unknown and use a provisional preview."
        >
          Rail profile dimensions are independent of the frame. Empty rail dimensions are unknown
          and use a provisional preview profile.
        </Note>
      </Section>
      <Section id="rack.construction" title="Construction">
        <Field label="Frame construction">
          <select
            value={r.frameStyle}
            onChange={(e) => update({ frameStyle: e.target.value as Rack['frameStyle'] })}
          >
            <option value="generic">Generic provisional frame</option>
            <option value="explicit">Explicit structural members</option>
          </select>
        </Field>
        <Note
          tone={r.frameStyle === 'generic' ? 'warn' : 'info'}
          summary={
            r.frameStyle === 'generic'
              ? 'Generic framing is an illustrative construction.'
              : 'Only the members you define below, plus the mounting rails.'
          }
        >
          Generic framing is an illustrative construction. Explicit members use only the beams and
          crossmembers you define below, alongside the mounting rails.
        </Note>
        <div className="section-title">
          <h3>Top and base plates</h3>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={r.endPanels?.top ?? false}
            onChange={(e) =>
              update({
                endPanels: {
                  top: e.target.checked,
                  base: r.endPanels?.base ?? false,
                  thicknessMm: r.endPanels?.thicknessMm ?? 2,
                },
              })
            }
          />
          Include top plate
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={r.endPanels?.base ?? false}
            onChange={(e) =>
              update({
                endPanels: {
                  top: r.endPanels?.top ?? false,
                  base: e.target.checked,
                  thicknessMm: r.endPanels?.thicknessMm ?? 2,
                },
              })
            }
          />
          Include base plate
        </label>
        {(r.endPanels?.top || r.endPanels?.base) && (
          <NumberField
            label="End plate thickness (mm)"
            value={r.endPanels.thicknessMm}
            min={0.1}
            step={0.1}
            hint="The initial 2 mm is a provisional example. Enter a measured thickness when available."
            onChange={(v) => update({ endPanels: { ...r.endPanels!, thicknessMm: v } })}
          />
        )}
        <Note tone="warn" summary="Plate profile and thickness are provisional until calibrated.">
          These optional plates cover only the outer top and base, outside the allocated U space.
          Their profile and thickness are provisional until calibrated. No plates are inferred at
          depth transitions. Open frame with optional top and base plates. Surveyed enclosure panels
          and openings are a later milestone.
        </Note>
      </Section>
      <Section id="rack.depth" title="Mounting & depth" badge={`${r.sections.length} sections`}>
        <Field label="Depth measurement meaning">
          <select
            value={r.depthMeaning}
            onChange={(e) => update({ depthMeaning: e.target.value as Rack['depthMeaning'] })}
          >
            {[
              ['unconfirmed', 'Unconfirmed'],
              ['external', 'External frame depth'],
              ['usable', 'Usable internal depth'],
              ['rail-spacing', 'Mounting rail spacing'],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fixed face at depth transition">
          <select
            value={r.fixedFace}
            onChange={(e) => update({ fixedFace: e.target.value as Rack['fixedFace'] })}
          >
            <option value="unconfirmed">Unconfirmed · example uses front origin</option>
            <option value="front">Front mounting face</option>
            <option value="rear">Rear mounting face</option>
          </select>
        </Field>
        <Field
          label="Mounting hole type"
          hint="Square holes with cage nuts are the confirmed default; alternative types are configurable."
        >
          <select
            aria-label="Mounting hole type"
            value={r.holeType}
            onChange={(e) => update({ holeType: e.target.value as Rack['holeType'] })}
          >
            <option value="unconfirmed">Unconfirmed</option>
            <option value="square">Square</option>
            <option value="round">Round</option>
            <option value="threaded">Threaded</option>
          </select>
        </Field>
        <div className="section-title">
          <h3>Depth sections</h3>
          <Badge>{r.sections.length} sections</Badge>
        </div>
        <Note summary="U1 is at the bottom; section boundaries are inclusive.">
          U1 starts at the bottom. Boundaries are inclusive. Exterior depth and rail position are
          stored separately.
        </Note>
        {r.sections.map((s, i) => (
          <div className="depth-section" key={s.id}>
            <div className="section-title">
              <strong>Section {i + 1}</strong>
              <span>
                U{s.startU}–U{s.endU}
              </span>
            </div>
            <div className="form-grid">
              <NumberField
                label="First U"
                value={s.startU}
                min={1}
                max={r.heightU}
                onChange={(v) =>
                  update({
                    sections: r.sections.map((x, j) => (j === i ? { ...x, startU: v } : x)),
                  })
                }
              />
              <NumberField
                label="Last U"
                value={s.endU}
                min={1}
                max={r.heightU}
                onChange={(v) =>
                  update({ sections: r.sections.map((x, j) => (j === i ? { ...x, endU: v } : x)) })
                }
              />
              <NumberField
                label="Illustrative exterior (mm)"
                value={s.overallDepthMm}
                min={100}
                onChange={(v) =>
                  update({
                    sections: r.sections.map((x, j) => (j === i ? { ...x, overallDepthMm: v } : x)),
                  })
                }
              />
              <NumberField
                label="Front screw-plane Z (mm)"
                value={s.frontRailZMm}
                min={-100000}
                onChange={(v) =>
                  update({
                    sections: r.sections.map((x, j) =>
                      j === i
                        ? { ...x, frontRailZMm: v, rearRailZMm: x.rearRailZMm + v - x.frontRailZMm }
                        : x,
                    ),
                  })
                }
              />
              <NumberField
                label="Screw-plane depth (mm)"
                value={s.rearRailZMm - s.frontRailZMm}
                min={1}
                hint="Front-to-rear mounting-rail spacing. Editing the exterior depth leaves this spacing unchanged."
                onChange={(v) =>
                  update({
                    sections: r.sections.map((x, j) =>
                      j === i ? { ...x, rearRailZMm: x.frontRailZMm + v } : x,
                    ),
                  })
                }
              />
            </div>
            {i > 0 && (
              <Button
                icon="trash"
                className="subtle danger"
                onClick={() =>
                  update({
                    sections: r.sections
                      .filter((_, j) => j !== i)
                      .map((x, j) => (j === i - 1 ? { ...x, endU: s.endU } : x)),
                  })
                }
              >
                Merge into previous
              </Button>
            )}
          </div>
        ))}
        <Button icon="plus" className="full-width" onClick={split}>
          Add depth section
        </Button>
      </Section>
      <Section id="rack.members" title="Structural members" badge={`${r.members.length} defined`}>
        <StructuralMembers
          members={r.members}
          onChange={(members) => update({ members })}
          onDraftPendingChange={setMemberDraftPending}
          embedded
        />
      </Section>
      <div className="inspector-apply">
        {errors.length > 0 && (
          <div className="callout error">
            <Icon name="alert" />
            <span>{errors.join(' ')}</span>
          </div>
        )}
        <Note tone="warn" summary="Millimetres · frame transitions are illustrative.">
          All model dimensions are millimetres. Frame transitions are illustrative until
          construction and supporting metalwork are confirmed.
        </Note>
        <Button className="primary full-width" icon="check" onClick={apply}>
          Apply rack configuration
        </Button>
      </div>
    </div>
  );
}
function OptionalRailDimension({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(value === null ? '' : String(value));
  }
  return (
    <Field label={label} hint={value === null ? 'Unknown / provisional preview' : undefined}>
      <input
        type="number"
        min={0.1}
        step={0.1}
        value={draft}
        placeholder="Unknown"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!draft.trim()) onChange(null);
          else if (Number.isFinite(Number(draft)) && Number(draft) > 0) onChange(Number(draft));
          else setDraft(value === null ? '' : String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </Field>
  );
}
/** Read-only summary of the definition's fixed support rails at this placement. */
function FixedSupportRails({ project, device }: { project: Project; device: Device }) {
  const rail = project.definitions.find((x) => x.id === device.definitionId)?.supportRails;
  const assessment = supportRailAssessment(project, device);
  if (!rail || !assessment) return null;
  const range = (value: number | null) => (value === null ? 'unknown' : `${value} mm`);
  return (
    <div className="support-rails" data-testid="fixed-support-rails">
      <p className="inspector-readout">
        Fixed L-section support rails (non-sliding), one per side, screwed to the front and rear
        posts. Leg {rail.legHeightMm} mm, flange {rail.flangeWidthMm} mm, thickness{' '}
        {rail.thicknessMm} mm. Span range {range(rail.spanMinMm)} to {range(rail.spanMaxMm)}; rack
        spacing{' '}
        {assessment.spacingMm === null
          ? 'unknown'
          : `${Math.round(assessment.spacingMm * 10) / 10} mm`}{' '}
        ({assessment.span}). Load rating{' '}
        {rail.loadRatingKg === null ? 'unknown' : `${rail.loadRatingKg} kg`} ({assessment.load}
        {assessment.loadFraction === null
          ? ''
          : `, ${Math.round(assessment.loadFraction * 1000) / 10} %`}
        ). Chassis bears on the flange at Y {Math.round(assessment.bearingTopMm * 100) / 100} mm.
      </p>
      {assessment.advisories.map((advisory) => (
        <Note key={advisory} tone="warn" summary={advisory} />
      ))}
    </div>
  );
}

function DeviceInspector({ device: d }: { device: Device }) {
  const { project, edit, set } = useStore();
  const [startU, setU] = useState(d.startU);
  const [face, setFace] = useState(d.face);
  const [supportId, setSupport] = useState(d.supportId);
  const [name, setName] = useState(d.name);
  const [rackId, setRackId] = useState(d.rackId ?? project.rack.id);
  const def = project.definitions.find((x) => x.id === d.definitionId)!;
  const candidate = {
    ...d,
    startU,
    face,
    supportId,
    name,
    rackId: rackId === project.rack.id ? undefined : rackId,
  };
  const draft = projectWithPlacement(project, candidate);
  const issues = placementIssues(project, candidate);
  const pending =
    startU !== d.startU ||
    face !== d.face ||
    supportId !== d.supportId ||
    name !== d.name ||
    rackId !== (d.rackId ?? project.rack.id);
  const linkedPorts = def.ports.filter((port) =>
    project.cables.some((c) =>
      [c.source, c.destination].some(
        (e) => e.kind === 'device' && e.deviceId === d.id && e.portId === port.id,
      ),
    ),
  ).length;
  return (
    <div className="inspector-content">
      <DeviceMini definition={def} />
      <div className="inspector-title">
        <h3>{def.name}</h3>
        <Badge tone="warn">{def.evidence} specification</Badge>
      </div>
      <p className="inspector-meta">
        {def.widthMm} × {def.heightMm} × {def.depthMm} mm
        <br />
        {def.mounting} mounting · {def.ports.length} defined ports
      </p>
      {def.lacing && (
        <Note
          summary={`Lacing bar · ${def.depthMm - def.lacing.barWidthMm} mm clear inward reach.`}
        >
          Lacing bar · one middle-hole screw per side · {def.depthMm - def.lacing.barWidthMm} mm
          clear inward reach. Edit its library definition to change reach or profile. In Wiring,
          place waypoints on its surfaces or Shift-click two points for a crossbar line guide.
          Surface guides stay in world space when the bar moves.
        </Note>
      )}
      <Section id="device.identity" title="Identity">
        <Field label="Instance name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <p className="field-hint">
          Name, rack and position changes take effect with Apply position.
        </p>
      </Section>
      <Section
        id="device.position"
        title="Position & mounting"
        badge={pending ? <Badge tone="warn">Unapplied</Badge> : `U${d.startU} · ${d.face}`}
      >
        <Field label="Rack">
          <select value={rackId} onChange={(e) => setRackId(e.target.value)}>
            {racks(project).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <NumberField
            label="Start U"
            value={startU}
            min={1}
            max={rackById(project, rackId).heightU}
            onChange={setU}
          />
          <Field label="Mounting face">
            <select value={face} onChange={(e) => setFace(e.target.value as Device['face'])}>
              <option value="front">Front</option>
              <option value="rear">Rear</option>
            </select>
          </Field>
        </div>
        {def.mounting === 'freestanding' && (
          <Field label="Supporting shelf">
            <select
              value={supportId ?? ''}
              onChange={(e) => {
                const support = project.devices.find((v) => v.id === e.target.value);
                setSupport(support?.id ?? null);
                if (support) {
                  setU(support.startU);
                  setFace(support.face);
                }
              }}
            >
              <option value="">Select a shelf</option>
              {project.devices
                .filter(
                  (v) =>
                    project.definitions.find((x) => x.id === v.definitionId)?.mounting === 'shelf',
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · U{v.startU}
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
        <Button
          icon="check"
          className="primary full-width"
          onClick={() => {
            if (issues.length) {
              set({ error: issues.join('\n') });
              return;
            }
            edit('Equipment repositioned; connected cable routes recalculated.', (p) => {
              p.devices = draft.devices;
            });
          }}
        >
          Apply position
        </Button>
      </Section>
      <Section
        id="device.rails"
        title="Rails"
        badge={def.supportRails ? 'Fixed support' : d.rails ? 'Fitted' : 'None'}
      >
        {def.supportRails && <FixedSupportRails project={project} device={d} />}
        <label className="check-field">
          <input
            type="checkbox"
            aria-label="Fit sliding rack rails"
            checked={Boolean(d.rails)}
            disabled={Boolean(
              def.plate ||
              def.shelf ||
              def.supportRails ||
              def.bodyMode !== 'box' ||
              !['direct', 'rails', 'bracket'].includes(def.mounting),
            )}
            onChange={(e) =>
              edit('Device rail configuration updated.', (p) => {
                const device = p.devices.find((v) => v.id === d.id)!;
                if (e.target.checked)
                  device.rails = {
                    memberLengthMm: 520,
                    profileWidthMm: 8,
                    profileHeightMm: Math.min(28, def.heightMm),
                    chassisLeadMm: 100,
                    extensionMm: 0,
                    evidence: 'example',
                  };
                else delete device.rails;
              })
            }
          />
          Fit sliding rack rails
        </label>
        {d.rails && (
          <>
            <Note
              tone="warn"
              summary="Rail dimensions are photo estimates; fit and load rating unverified."
            >
              Rack span follows the front/rear posts without min/max limits. Profile dimensions and
              520 mm sliding members are photo estimates. Chassis lead is approximately 100 mm. Rail
              fit/load rating is unverified.
            </Note>
            <label className="check-field">
              <input
                type="checkbox"
                aria-label="Pull device forward on rails"
                checked={d.rails.extensionMm > 0}
                onChange={(e) =>
                  edit('Rail service position updated; cable routes recalculated.', (p) => {
                    p.devices.find((v) => v.id === d.id)!.rails!.extensionMm = e.target.checked
                      ? 500 + d.rails!.chassisLeadMm
                      : 0;
                  })
                }
              />
              Pull device forward on rails
            </label>
            <p className="inspector-readout">
              Chassis protrusion: {d.rails.extensionMm} mm. Rail projection:{' '}
              {Math.max(0, d.rails.extensionMm - d.rails.chassisLeadMm)} mm.
            </p>
            <NumberField
              label="Rail centre above chassis bottom (mm)"
              value={d.rails.mountHeightMm ?? def.heightMm / 2}
              min={0}
              step={0.5}
              onChange={(value) =>
                edit('Rail mounting height updated.', (p) => {
                  p.devices.find((v) => v.id === d.id)!.rails!.mountHeightMm = value;
                })
              }
            />
            <div className="form-grid">
              {(
                [
                  ['Chassis pull-out (mm)', 'extensionMm'],
                  ['Chassis lead ahead of rail (mm)', 'chassisLeadMm'],
                  ['Sliding member length (mm)', 'memberLengthMm'],
                  ['Rail pack width per side (mm)', 'profileWidthMm'],
                  ['Rail profile height (mm)', 'profileHeightMm'],
                ] as const
              ).map(([label, key]) => (
                <NumberField
                  key={key}
                  label={label}
                  value={d.rails![key]}
                  min={key === 'extensionMm' || key === 'chassisLeadMm' ? 0 : 1}
                  step={1}
                  onChange={(value) =>
                    edit('Rail geometry updated; cable routes recalculated.', (p) => {
                      const rail = p.devices.find((v) => v.id === d.id)!.rails!;
                      rail[key] = value;
                      rail.evidence = 'user-entered';
                    })
                  }
                />
              ))}
            </div>
            <Note summary="Geometric service-position preview; supplied lengths stay fixed.">
              Connected ports move with the chassis. Routes and required lengths recalculate in this
              pose; supplied cable lengths stay fixed. This is a geometric service-position preview,
              without cable tension or snagging physics.
            </Note>
          </>
        )}
      </Section>
      <Section id="device.power" title="Power & weight">
        <DevicePowerSection device={d} embedded />
      </Section>
      <Section id="device.ports" title="Ports" badge={`${linkedPorts}/${def.ports.length} linked`}>
        <div className="port-list">
          {def.ports.map((port) => (
            <div key={port.id}>
              <span className="port-dot" />
              <span>
                {port.name}
                <small>
                  {port.connector} · {port.surface}
                </small>
              </span>
              <Badge>
                {project.cables.some((c) =>
                  [c.source, c.destination].some(
                    (e) => e.kind === 'device' && e.deviceId === d.id && e.portId === port.id,
                  ),
                )
                  ? 'Linked'
                  : 'Free'}
              </Badge>
            </div>
          ))}
        </div>
      </Section>
      <div className="inspector-danger">
        <Button
          className="danger full-width"
          icon="trash"
          onClick={() => {
            const linked = project.cables.filter((c) =>
              [c.source, c.destination].some((e) => e.kind === 'device' && e.deviceId === d.id),
            );
            if (linked.length) {
              set({
                error: `Remove the ${linked.length} connected cable(s) before deleting this equipment. Connectivity will not be discarded automatically.`,
              });
              return;
            }
            if (project.devices.some((x) => x.supportId === d.id)) {
              set({ error: 'Move or remove the equipment supported by this shelf first.' });
              return;
            }
            if (
              edit('Equipment removed.', (p) => {
                p.devices = p.devices.filter((x) => x.id !== d.id);
              })
            )
              set({ selection: null });
          }}
        >
          Remove equipment
        </Button>
      </div>
    </div>
  );
}
export function CableInspector({ cable: c }: { cable: Cable }) {
  const { project, edit, set } = useStore();
  const a = analyseProject(project).cables.find((x) => x.cable.id === c.id)!;
  const update = (patch: Partial<Cable>) =>
    edit('Cable updated.', (p) => {
      Object.assign(
        p.cables.find((x) => x.id === c.id)!,
        patch,
      );
    });
  const external = [c.source, c.destination].some((e) => e.kind === 'external');
  const positioned = positionedExternalCable(project, c);
  const problems = [...a.route.issues, ...a.length.warnings];
  return (
    <div className="inspector-content">
      <div className="cable-heading">
        <span style={{ background: c.color }} />
        <h3>{cableLabel(c)}</h3>
        <Badge
          tone={
            a.status === 'Insufficient length' || a.status === 'Route invalid' ? 'error' : 'warn'
          }
        >
          {a.status}
        </Badge>
      </div>
      <p className="connection-label">
        {a.source}
        <Icon name="chevron" />
        {a.destination}
      </p>
      {problems.length > 0 && (
        <div className="callout">
          <Icon name="alert" />
          <span>{problems.join(' ')}</span>
        </div>
      )}
      <Section id="cable.identity" title="Identity">
        <Field
          label="Cable number"
          hint="Internal identity and route references remain stable when this label changes."
        >
          <input
            key={c.label}
            defaultValue={cableLabel(c)}
            onBlur={(e) => {
              if (!update({ label: e.target.value })) e.target.value = cableLabel(c);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </Field>
        <Field label="Cable name">
          <input value={c.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Cable purpose">
          <input value={c.purpose} onChange={(e) => update({ purpose: e.target.value })} />
        </Field>
        <Field label="Installation status">
          <select
            value={c.status}
            onChange={(e) => update({ status: e.target.value as Cable['status'] })}
          >
            {['planned', 'installed', 'tested'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea value={c.notes} onChange={(e) => update({ notes: e.target.value })} />
        </Field>
      </Section>
      <Section
        id="cable.specification"
        title="Specification"
        badge={c.supply === 'bulk' ? 'Bulk / reel' : 'Preterminated'}
      >
        <Field label="Cable type">
          <input value={c.type} onChange={(e) => update({ type: e.target.value })} />
        </Field>
        <div className="form-grid">
          <Field label="Supply type">
            <select
              value={c.supply}
              onChange={(e) => update({ supply: e.target.value as Cable['supply'] })}
            >
              <option value="preterminated">Preterminated</option>
              <option value="bulk">Bulk / cut from reel</option>
            </select>
          </Field>
          <Field label="Colour">
            <input
              type="color"
              value={c.color}
              onChange={(e) => update({ color: e.target.value })}
            />
          </Field>
        </div>
        {c.supply === 'preterminated' ? (
          <NumberField
            label="Supplied length (mm)"
            value={c.suppliedLengthMm}
            hint={
              c.suppliedLengthMm === null
                ? 'Unset. Enter the actual supplied cable length.'
                : undefined
            }
            min={1}
            onChange={(v) => update({ suppliedLengthMm: v })}
          />
        ) : (
          <>
            <Field label="Bulk cable product">
              <select value={c.productId} onChange={(e) => update({ productId: e.target.value })}>
                {project.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <NumberField
                label="End A allowance (mm)"
                value={c.terminationAMm}
                onChange={(v) => update({ terminationAMm: v })}
              />
              <NumberField
                label="End B allowance (mm)"
                value={c.terminationBMm}
                onChange={(v) => update({ terminationBMm: v })}
              />
            </div>
            <Field label="Round cut upwards">
              <select
                value={c.roundToMm}
                onChange={(e) => update({ roundToMm: Number(e.target.value) })}
              >
                {[1, 10, 50, 100, 500].map((v) => (
                  <option key={v} value={v}>
                    {v} mm
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <div className="form-grid">
          <NumberField
            label="Cable diameter (mm)"
            value={c.diameterMm}
            min={0.1}
            step={0.1}
            onChange={(v) => update({ diameterMm: v })}
          />
          <NumberField
            label="Clearance (mm)"
            value={c.clearanceMm}
            step={0.1}
            onChange={(v) => update({ clearanceMm: v })}
          />
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={c.minBendRadiusMm !== null}
            onChange={(e) => update({ minBendRadiusMm: e.target.checked ? 30 : null })}
          />
          Minimum bend radius specified
        </label>
        {c.minBendRadiusMm !== null && (
          <NumberField
            label="Minimum bend radius (mm)"
            value={c.minBendRadiusMm}
            min={1}
            hint="Enter the cable manufacturer's specification; the initial 30 mm is an editable example."
            onChange={(v) => update({ minBendRadiusMm: v })}
          />
        )}
      </Section>
      <Section id="cable.length" title="Length breakdown" badge={metres(a.requiredMm)}>
        {external && (
          <>
            <Field label="Rack exit">
              <select
                value={c.exitId ?? ''}
                onChange={(e) => update({ exitId: e.target.value || null })}
              >
                <option value="">Select exit</option>
                {project.exits.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            {positioned ? (
              <Note summary="Vehicle distance is included in the 3D route; the stored manual external distance is ignored." />
            ) : (
              <>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={c.externalLengthMm !== null}
                    onChange={(e) => update({ externalLengthMm: e.target.checked ? 0 : null })}
                  />
                  External distance has been entered
                </label>
                {c.externalLengthMm !== null && (
                  <NumberField
                    label="Manual external distance (mm)"
                    value={c.externalLengthMm}
                    onChange={(v) => update({ externalLengthMm: v })}
                  />
                )}
              </>
            )}
          </>
        )}
        <div className="form-grid">
          <NumberField
            label="Service loop (mm)"
            value={c.serviceMm}
            onChange={(v) => update({ serviceMm: v })}
          />
          <NumberField
            label="Other allowance (mm)"
            value={c.otherMm}
            onChange={(v) => update({ otherMm: v })}
          />
        </div>
        <div className="length-breakdown">
          <dl>
            <dt>{positioned ? 'Modelled route including vehicle' : 'Modelled rack route'}</dt>
            <dd>{metres(a.route.lengthMm)}</dd>
            <dt>External distance · manual</dt>
            <dd>{external ? metres(c.externalLengthMm) : 'Internal'}</dd>
            <dt>Explicit allowances</dt>
            <dd>{metres(a.length.breakdown.totalAllowancesMm)}</dd>
            <dt>Rounding added</dt>
            <dd>{metres(a.length.breakdown.roundingAddedMm)}</dd>
            <dt>Required length</dt>
            <dd>
              <strong>{metres(a.requiredMm)}</strong>
            </dd>
            {a.preterminated && (
              <>
                <dt>Supplied assembly</dt>
                <dd>{metres(c.suppliedLengthMm)}</dd>
                <dt>Available excess</dt>
                <dd>{metres(a.preterminated.availableSlackMm)}</dd>
              </>
            )}
          </dl>
          <p className="small muted">
            Calculated from this model. Unverified dimensions remain unverified. Excess cable needs
            a physical storage plan.
          </p>
        </div>
      </Section>
      <Section
        id="cable.route"
        title="Route"
        badge={`${c.waypoints.length} waypoints · ${c.guideLinks?.length ?? 0} guides`}
      >
        <Button
          icon="cable"
          className="full-width"
          onClick={() =>
            set({
              workspace: 'designer',
              wiringTool: 'link',
              wiringSource: null,
              wiringLineStart: null,
            })
          }
        >
          Edit linked guides ({c.guideLinks?.length ?? 0})
        </Button>
        <div className="section-title">
          <h3>Follow an existing cable run</h3>
        </div>
        <Field label="Reference cable">
          <select
            value={c.followCableId ?? ''}
            onChange={(e) => update({ followCableId: e.target.value || null })}
          >
            <option value="">Independent route</option>
            {project.cables
              .filter((v) => v.id !== c.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {cableLabel(v)} · {v.name}
                </option>
              ))}
          </select>
        </Field>
        {c.followCableId && (
          <>
            <div className="form-grid">
              <NumberField
                label="Join run at (%)"
                value={c.followStartPercent}
                max={99}
                onChange={(v) => update({ followStartPercent: v })}
              />
              <NumberField
                label="Break out at (%)"
                value={c.followEndPercent}
                min={1}
                max={100}
                onChange={(v) => update({ followEndPercent: v })}
              />
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={c.followOffsetMm !== null}
                onChange={(e) =>
                  update({
                    followOffsetMm: e.target.checked ? c.diameterMm + c.clearanceMm : null,
                  })
                }
              />
              Custom parallel offset
            </label>
            {c.followOffsetMm !== null && (
              <NumberField
                label="Centreline offset (mm)"
                value={c.followOffsetMm}
                min={0}
                onChange={(v) => update({ followOffsetMm: v })}
              />
            )}
            <Note summary="Geometric relationship only; it does not add a physical tie or fixing.">
              This cable follows a parallel section of the reference run, with its own endpoint
              breakouts. Clearance and bend constraints are checked again. This does not add a
              physical tie or fixing.
            </Note>
          </>
        )}
        <div className="section-title">
          <h3>Route waypoints</h3>
          <Badge>{c.waypoints.length}</Badge>
        </div>
        <p className="field-hint">World coordinates in mm. These are fixed routing constraints.</p>
        {c.waypoints.map((v, i) => (
          <div className="waypoint-row" key={i}>
            {v.map((n, axis) => (
              <NumberField
                key={axis}
                label={['x', 'y', 'z'][axis]}
                value={n}
                min={-10000}
                onChange={(value) =>
                  update({
                    waypoints: c.waypoints.map((p, j) =>
                      j === i ? (p.map((n, k) => (k === axis ? value : n)) as typeof v) : p,
                    ),
                  })
                }
              />
            ))}
            <IconButton
              icon="x"
              size={14}
              className="danger"
              label="Remove waypoint"
              onClick={() => update({ waypoints: c.waypoints.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <Button
          icon="plus"
          onClick={() =>
            update({ waypoints: [...c.waypoints, [260, (project.rack.heightU * 44.45) / 2, 450]] })
          }
        >
          Add waypoint
        </Button>
      </Section>
      <div className="inspector-danger">
        <Button
          className="danger full-width"
          icon="trash"
          onClick={() => {
            if (project.cables.some((v) => v.followCableId === c.id)) {
              set({
                error:
                  'Other cables follow this run. Set those cables to independent routing before deleting it.',
              });
              return;
            }
            if (
              edit('Cable deleted.', (p) => {
                p.cables = p.cables.filter((x) => x.id !== c.id);
                p.looms = p.looms
                  .map((l) => ({ ...l, cableIds: l.cableIds.filter((id) => id !== c.id) }))
                  .filter((l) => l.cableIds.length >= 2);
                p.accessories = p.accessories.map((v) => ({
                  ...v,
                  cableIds: v.cableIds.filter((id) => id !== c.id),
                }));
              })
            )
              set({ selection: null });
          }}
        >
          Delete cable
        </Button>
      </div>
    </div>
  );
}
function AccessoryInspector({ accessory: a }: { accessory: Accessory }) {
  const { edit, project, set } = useStore();
  const pose = accessoryPose(project, a);
  const update = (patch: Partial<Accessory>) =>
    edit('Accessory updated.', (p) =>
      Object.assign(
        p.accessories.find((x) => x.id === a.id)!,
        patch,
      ),
    );
  return (
    <div className="inspector-content">
      <div className="inspector-title">
        <h3>{a.name}</h3>
        <Badge tone="warn">
          {a.evidence} · {a.kind}
        </Badge>
      </div>
      <Section id="accessory.identity" title="Identity">
        <Field label="Accessory name">
          <input value={a.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
      </Section>
      <Section id="accessory.pose" title="Position & size">
        <Button
          icon="cube"
          className="full-width"
          onClick={() => set({ showModelTools: true, modelTool: 'translate', wiringTool: 'off' })}
        >
          Move / rotate in 3D
        </Button>
        <div className="form-grid three">
          {pose.rotationDeg.map((v, i) => (
            <NumberField
              key={i}
              label={`Rotation ${['X', 'Y', 'Z'][i]} (°)`}
              min={-3600}
              value={v}
              onChange={(n) =>
                edit('Accessory rotated.', (p) =>
                  transformObject(
                    p,
                    { kind: 'accessory', id: a.id },
                    pose.position,
                    pose.rotationDeg.map((v, j) => (i === j ? n : v)) as import('../model').Vec3,
                  ),
                )
              }
            />
          ))}
        </div>
        {a.attachment && (
          <>
            <p className="small muted">
              Attached to {a.attachment.kind} · {a.attachment.id}. Position fields below use parent
              coordinates.
            </p>
            <Button
              onClick={() =>
                update({
                  attachment: undefined,
                  position: pose.position,
                  rotationDeg: pose.rotationDeg,
                })
              }
            >
              Detach from surface
            </Button>
          </>
        )}
        {(a.kind === 'anchor' || a.kind === 'tie') && (
          <NumberField
            label="Fixing clear opening (mm)"
            value={a.openingMm ?? 20}
            min={1}
            onChange={(v) => update({ openingMm: v, size: [v + 4, v + 4, a.size[2]] })}
          />
        )}
        {a.kind === 'tray' && (
          <Button
            onClick={() => {
              const id = uid('guide');
              if (
                edit('Tray route guide created.', (p) =>
                  (p.wiringGuides ??= []).push({
                    id,
                    name: `${a.name} route`,
                    kind: 'line',
                    trayId: a.id,
                    start: pose.position,
                    end: pose.position.map((v, i) =>
                      i === 2 ? v + a.size[2] : v,
                    ) as import('../model').Vec3,
                  }),
                )
              )
                set({ wiringGuideId: id, showModelTools: false, wiringTool: 'link' });
            }}
          >
            Create tray routing guide
          </Button>
        )}
        {(a.kind === 'anchor' || a.kind === 'tie') && (
          <p className="small muted">
            {(() => {
              const ids = [
                ...new Set(
                  project.wiringGuides
                    ?.filter((g) => g.kind === 'point' && g.accessoryId === a.id)
                    .flatMap((g) => guideCableIds(project, g.id)) ?? [],
                ),
              ];
              return `${ids.length} cable(s) · ${bundlePacking(project, ids).diameterMm.toFixed(1)} mm packed envelope / ${a.openingMm ?? 20} mm opening`;
            })()}
          </p>
        )}
        {(a.kind === 'anchor' || a.kind === 'tie'
          ? (['position'] as const)
          : (['position', 'size'] as const)
        ).map((key) => (
          <div key={key}>
            <h3>
              {key === 'position'
                ? a.attachment
                  ? 'Parent coordinates (mm)'
                  : 'World centre (mm)'
                : 'Physical size (mm)'}
            </h3>
            <div className="form-grid three">
              {a[key].map((v, axis) => (
                <NumberField
                  key={axis}
                  label={['x', 'y', 'z'][axis]}
                  value={v}
                  min={key === 'size' ? 0.1 : -10000}
                  onChange={(value) =>
                    update({ [key]: a[key].map((n, k) => (axis === k ? value : n)) })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </Section>
      <Note tone="warn" summary="Generic clip/tie wall thickness is provisional.">
        Tray and fixing walls participate in clearance checks using oriented wall boxes. Physical
        guides follow attached hardware. Generic clip/tie wall thickness is provisional.
      </Note>
      <div className="inspector-danger">
        <Button
          className="danger full-width"
          icon="trash"
          onClick={() =>
            edit('Accessory removed.', (p) => {
              const ids = new Set(
                p.wiringGuides
                  ?.filter((g) => (g.kind === 'point' ? g.accessoryId === a.id : g.trayId === a.id))
                  .map((g) => g.id),
              );
              if (
                p.cables.some((c) => c.guideLinks?.some((l) => ids.has(l.guideId))) ||
                p.looms.some((l) => l.guideIds?.some((id) => ids.has(id)))
              )
                throw new Error('Unlink the hardware routing guides before deleting it.');
              if (
                p.accessories.some(
                  (v) => v.attachment?.kind === 'accessory' && v.attachment.id === a.id,
                )
              )
                throw new Error('Detach or remove child fixings first.');
              p.wiringGuides = p.wiringGuides?.filter((g) => !ids.has(g.id));
              p.accessories = p.accessories.filter((x) => x.id !== a.id);
            })
          }
        >
          Remove accessory
        </Button>
      </div>
    </div>
  );
}

export function addAccessory(p: Project, kind: Accessory['kind']) {
  p.accessories.push({
    id: uid(kind),
    name: `${kind} ${p.accessories.filter((x) => x.kind === kind).length + 1}`,
    kind,
    position: [260, 300, 400],
    size: kind === 'tray' ? [110, 17, 400] : kind === 'obstruction' ? [100, 100, 100] : [25, 5, 25],
    ...(kind === 'tray' ? { perforated: true } : {}),
    parentId: null,
    cableIds: [],
    evidence: kind === 'tray' ? 'example' : 'user-entered',
  });
}
