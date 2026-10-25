import { useStore } from '../state';
import { cableLabel } from '../model';
import type { Vec3 } from '../model';
import { endpointLabel } from '../engineering/connectivity';
import { NumberField } from './shared';
import { clickWiringGuide } from './wiringActions';

export function WiringPanel() {
  const s = useStore(),
    { project, wiringTool, selection, edit, set } = s;
  if (wiringTool === 'off' || s.showModelTools) return null;
  const cable =
    selection?.kind === 'cable' ? project.cables.find((c) => c.id === selection.id) : undefined;
  const guide = project.wiringGuides?.find((g) => g.id === s.wiringGuideId);
  const changeLinks = (fn: (links: NonNullable<typeof cable>['guideLinks']) => void) => {
    if (cable)
      edit('Cable guide order updated.', (p) =>
        fn((p.cables.find((c) => c.id === cable.id)!.guideLinks ??= [])),
      );
  };
  const coordinates = (key: 'position' | 'start' | 'end', value: Vec3) => (
    <div className="wiring-coordinates" key={key}>
      <span>{key === 'position' ? 'Point' : key === 'start' ? 'A' : 'B'} (mm)</span>
      {value.map((v, axis) => (
        <NumberField
          key={axis}
          label={`${key} ${['X', 'Y', 'Z'][axis]} (mm)`}
          value={v}
          min={-100000}
          onChange={(n) =>
            edit('Wiring guide moved. Linked cables recalculated.', (p) => {
              const g = p.wiringGuides!.find((g) => g.id === guide!.id)!;
              if (key === 'position' && g.kind === 'point') g.position[axis] = n;
              else if (key !== 'position' && g.kind === 'line') g[key][axis] = n;
            })
          }
        />
      ))}
    </div>
  );
  return (
    <aside className="wiring-panel" aria-label="Wiring tools">
      <div className="wiring-tools" role="group" aria-label="Wiring mode tools">
        {(['select', 'connect', 'waypoints', 'link'] as const).map((tool) => (
          <button
            key={tool}
            aria-pressed={wiringTool === tool}
            onClick={() => set({ wiringTool: tool, wiringLineStart: null, wiringSource: null })}
          >
            {
              {
                select: 'Select',
                connect: 'Connect ports',
                waypoints: 'Waypoints',
                link: 'Link cable',
              }[tool]
            }
          </button>
        ))}
      </div>
      <p className="wiring-help">
        {wiringTool === 'waypoints'
          ? s.wiringLineStart
            ? 'Click the line end. Esc cancels.'
            : 'Click a visible rack or equipment surface: 10 mm offset. Shift + click starts a line; click again to finish.'
          : wiringTool === 'connect'
            ? s.wiringSource
              ? `From ${endpointLabel(project, s.wiringSource)}. Click the destination port.`
              : 'Click the source port, then the destination port. Front / Rear views help with small ports.'
            : wiringTool === 'link'
              ? 'Select a cable below, then click guides in route order. A line is followed from A to B; reverse it below.'
              : 'Select cables or guides. Right-drag pans; wheel zooms. Use Select to orbit.'}
      </p>
      {wiringTool === 'connect' && (
        <label>
          Vehicle cable exit
          <select
            aria-label="Wiring rack exit"
            value={s.wiringExitId ?? ''}
            onChange={(e) => set({ wiringExitId: e.target.value || null })}
          >
            <option value="">
              {project.exits.length === 1
                ? 'Use the only rack exit'
                : 'Choose exit for vehicle connections'}
            </option>
            {project.exits.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="wiring-cable-picker">
        Cable
        <select
          aria-label="Wiring cable"
          value={cable?.id ?? ''}
          onChange={(e) =>
            set({ selection: e.target.value ? { kind: 'cable', id: e.target.value } : null })
          }
        >
          <option value="">Select a cable</option>
          {project.cables.map((c) => (
            <option key={c.id} value={c.id}>
              {cableLabel(c)} · {c.name}
            </option>
          ))}
        </select>
      </label>
      {cable && (
        <div className="wiring-route" aria-label="Ordered cable guides">
          <strong>{cableLabel(cable)} · guide order</strong>
          {(cable.guideLinks ?? []).map((link, index, links) => {
            const g = project.wiringGuides?.find((g) => g.id === link.guideId);
            return (
              <div className="wiring-route-row" key={link.guideId}>
                <span>
                  {index + 1}. {g?.name}{' '}
                  {g?.kind === 'line' ? (link.reverse ? 'B → A' : 'A → B') : ''}
                </span>
                <button
                  aria-label={`Move ${g?.name} earlier`}
                  disabled={!index}
                  onClick={() =>
                    changeLinks((l) => {
                      [l![index - 1], l![index]] = [l![index], l![index - 1]];
                    })
                  }
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${g?.name} later`}
                  disabled={index === links.length - 1}
                  onClick={() =>
                    changeLinks((l) => {
                      [l![index], l![index + 1]] = [l![index + 1], l![index]];
                    })
                  }
                >
                  ↓
                </button>
                {g?.kind === 'line' && (
                  <button
                    aria-label={`Reverse ${g.name}`}
                    onClick={() =>
                      changeLinks((l) => {
                        l![index].reverse = !l![index].reverse;
                      })
                    }
                  >
                    ⇄
                  </button>
                )}
                <button
                  aria-label={`Unlink ${g?.name}`}
                  onClick={() =>
                    changeLinks((l) => {
                      l!.splice(index, 1);
                    })
                  }
                >
                  ×
                </button>
              </div>
            );
          })}
          {!cable.guideLinks?.length && <small>No linked guides yet.</small>}
          {(cable.waypoints.length > 0 ||
            project.looms.some((l) => l.cableIds.includes(cable.id))) && (
            <small>Existing loom and numeric waypoints are visited before these guides.</small>
          )}
          {cable.followCableId && (
            <small>
              This cable also follows another cable. Conflicting route constraints will require
              review.
            </small>
          )}
        </div>
      )}
      <details open={wiringTool === 'waypoints'}>
        <summary>Reusable guides ({project.wiringGuides?.length ?? 0})</summary>
        <div className="wiring-guide-list">
          {project.wiringGuides?.map((g) => (
            <button
              key={g.id}
              aria-pressed={g.id === guide?.id}
              onClick={() => clickWiringGuide(g.id)}
            >
              {g.name} · {g.kind}
            </button>
          ))}
        </div>
        {guide && (
          <div className="wiring-guide-editor">
            <label>
              Guide name
              <input
                aria-label="Guide name"
                value={guide.name}
                onChange={(e) =>
                  edit('Guide renamed.', (p) => {
                    p.wiringGuides!.find((g) => g.id === guide.id)!.name = e.target.value;
                  })
                }
              />
            </label>
            {(guide.kind === 'point' && guide.accessoryId) ||
            (guide.kind === 'line' && guide.trayId) ? (
              <button
                onClick={() =>
                  set({
                    showModelTools: true,
                    selection: {
                      kind: 'accessory',
                      id: guide.kind === 'point' ? guide.accessoryId! : guide.trayId!,
                    },
                    modelTool: 'translate',
                    wiringTool: 'off',
                  })
                }
              >
                Edit physical fixing / tray
              </button>
            ) : guide.kind === 'point' ? (
              coordinates('position', guide.position)
            ) : (
              <>
                {coordinates('start', guide.start)}
                {coordinates('end', guide.end)}
              </>
            )}
            <small>
              Surface points stay fixed. Physical fixing and tray guides follow their parent
              hardware.
            </small>
            <button
              disabled={project.cables.some((c) =>
                c.guideLinks?.some((l) => l.guideId === guide.id),
              )}
              title="Unlink from every cable before deleting"
              onClick={() => {
                if (
                  edit('Guide removed.', (p) => {
                    p.wiringGuides = p.wiringGuides!.filter((g) => g.id !== guide.id);
                  })
                )
                  set({ wiringGuideId: null });
              }}
            >
              Delete guide
            </button>
          </div>
        )}
      </details>
      <small>
        Shared guides are cable centreline constraints. Clearance and bend checks still apply.
      </small>
    </aside>
  );
}
