import { useState } from 'react';
import type { Device, DeviceDefinition, PowerBank, PowerDraw, PowerOutputLimit } from '../model';
import { uid } from '../model';
import { useStore } from '../state';
import { analyseProject } from '../engineering/analysis';
import {
  EMPTY_POWER_OUTPUT_LIMIT,
  POWER_WARNING_UTILISATION,
  powerDefinitionIssues,
  setDefinitionMass,
  setDefinitionPower,
  setPowerBank,
} from '../engineering/power';
import type { PowerBankResult, PowerOutputLimitResult, PowerStatus } from '../engineering/power';
import { Badge, BlurTextField, Button, Field, NumberField, OptionalNumberField } from './shared';
import { Note } from './Panels';

const evidenceLevels = ['example', 'user-entered', 'verified', 'unknown'] as const;
const statusTone: Record<PowerStatus, 'good' | 'warn' | 'error'> = {
  ok: 'good',
  warning: 'warn',
  over: 'error',
  incomplete: 'warn',
};
const statusText: Record<PowerStatus, string> = {
  ok: 'OK',
  warning: 'Warning',
  over: 'Over limit',
  incomplete: 'Incomplete',
};
const amps = (a: number) => `${a.toFixed(2)} A`;
const watts = (w: number) => `${Math.round(w * 10) / 10} W`;
const percent = (u: number) => `${(u * 100).toFixed(1)} %`;

