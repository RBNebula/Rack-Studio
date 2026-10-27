import { useState } from 'react';
import { useStore } from '../state';
import type { Workspace } from '../state';
import { uid, cableLabel } from '../model';
import {
  analyseProject,
  cutListCsv,
  procurementCsv,
  scheduleColumns,
  scheduleCsv,
  scheduleValue,
} from '../engineering/analysis';
import {
  NOT_CONNECTED,
  buildPowerReport,
  powerReportCsv,
  reportCellText,
} from '../engineering/power-report';
import type { ReportCell } from '../engineering/power-report';
import type { PowerStatus } from '../engineering/power';
import { Button, Field, NumberField, Icon, Badge, Modal, download, metres } from './shared';
import { ConnectionDialog, DestinationDialog, ExitDialog } from './Forms';
export default function Reports({ workspace }: { workspace: Workspace }) {
  return workspace === 'power' ? <PowerWeightsReport /> : <CableReports workspace={workspace} />;
}
function CableReports({ workspace }: { workspace: Workspace }) {
  const { project, selection, set, edit } = useStore();
  const analysis = analyseProject(project);
  const [search, setSearch] = useState('');
  const [supply, setSupply] = useState('all');
  const [sort, setSort] = useState('id');
  const [reverse, setReverse] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'connection' | 'destination' | 'exit' | 'product' | null>(
    null,
  );
  const isCuts = workspace === 'cuts',
    isProc = workspace === 'procurement',
    isConn = workspace === 'connections';
  const title = isCuts
    ? 'Cable cut list'
    : isProc
      ? 'Procurement'
      : isConn
        ? 'Cable connections'
        : 'Master cable schedule';
  const subtitle = isCuts
    ? 'Continuous cuts, termination allowances and reel allocation.'
    : isProc
      ? 'A feasible cutting plan. An explicit reserve. No hidden quantities.'
      : isConn
        ? 'Persistent port-to-port connections, inside and outside the rack.'
        : 'Every physical cable, documented once. Live from the engineering model.';
  const rows = analysis.cables
    .filter(
      (a) =>
        (supply === 'all' || a.cable.supply === supply) &&
        `${cableLabel(a.cable)} ${a.cable.name} ${a.source} ${a.destination} ${a.cable.purpose} ${a.cable.type} ${a.cable.notes}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const x = scheduleValue(project, a, sort),
        y = scheduleValue(project, b, sort);
      const result =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x ?? '').localeCompare(String(y ?? ''));
      return reverse ? -result : result;
    });
  const columns = isCuts
    ? ['id', 'supply', 'type', 'source', 'destination', 'required', 'supplied', 'status']
    : isConn
      ? ['id', 'source', 'destination', 'purpose', 'supply', 'exit', 'status']
      : project.settings.scheduleColumns.filter((c) => scheduleColumns[c]);
  function exportCsv() {
    download(
      `${project.name.replaceAll(/[^a-z0-9]/gi, '-')}-${workspace}.csv`,
      isProc ? procurementCsv(project) : isCuts ? cutListCsv(project) : scheduleCsv(project),
      'text/csv;charset=utf-8',
    );
  }
  return (
    <main className="report-workspace">
      <div className="report-heading">
        <div>
          <span className="eyebrow">PROJECT DOCUMENTATION</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="button-row">
          <Button icon="download" onClick={exportCsv}>
            Export CSV
          </Button>
          {!isProc && (
            <Button
              icon="refresh"
              onClick={() =>
                edit('Cable numbers reassigned from 0; internal identities preserved.', (p) => {
                  p.cables.forEach((c, i) => {
                    c.label = String(i);
                  });
                })
              }
            >
              Renumber 0…
            </Button>
          )}
          {!isProc && (
            <Button icon="plus" className="primary" onClick={() => setDialog('connection')}>
              New connection
            </Button>
          )}
          {isProc && (
            <Button icon="plus" className="primary" onClick={() => setDialog('product')}>
              Cable product
            </Button>
          )}
        </div>
      </div>
      <div className="metrics-row">
        {(isProc
          ? [
              ['Bulk cable products', String(project.products.length), 'reel'],
              [
                'Known bulk requirement',
                metres(analysis.procurement.products.reduce((n, r) => n + r.knownCutLengthMm, 0)),
                'ruler',
              ],
              [
                'Unresolved cuts',
                String(
                  analysis.procurement.products.reduce((n, r) => n + r.unresolvedCutIds.length, 0),
                ),
                'alert',
              ],
              ['Existing stock reels', String(project.stock.length), 'box'],
            ]
          : [
              ['Physical cables', String(project.cables.length), 'cable'],
              [
                'Internal connections',
                String(
                  project.cables.filter(
                    (c) => c.source.kind === 'device' && c.destination.kind === 'device',
                  ).length,
                ),
                'cube',
              ],
              [
                'External connections',
                String(
                  project.cables.filter(
                    (c) => c.source.kind === 'external' || c.destination.kind === 'external',
                  ).length,
                ),
                'layers',
              ],
              [
                'Needs review',
                String(analysis.cables.filter((a) => a.status !== 'Calculated').length),
                'alert',
              ],
            ]
        ).map(([label, value, icon]) => (
          <div className="metric" key={label}>
            <Icon name={icon} size={20} />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      {isProc ? (
        <>
          <div className="callout">
            <Icon name="alert" />
            <span>
              Purchasing quantities are provisional whenever a route, external distance or model
              specification is unresolved. Existing stock is planned without consuming or reserving
              it. Multi-project stock reservation remains pending.
            </span>
          </div>
          <div className="procurement-grid">
            <section className="surface">
              <div className="section-title">
                <h2>Reserve policy</h2>
                <Badge>Configurable · zero by default</Badge>
              </div>
              <div className="form-grid three">
                <NumberField
                  label="Fixed project reserve (mm)"
                  value={project.settings.reserveFixedMm}
                  onChange={(v) =>
                    edit('Reserve policy updated.', (p) => {
                      p.settings.reserveFixedMm = v;
                    })
                  }
                />
                <NumberField
                  label="Standard reel reserve (%)"
                  value={project.settings.reservePercent}
                  onChange={(v) =>
                    edit('Reserve policy updated.', (p) => {
                      p.settings.reservePercent = v;
                    })
                  }
                />
                <NumberField
                  label="Consumption contingency (%)"
                  value={project.settings.contingencyPercent}
                  onChange={(v) =>
                    edit('Reserve policy updated.', (p) => {
                      p.settings.contingencyPercent = v;
                    })
                  }
                />
              </div>
              <p className="muted small">
                Reserve = fixed length + percentage of one standard reel + contingency on known
                consumption. The recommendation is advisory.
              </p>
            </section>
            <section className="surface">
              <div className="section-title">
                <h2>Available stock</h2>
                <Button
                  icon="plus"
                  onClick={() => {
                    if (project.products[0])
                      edit('Stock reel added. Edit its remaining length below.', (p) =>
                        p.stock.push({
                          id: uid('stock'),
                          productId: p.products[0].id,
                          remainingMm: p.products[0].reelLengthMm,
                        }),
                      );
                  }}
                >
                  Add reel
                </Button>
              </div>
              {project.stock.length === 0 ? (
                <p className="empty-note">No existing stock entered.</p>
              ) : (
                project.stock.map((stock) => (
                  <div className="stock-row" key={stock.id}>
                    <Field label="Product">
                      <select
                        value={stock.productId}
                        onChange={(e) =>
                          edit('Stock product updated.', (p) => {
                            p.stock.find((s) => s.id === stock.id)!.productId = e.target.value;
                          })
                        }
                      >
                        {project.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <NumberField
                      label="Remaining (mm)"
                      value={stock.remainingMm}
                      onChange={(v) =>
                        edit('Stock remaining length updated.', (p) => {
                          p.stock.find((s) => s.id === stock.id)!.remainingMm = v;
                        })
                      }
                    />
                    <button
                      className="icon-button danger"
                      aria-label="Remove stock reel"
                      data-tooltip="Remove stock reel"
                      onClick={() =>
                        edit('Stock reel removed.', (p) => {
                          p.stock = p.stock.filter((s) => s.id !== stock.id);
                        })
                      }
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                ))
              )}
            </section>
          </div>
          {analysis.procurement.products.map((r) => (
            <section className="surface product-result" key={r.productId}>
              <div className="section-title">
                <div>
                  <span className="eyebrow">BULK CABLE</span>
                  <h2>{r.productName}</h2>
                </div>
                <Badge
                  tone={
                    r.status === 'complete' ? 'good' : r.status === 'infeasible' ? 'error' : 'warn'
                  }
                >
                  {r.status} · {r.optimisationMethod}
                </Badge>
              </div>
              <div className="product-numbers">
                <div>
                  <span>Known cut requirement</span>
                  <strong>{metres(r.knownCutLengthMm)}</strong>
                </div>
                <div>
                  <span>Aggregate lower bound</span>
                  <strong>
                    {r.aggregateLowerBoundReels} <small>reels</small>
                  </strong>
                </div>
                <div>
                  <span>{r.provenOptimal ? 'Proven minimum new reels' : 'Feasible new reels'}</span>
                  <strong>{r.minimumFeasibleNewReels ?? r.feasibleNewReels ?? '—'}</strong>
                </div>
                <div className="teal-number">
                  <span>
                    {r.status !== 'complete'
                      ? 'Known cuts only · recommended new'
                      : 'Recommended new reels'}
                  </span>
                  <strong>{r.recommendedNewReels ?? '—'}</strong>
                </div>
              </div>
              <p className="muted">{r.recommendationReason}</p>
              {r.unresolvedCutIds.length > 0 && (
                <p className="warning-text">
                  Unresolved:{' '}
                  {r.unresolvedCutIds
                    .map((id) => {
                      const c = project.cables.find((v) => v.id === id);
                      return c ? cableLabel(c) : id;
                    })
                    .join(', ')}
                  . Known cuts alone do not define a complete order.
                </p>
              )}
              <div className="reel-grid">
                {r.allocatedReels.map((reel) => (
                  <div className="reel-card" key={reel.reelId}>
                    <div className="section-title">
                      <strong>{reel.reelId}</strong>
                      <Badge>{reel.source}</Badge>
                    </div>
                    <div className="utilisation">
                      <i style={{ width: `${reel.utilisationPercent}%` }} />
                    </div>
                    <p>
                      {metres(reel.consumedLengthMm)} used · {metres(reel.remainingLengthMm)}{' '}
                      remains
                    </p>
                    {reel.cuts.map((c) => (
                      <div className="reel-cut" key={c.id}>
                        <span>
                          {project.cables.find((v) => v.id === c.id)
                            ? cableLabel(project.cables.find((v) => v.id === c.id)!)
                            : c.id}
                        </span>
                        <strong>{metres(c.lengthMm)}</strong>
                      </div>
                    ))}
                    <small>Cutting waste: {metres(reel.wasteMm)}</small>
                  </div>
                ))}
              </div>
              {r.warnings.length > 0 && <p className="small muted">{r.warnings.join(' ')}</p>}
            </section>
          ))}
          <section className="surface">
            <h2>Preterminated assemblies</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Supplied length</th>
                    <th>Colour</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(
                    analysis.cables
                      .filter((a) => a.cable.supply === 'preterminated')
                      .reduce<
                        Record<
                          string,
                          { type: string; length: number | null; color: string; count: number }
                        >
                      >((acc, a) => {
                        const c = a.cable,
                          key = `${c.productId}|${c.type}|${c.color}|${c.suppliedLengthMm}`;
                        acc[key] ??= {
                          type: c.type,
                          length: c.suppliedLengthMm,
                          color: c.color,
                          count: 0,
                        };
                        acc[key].count++;
                        return acc;
                      }, {}),
                  ).map((r, i) => (
                    <tr key={i}>
                      <td>{r.type}</td>
                      <td>{metres(r.length)}</td>
                      <td>
                        <span className="color-dot" style={{ background: r.color }} />
                        {r.color}
                      </td>
                      <td>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="table-controls">
            <div className="search-field">
              <Icon name="search" />
              <input
                aria-label="Search cable schedule"
                value={search}
                placeholder="Search cables, devices, purpose…"
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter cable supply"
              value={supply}
              onChange={(e) => setSupply(e.target.value)}
            >
              <option value="all">All supply types</option>
              <option value="preterminated">Preterminated</option>
              <option value="bulk">Bulk / reel</option>
            </select>
            <span className="muted small">
              {rows.length} of {project.cables.length} cables
            </span>
            {!isCuts && !isConn && (
              <details className="column-menu">
                <summary>
                  <Icon name="settings" size={16} /> Columns
                </summary>
                <div>
                  {Object.entries(scheduleColumns).map(([id, label]) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={columns.includes(id)}
                        onChange={(e) =>
                          edit('Schedule column configuration saved.', (p) => {
                            p.settings.scheduleColumns = e.target.checked
                              ? [...p.settings.scheduleColumns, id]
                              : p.settings.scheduleColumns.filter((c) => c !== id);
                          })
                        }
                      />
                      {label}
                      {columns.includes(id) && (
                        <button
                          aria-label={`Move ${label} left`}
                          data-tooltip={`Move ${label} left`}
                          onClick={(e) => {
                            e.preventDefault();
                            edit('Schedule columns reordered.', (p) => {
                              const i = p.settings.scheduleColumns.indexOf(id);
                              if (i > 0)
                                [p.settings.scheduleColumns[i - 1], p.settings.scheduleColumns[i]] =
                                  [
                                    p.settings.scheduleColumns[i],
                                    p.settings.scheduleColumns[i - 1],
                                  ];
                            });
                          }}
                        >
                          ←
                        </button>
                      )}
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
          {selected.length > 0 && (
            <div className="bulk-bar">
              <strong>{selected.length} selected</strong>
              <Button
                onClick={() =>
                  edit('Selected cable status changed to installed.', (p) => {
                    p.cables.forEach((c) => {
                      if (selected.includes(c.id)) c.status = 'installed';
                    });
                  })
                }
              >
                Mark installed
              </Button>
              <Button onClick={() => setSelected([])}>Clear selection</Button>
            </div>
          )}
          <div className="schedule-table table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all visible cables"
                      checked={rows.length > 0 && rows.every((a) => selected.includes(a.cable.id))}
                      onChange={(e) =>
                        setSelected(e.target.checked ? rows.map((a) => a.cable.id) : [])
                      }
                    />
                  </th>
                  {columns.map((col) => (
                    <th key={col}>
                      <button
                        onClick={() => {
                          setSort(col);
                          setReverse(sort === col ? !reverse : false);
                        }}
                      >
                        {scheduleColumns[col]}
                        {sort === col ? (reverse ? ' ↓' : ' ↑') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.cable.id}
                    className={
                      selection?.kind === 'cable' && selection.id === a.cable.id ? 'selected' : ''
                    }
                    onClick={() => set({ selection: { kind: 'cable', id: a.cable.id } })}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${a.cable.id}`}
                        checked={selected.includes(a.cable.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, a.cable.id]
                              : selected.filter((id) => id !== a.cable.id),
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    {columns.map((col) => (
                      <td key={col}>
                        {col === 'id' ? (
                          <button
                            className="cable-id"
                            onClick={() => set({ selection: { kind: 'cable', id: a.cable.id } })}
                          >
                            <span className="color-dot" style={{ background: a.cable.color }} />
                            {cableLabel(a.cable)}
                          </button>
                        ) : col === 'purpose' ? (
                          <input
                            aria-label={`${a.cable.id} purpose`}
                            className="table-input"
                            value={a.cable.purpose}
                            onChange={(e) =>
                              edit('Cable purpose updated.', (p) => {
                                p.cables.find((c) => c.id === a.cable.id)!.purpose = e.target.value;
                              })
                            }
                          />
                        ) : col === 'status' ? (
                          <Badge
                            tone={
                              a.status === 'Insufficient length' || a.status === 'Route invalid'
                                ? 'error'
                                : a.status === 'Calculated'
                                  ? 'good'
                                  : 'warn'
                            }
                          >
                            {a.status}
                          </Badge>
                        ) : col === 'supply' ? (
                          <Badge>
                            {a.cable.supply === 'bulk' ? 'Bulk / reel' : 'Preterminated'}
                          </Badge>
                        ) : (
                          (scheduleValue(project, a, col) ?? 'Unknown')
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="empty-state">
                <Icon name="cable" size={32} />
                <h3>No matching connections</h3>
                <p>Connect two defined ports to add a physical cable.</p>
              </div>
            )}
          </div>
          <div className="report-footnote">
            <Icon name="check" size={16} />
            <span>
              One row per physical cable. Looms and exit points do not add duplicate records. CSV
              exports include the complete schedule.
            </span>
          </div>
          {isConn && (
            <div className="connections-bottom">
              <section className="surface">
                <div className="section-title">
                  <h2>External destinations</h2>
                  <Button icon="plus" onClick={() => setDialog('destination')}>
                    Add destination
                  </Button>
                </div>
                {project.destinations.map((d) => (
                  <div className="destination-row" key={d.id}>
                    <Icon name="box" />
                    <div>
                      <strong>{d.name}</strong>
                      <p>
                        {d.location || 'No location'} · {d.ports.length} port(s) ·{' '}
                        {d.routeIn3D ? '3D vehicle endpoint' : 'Logical destination'}
                      </p>
                    </div>
                    <Button
                      onClick={() =>
                        set({
                          selection: { kind: 'destination', id: d.id },
                          workspace: 'designer',
                          showModelTools: true,
                          modelTool: 'select',
                        })
                      }
                    >
                      Edit destination
                    </Button>
                  </div>
                ))}
              </section>
              <section className="surface">
                <div className="section-title">
                  <h2>Rack exits</h2>
                  <Button icon="plus" onClick={() => setDialog('exit')}>
                    Add exit
                  </Button>
                </div>
                {project.exits.map((e) => (
                  <div className="destination-row" key={e.id}>
                    <Icon name="layers" />
                    <div>
                      <strong>{e.name}</strong>
                      <p>
                        {e.size[0]} × {e.size[1]} mm ·{' '}
                        {project.cables.filter((c) => c.exitId === e.id).length} cable(s)
                      </p>
                    </div>
                    <Badge tone="warn">{e.evidence}</Badge>
                  </div>
                ))}
              </section>
            </div>
          )}
        </>
      )}
      {dialog === 'connection' && <ConnectionDialog onClose={() => setDialog(null)} />}{' '}
      {dialog === 'destination' && <DestinationDialog onClose={() => setDialog(null)} />}{' '}
      {dialog === 'exit' && <ExitDialog onClose={() => setDialog(null)} />}{' '}
      {dialog === 'product' && <ProductDialog onClose={() => setDialog(null)} />}
    </main>
  );
}
function ProductDialog({ onClose }: { onClose: () => void }) {
  const { edit } = useStore();
  const [name, setName] = useState('Cat6A · custom product');
  const [reel, setReel] = useState(305000);
  const [color, setColor] = useState('Blue');
  const [waste, setWaste] = useState(0);
  const [type, setType] = useState('Cat6A');
  return (
    <Modal title="Bulk cable product" onClose={onClose}>
      <div className="modal-content">
        <Field label="Product name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cable specification">
          <input value={type} onChange={(e) => setType(e.target.value)} />
        </Field>
        <Field label="Colour">
          <input value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
        <NumberField label="Standard reel length (mm)" value={reel} min={1} onChange={setReel} />
        <NumberField
          label="Additional cutting waste per cut (mm)"
          value={waste}
          onChange={setWaste}
        />
      </div>
      <footer className="modal-footer">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          className="primary"
          onClick={() => {
            if (
              edit('Bulk cable product added.', (p) =>
                p.products.push({
                  id: uid('product'),
                  name,
                  type,
                  color,
                  manufacturer: '',
                  partNumber: '',
                  reelLengthMm: reel,
                  wastePerCutMm: waste,
                }),
              )
            )
              onClose();
          }}
        >
          Add product
        </Button>
      </footer>
    </Modal>
  );
}
const powerStatusTone: Record<PowerStatus, 'good' | 'warn' | 'error'> = {
  ok: 'good',
  warning: 'warn',
  over: 'error',
  incomplete: 'warn',
};
/** Long text columns wrap instead of being cut off. */
const wrappingColumns = new Set([
  'Position',
  'Fed from',
  'Consumers (outlets; max load)',
  'Unknown draw',
  'Rating evidence',
]);
function PowerCell({ value, column }: { value: ReportCell; column: string }) {
  const className = [
    wrappingColumns.has(column) ? 'wrap' : '',
    value === null ? 'unknown-value' : '',
    value === NOT_CONNECTED ? 'warning-text' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const text = reportCellText(value);
  const bound = /^(≥ \S+)([\s\S]*)$/.exec(text);
  return (
    <td className={className || undefined}>
      {bound ? (
        <>
          <span className="nowrap">{bound[1]}</span>
          {bound[2]}
        </>
      ) : (
        text
      )}
    </td>
  );
}
/** The power and weights document: equipment, bank loads, totals and issues from `analysePower`. */
function PowerWeightsReport() {
  const { project } = useStore();
  const report = buildPowerReport(project, analyseProject(project).power);
  const statusColumn = report.bankColumns.indexOf('Status');
  // Banks are grouped under their distributor, so its name column is dropped on screen.
  const bankColumns = report.bankColumns.slice(1);
  const printed = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <main className="report-workspace power-document" aria-label="Power and weights document">
      <div className="report-heading">
        <div>
          <span className="eyebrow">PROJECT DOCUMENTATION</span>
          <h1>Power & weights</h1>
          <p>
            Each placed device’s draw, mass and feeding bank, live from the power analysis. Unknown
            values are never counted as zero.
          </p>
          <p className="print-only">
            {report.projectName} · revision {report.revision} · {report.racks} · printed {printed}
          </p>
        </div>
        <div className="button-row">
          <Button
            icon="download"
            onClick={() =>
              download(
                `${project.name.replaceAll(/[^a-z0-9]/gi, '-')}-power-weights.csv`,
                powerReportCsv(project, report),
                'text/csv;charset=utf-8',
              )
            }
          >
            Export CSV
          </Button>
          <Button icon="printer" onClick={() => window.print()}>
            Print / save PDF
          </Button>
        </div>
      </div>
      {report.provisionalNote && (
        <div className="callout">
          <Icon name="alert" />
          <span>{report.provisionalNote}</span>
        </div>
      )}
      <div className="metrics-row">
        {[
          ['Placed devices', report.summary.devices, 'box'],
          ['Total mass', report.summary.mass, 'layers'],
          ['Total maximum draw', report.summary.maxDraw, 'bolt'],
          ['Power issues', report.summary.issues, 'alert'],
        ].map(([label, value, icon]) => (
          <div className="metric" key={label}>
            <Icon name={icon} size={20} />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      <section className="surface" aria-label="Equipment">
        <div className="section-title">
          <h2>Equipment</h2>
          <span>One row per placed device, top of each rack first</span>
        </div>
        {report.equipment.rows.length === 0 ? (
          <p className="empty-note">No equipment is placed.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {report.equipment.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.equipment.rows.map((row) => (
                  <tr key={row.deviceId}>
                    {row.cells.map((cell, i) => (
                      <PowerCell key={i} value={cell} column={report.equipment.columns[i]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="surface" aria-label="Power distribution">
        <div className="section-title">
          <h2>Power distribution</h2>
          <span>Bank loads at maximum draw; a feeding UPS is listed before its PDUs</span>
        </div>
        {report.distributors.length === 0 && (
          <p className="empty-note">
            No PDU or UPS with power banks is placed. Its banks and loads appear here once one is
            added.
          </p>
        )}
        {report.distributors.map((d) => (
          <div className="power-distributor" key={d.deviceId} style={{ marginLeft: d.level * 18 }}>
            <div className="section-title">
              <div>
                <h3>{d.name}</h3>
                <p className="muted small">
                  {d.model} · {d.position} · Fed from:{' '}
                  <span className={d.fedFrom === NOT_CONNECTED ? 'warning-text' : undefined}>
                    {d.fedFrom}
                  </span>
                </p>
              </div>
              <span>
                Input: {d.inputMax} max · {d.inputNominal} nominal
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {bankColumns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.banks.map((bank) => (
                    <tr key={bank.bankId}>
                      {bank.cells.slice(1).map((cell, i) =>
                        i + 1 === statusColumn ? (
                          <td key={i}>
                            <Badge tone={powerStatusTone[bank.status]}>
                              {reportCellText(cell)}
                            </Badge>
                          </td>
                        ) : (
                          <PowerCell key={i} value={cell} column={bankColumns[i]} />
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
      <section className="surface" aria-label="Totals">
        <div className="section-title">
          <h2>Totals</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Value</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {report.totals.map((t) => (
                <tr key={t.label}>
                  <td>
                    <strong>{t.label}</strong>
                  </td>
                  <td>{t.value}</td>
                  <td className="wrap">{t.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="surface" aria-label="Power issues">
        <div className="section-title">
          <h2>Issues</h2>
        </div>
        {report.issues.length === 0 ? (
          <p className="empty-note">No power issues.</p>
        ) : (
          <ul className="power-issues">
            {report.issues.map((issue, i) => (
              <li key={i}>
                <Badge
                  tone={
                    issue.severity === 'Error'
                      ? 'error'
                      : issue.severity === 'Warning'
                        ? 'warn'
                        : 'neutral'
                  }
                >
                  {issue.severity}
                </Badge>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ul className="report-notes">
        {report.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </main>
  );
}