/** Power and weight of a placed device's equipment model, its feeds and, for a distributor, its banks. */
/** Power and mass fields for one placed device. `embedded` drops the heading inside a titled panel section. */
export function DevicePowerSection({
  device,
  embedded = false,
}: {
  device: Device;
  embedded?: boolean;
}) {
  const { project, edit, set } = useStore();
  const def = project.definitions.find((x) => x.id === device.definitionId);
  if (!def) return null;
  const power = analyseProject(project).power;
  const info = power.devices.find((d) => d.deviceId === device.id);
  const copies = project.devices.filter((d) => d.definitionId === def.id).length;
  const distributor = power.distributors.find((d) => d.deviceId === device.id);
  const banks = distributor?.banks ?? [];
  const feedingBanks = (info?.feeds ?? []).map((feed) => ({
    feed,
    distributor: project.devices.find((d) => d.id === feed.distributorDeviceId),
    bank: power.distributors
      .find((d) => d.deviceId === feed.distributorDeviceId)
      ?.banks.find((b) => b.bankId === feed.bankId),
  }));
  const draw = def.power;
  const setPower = (label: string, patch: Partial<PowerDraw>) => {
    const next: PowerDraw = {
      ...(draw ?? { nominalW: null, maxW: null, evidence: 'user-entered', source: '' }),
      ...patch,
    };
    const issues = powerDefinitionIssues({ ...def, power: next });
    if (issues.length) set({ error: issues.join(' ') });
    else edit(label, (p) => setDefinitionPower(p, def.id, patch));
  };
  return (
    <section className="power-section" aria-label="Power and weight">
      {(!embedded || info?.redundantFeed) && (
        <div className="section-title">
          {!embedded && <h3>Power & weight</h3>}
          {info?.redundantFeed && <Badge tone="good">Redundant feed</Badge>}
        </div>
      )}
      <Note summary="Empty fields are Unknown and never counted as zero.">
        These values belong to the equipment model <strong>{def.name}</strong>, so all {copies}{' '}
        placed {copies === 1 ? 'copy shares' : 'copies share'} them. Leave a field empty when the
        value is unknown; unknown values are never counted as zero.
      </Note>
      <div className="form-grid">
        <OptionalNumberField
          label="Nominal draw (W)"
          value={draw?.nominalW ?? null}
          onChange={(v) => setPower('Equipment nominal power draw updated.', { nominalW: v })}
        />
        <OptionalNumberField
          label="Maximum draw (W)"
          value={draw?.maxW ?? null}
          onChange={(v) => setPower('Equipment maximum power draw updated.', { maxW: v })}
        />
        <OptionalNumberField
          label="Mass (kg)"
          value={def.massKg}
          step={0.1}
          hint={`Uses the model's ${def.evidence} specification status and source notes.`}
          onChange={(v) => edit('Equipment mass updated.', (p) => setDefinitionMass(p, def.id, v))}
        />
        <Field label="Power data status">
          <select
            aria-label="Power data status"
            value={draw?.evidence ?? 'unknown'}
            onChange={(e) =>
              setPower('Power data status updated.', {
                evidence: e.target.value as PowerDraw['evidence'],
              })
            }
          >
            {evidenceLevels.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
      </div>
      <BlurTextField
        label="Power source / notes"
        value={draw?.source ?? ''}
        onChange={(v) => setPower('Power data source updated.', { source: v })}
      />
      {feedingBanks.length > 0 ? (
        <div className="port-list" aria-label="Power feeds">
          {feedingBanks.map(({ feed, distributor, bank }) => (
            <div key={feed.cableId}>
              <span className="port-dot" />
              <span>
                {distributor?.name ?? feed.distributorDeviceId} · {bank?.name ?? feed.bankId}
                <small>
                  {bank?.outlets.find((o) => o.portId === feed.outletPortId)?.portName ??
                    feed.outletPortId}{' '}
                  → {def.ports.find((p) => p.id === feed.inletPortId)?.name ?? feed.inletPortId} ·
                  cable {project.cables.find((c) => c.id === feed.cableId)?.label || feed.cableId}
                  {bank && ` · bank ${amps(bank.max.knownA)} of ${bank.maxCurrentA} A`}
                </small>
              </span>
              {bank && <Badge tone={statusTone[bank.status]}>{statusText[bank.status]}</Badge>}
            </div>
          ))}
        </div>
      ) : (
        info?.powered && (
          <p className="muted small">Not connected to a banked power outlet in this project.</p>
        )
      )}
      {info?.isDistributor && (
        <p className="small">
          Input load (own draw plus downstream): {watts(info.input.max.knownW)} maximum
          {!info.input.max.complete && ' (known part only)'}, {watts(info.input.nominal.knownW)}{' '}
          nominal{!info.input.nominal.complete && ' (known part only)'}.
        </p>
      )}
      {distributor?.outputLimit && <OutputLimitCard limit={distributor.outputLimit} />}
      {banks.map((bank) => (
        <BankCard key={bank.bankId} bank={bank} definition={def} />
      ))}
    </section>
  );
}

/** The distributor's total output across all banks against its rated VA, W and A limits. */
function OutputLimitCard({ limit }: { limit: PowerOutputLimitResult }) {
  const width = Math.min(100, limit.utilisation * 100);
  const rated = (
    [
      ['VA', limit.maxVA],
      ['W', limit.maxW],
      ['A', limit.maxCurrentA],
    ] as const
  ).filter(([, rating]) => rating !== null);
  return (
    <div className="depth-section power-output-limit" data-status={limit.status}>
      <div className="section-title">
        <strong>Total output</strong>
        <Badge tone={statusTone[limit.status]}>{statusText[limit.status]}</Badge>
      </div>
      <div
        className="power-meter"
        role="meter"
        aria-label="Total output utilisation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(limit.utilisation * 100)}
      >
        <span data-status={limit.status} style={{ width: `${width}%` }} />
        <i style={{ left: `${POWER_WARNING_UTILISATION * 100}%` }} />
      </div>
      <p className="small">
        Maximum: {watts(limit.max.knownW)} · {amps(limit.max.knownA)} at {limit.voltageV} V (
        {percent(limit.utilisation)} of the {limit.governingLimit} limit)
        {!limit.max.complete && ' · known part only'}
        <br />
        Nominal: {watts(limit.nominal.knownW)} · {amps(limit.nominal.knownA)}
        {!limit.nominal.complete && ' · known part only'}
        <br />
        Limits:{' '}
        {rated
          .map(([k, rating]) => {
            const u = limit.utilisationByLimit[k];
            return `${rating} ${k}${u === null ? '' : ` (${percent(u)})`}`;
          })
          .join(' · ')}
      </p>
      {limit.unknownConsumers.length > 0 && (
        <p className="small warning-text">
          Unknown draw: {limit.unknownConsumers.map((u) => `${u.name} (${u.reason})`).join('; ')}
        </p>
      )}
      {limit.externalOutlets.length > 0 && (
        <p className="small warning-text">
          {limit.externalOutlets.length} outlet feed(s) leave the rack; their draw is unknown.
        </p>
      )}
      <p className="muted small">
        Rating status: {limit.evidence}. Every device this distributor supplies counts once across
        all of its banks, including equipment behind a chained PDU. Watts are compared with VA at
        power factor 1. Change the limit in the equipment model editor (Power & weight).
      </p>
    </div>
  );
}

function BankCard({ bank, definition }: { bank: PowerBankResult; definition: DeviceDefinition }) {
  const { edit } = useStore();
  const setBank = (label: string, patch: Partial<Omit<PowerBank, 'id'>>) =>
    edit(label, (p) => setPowerBank(p, definition.id, bank.bankId, patch));
  const width = Math.min(100, bank.utilisation * 100);
  const used = bank.outlets.filter((o) => o.cableIds.length > 0);
  return (
    <div className="depth-section power-bank" data-status={bank.status}>
      <div className="section-title">
        <strong>{bank.name}</strong>
        <Badge tone={statusTone[bank.status]}>{statusText[bank.status]}</Badge>
      </div>
      <div
        className="power-meter"
        role="meter"
        aria-label={`${bank.name} utilisation`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(bank.utilisation * 100)}
      >
        <span data-status={bank.status} style={{ width: `${width}%` }} />
        <i style={{ left: `${POWER_WARNING_UTILISATION * 100}%` }} />
      </div>
      <p className="small">
        Maximum: {amps(bank.max.knownA)} of {bank.maxCurrentA} A ({percent(bank.utilisation)}) ·{' '}
        {watts(bank.max.knownW)}
        {!bank.max.complete && ' · known part only'}
        <br />
        Nominal: {amps(bank.nominal.knownA)} · {watts(bank.nominal.knownW)}
        {!bank.nominal.complete && ' · known part only'}
      </p>
      {bank.unknownConsumers.length > 0 && (
        <p className="small warning-text">
          Unknown draw: {bank.unknownConsumers.map((u) => `${u.name} (${u.reason})`).join('; ')}
        </p>
      )}
      {bank.externalOutlets.length > 0 && (
        <p className="small warning-text">
          {bank.externalOutlets.length} outlet feed(s) leave the rack; their draw is unknown.
        </p>
      )}
      {used.length > 0 && (
        <div className="port-list">
          {used.map((o) => (
            <div key={o.portId}>
              <span className="port-dot" />
              <span>
                {o.portName}
                <small>
                  {[
                    ...o.consumerDeviceIds.map(
                      (id) => bank.consumers.find((c) => c.deviceId === id)?.name ?? id,
                    ),
                    ...o.externalDestinationIds.map((id) => `external ${id}`),
                  ].join(', ')}{' '}
                  · {amps(o.max.knownA)}
                  {o.limitA !== null && ` of ${o.limitA} A`}
                </small>
              </span>
              <Badge tone={statusTone[o.status]}>{statusText[o.status]}</Badge>
            </div>
          ))}
        </div>
      )}
      <div className="form-grid three">
        <NumberField
          label="Bank limit (A)"
          value={bank.maxCurrentA}
          min={0.01}
          step={0.1}
          onChange={(v) => setBank('Power bank current limit updated.', { maxCurrentA: v })}
        />
        <OptionalNumberField
          label="Per outlet (A)"
          value={bank.outletMaxCurrentA}
          positive
          step={0.1}
          hint={bank.outletMaxCurrentA === null ? 'No outlet rating' : undefined}
          onChange={(v) => setBank('Power outlet current limit updated.', { outletMaxCurrentA: v })}
        />
        <NumberField
          label="Voltage (V)"
          value={bank.voltageV}
          min={1}
          onChange={(v) => setBank('Power bank voltage updated.', { voltageV: v })}
        />
      </div>
      <p className="muted small">
        Rating status: {bank.evidence}. Limits are shared by every copy of this model. Amps are
        estimated as W ÷ V, treating watts as volt-amperes (power factor 1). Warning from{' '}
        {POWER_WARNING_UTILISATION * 100} % of the limit.
      </p>
    </div>
  );
}

/** Power, mass and power-bank fields for the definition editor's draft. */
export function DefinitionPowerFields({
  definition: d,
  update,
}: {
  definition: DeviceDefinition;
  update: (patch: Partial<DeviceDefinition>) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const power: PowerDraw = d.power ?? {
    nominalW: null,
    maxW: null,
    evidence: 'user-entered',
    source: '',
  };
  const setPower = (patch: Partial<PowerDraw>) =>
    update({
      power: {
        ...power,
        ...((('nominalW' in patch && patch.nominalW !== power.nominalW) ||
          ('maxW' in patch && patch.maxW !== power.maxW)) &&
        !patch.evidence
          ? { evidence: 'user-entered' as const }
          : {}),
        ...patch,
      },
    });
  const banks = d.powerBanks ?? [];
  const setBanks = (next: PowerBank[]) => update({ powerBanks: next.length ? next : undefined });
  const limit = d.powerOutputLimit;
  // As for banks, changing a rated value without choosing a status marks it user-entered.
  const patchLimit = (patch: Partial<PowerOutputLimit>) => {
    const previous = limit ?? EMPTY_POWER_OUTPUT_LIMIT;
    update({
      powerOutputLimit: {
        ...previous,
        ...((['maxVA', 'maxW', 'maxCurrentA', 'voltageV'] as const).some(
          (k) => k in patch && patch[k] !== previous[k],
        ) && !patch.evidence
          ? { evidence: 'user-entered' as const }
          : {}),
        ...patch,
      },
    });
  };
  // As in the inspector, changing a rated value without choosing a status marks it user-entered.
  const patchBank = (id: string, patch: Partial<PowerBank>) =>
    setBanks(
      banks.map((b) =>
        b.id !== id
          ? b
          : {
              ...b,
              ...((['maxCurrentA', 'outletMaxCurrentA', 'voltageV'] as const).some(
                (k) => k in patch && patch[k] !== b[k],
              ) && !patch.evidence
                ? { evidence: 'user-entered' as const }
                : {}),
              ...patch,
            },
      ),
    );
  return (
    <>
      <p className="muted">
        Power draw and mass belong to this equipment model; every placed copy shares them. Leave a
        value empty when it is unknown. Unknown values stay unknown in power and weight totals.
      </p>
      <div className="form-grid">
        <OptionalNumberField
          label="Nominal draw (W)"
          value={power.nominalW}
          onChange={(v) => setPower({ nominalW: v })}
        />
        <OptionalNumberField
          label="Maximum draw (W)"
          value={power.maxW}
          onChange={(v) => setPower({ maxW: v })}
        />
        <Field label="Power data status">
          <select
            value={power.evidence}
            onChange={(e) => setPower({ evidence: e.target.value as PowerDraw['evidence'] })}
          >
            {evidenceLevels.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <OptionalNumberField
          label="Mass (kg)"
          value={d.massKg}
          step={0.1}
          hint="Mass uses this model's specification status and source notes."
          onChange={(v) => update({ massKg: v })}
        />
      </div>
      <Field label="Power source / notes">
        <textarea value={power.source} onChange={(e) => setPower({ source: e.target.value })} />
      </Field>
      <section className="shape-row">
        <h3>Power banks (outlet groups)</h3>
        <p className="muted">
          For a PDU or UPS: group outlet ports that share a current limit, for example a top and a
          bottom row of IEC outlets. Cables from these outlets feed the equipment at the other end.
          A new bank starts with an unknown 10 A, 230 V placeholder: enter the rated values from the
          equipment label or datasheet.
        </p>
        {banks.map((bank) => (
          <div className="depth-section" key={bank.id}>
            <div className="section-title">
              <strong>{bank.name || 'Unnamed bank'}</strong>
              <Badge tone="warn">{bank.evidence}</Badge>
            </div>
            <div className="form-grid">
              <Field label="Bank name">
                <input
                  value={bank.name}
                  onChange={(e) => patchBank(bank.id, { name: e.target.value })}
                />
              </Field>
              <NumberField
                label="Bank limit (A)"
                value={bank.maxCurrentA}
                min={0.01}
                step={0.1}
                onChange={(v) => patchBank(bank.id, { maxCurrentA: v })}
              />
              <OptionalNumberField
                label="Per-outlet limit (A)"
                value={bank.outletMaxCurrentA}
                positive
                step={0.1}
                hint={bank.outletMaxCurrentA === null ? 'No outlet rating' : undefined}
                onChange={(v) => patchBank(bank.id, { outletMaxCurrentA: v })}
              />
              <NumberField
                label="Voltage (V)"
                value={bank.voltageV}
                min={1}
                onChange={(v) => patchBank(bank.id, { voltageV: v })}
              />
              <Field label="Rating status">
                <select
                  value={bank.evidence}
                  onChange={(e) =>
                    patchBank(bank.id, { evidence: e.target.value as PowerBank['evidence'] })
                  }
                >
                  {evidenceLevels.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rating source">
                <input
                  value={bank.source}
                  onChange={(e) => patchBank(bank.id, { source: e.target.value })}
                />
              </Field>
            </div>
            <Button onClick={() => setOpen(open === bank.id ? null : bank.id)}>
              {open === bank.id ? 'Hide outlets' : `Outlets (${bank.portIds.length})`}
            </Button>
            {open === bank.id && (
              <div className="power-outlet-picks">
                {d.ports.map((port) => {
                  const other = banks.find((b) => b.id !== bank.id && b.portIds.includes(port.id));
                  return (
                    <label className="check-field" key={port.id}>
                      <input
                        type="checkbox"
                        checked={bank.portIds.includes(port.id)}
                        disabled={Boolean(other)}
                        onChange={(e) =>
                          patchBank(bank.id, {
                            portIds: e.target.checked
                              ? d.ports
                                  .map((p) => p.id)
                                  .filter((id) => id === port.id || bank.portIds.includes(id))
                              : bank.portIds.filter((id) => id !== port.id),
                          })
                        }
                      />
                      {port.name} · {port.connector}
                      {other && ` · in ${other.name}`}
                    </label>
                  );
                })}
              </div>
            )}
            <Button
              className="danger"
              icon="trash"
              onClick={() => setBanks(banks.filter((b) => b.id !== bank.id))}
            >
              Remove bank
            </Button>
          </div>
        ))}
        <Button
          icon="plus"
          onClick={() => {
            const id = uid('bank');
            setBanks([
              ...banks,
              {
                id,
                name: `Bank ${banks.length + 1}`,
                portIds: [],
                maxCurrentA: 10,
                outletMaxCurrentA: null,
                voltageV: 230,
                evidence: 'unknown',
                source: '',
              },
            ]);
            setOpen(id);
          }}
        >
          Add power bank
        </Button>
      </section>
      <section className="shape-row" aria-label="Total output limit">
        <h3>Total output limit</h3>
        <p className="muted">
          For a UPS or PDU whose whole output is rated below the sum of its banks, for example a UPS
          rated 3000 VA / 2700 W, or a PDU with a 32 A input. Every device it supplies counts once
          against this limit. Leave a rating empty when the model is not rated for it; at least one
          is needed. Watts are compared with VA at power factor 1, and amps are W ÷ the voltage
          below.
        </p>
        {limit ? (
          <div className="depth-section">
            <div className="section-title">
              <strong>Whole distributor</strong>
              <Badge tone="warn">{limit.evidence}</Badge>
            </div>
            <div className="form-grid">
              <OptionalNumberField
                label="Output limit (VA)"
                value={limit.maxVA}
                positive
                hint={limit.maxVA === null ? 'Not rated' : undefined}
                onChange={(v) => patchLimit({ maxVA: v })}
              />
              <OptionalNumberField
                label="Output limit (W)"
                value={limit.maxW}
                positive
                hint={limit.maxW === null ? 'Not rated' : undefined}
                onChange={(v) => patchLimit({ maxW: v })}
              />
              <OptionalNumberField
                label="Output limit (A)"
                value={limit.maxCurrentA}
                positive
                step={0.1}
                hint={limit.maxCurrentA === null ? 'Not rated' : undefined}
                onChange={(v) => patchLimit({ maxCurrentA: v })}
              />
              <NumberField
                label="Output voltage (V)"
                value={limit.voltageV}
                min={1}
                onChange={(v) => patchLimit({ voltageV: v })}
              />
              <Field label="Output rating status">
                <select
                  value={limit.evidence}
                  onChange={(e) =>
                    patchLimit({ evidence: e.target.value as PowerOutputLimit['evidence'] })
                  }
                >
                  {evidenceLevels.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Output rating source">
                <input
                  value={limit.source}
                  onChange={(e) => patchLimit({ source: e.target.value })}
                />
              </Field>
            </div>
            <Button
              className="danger"
              icon="trash"
              onClick={() => update({ powerOutputLimit: undefined })}
            >
              Remove total output limit
            </Button>
          </div>
        ) : (
          <Button
            icon="plus"
            onClick={() => update({ powerOutputLimit: { ...EMPTY_POWER_OUTPUT_LIMIT } })}
          >
            Add total output limit
          </Button>
        )}
      </section>
    </>
  );
}
