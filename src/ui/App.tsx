import { lazy, Suspense, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../state';
import type { Workspace } from '../state';
import { createExampleProject, createWorkspaceProject } from '../examples';
import { repository } from '../data/storage';
import type { ProjectSummary } from '../data/storage';
import { parseProject, serializeProject } from '../data/project';
import type { Project } from '../model';
import Library from './Library';
import Inspector, { RackInspector, addAccessory } from './Inspector';
import Reports from './Reports';
import { ConnectionDialog, DestinationDialog, ExitDialog } from './Forms';
import { Button, Icon, IconButton, Badge, Field, Modal, TooltipLayer, download } from './shared';
import { analyseProject, csv } from '../engineering/analysis';
import { ResizeHandle, useStoredState } from './Panels';
import { exitViewportMode } from './ViewportMode';

const tabs: [Workspace, string, string][] = [
  ['designer', '3D Rack Designer', 'cube'],
  ['model', 'Device Model Designer', 'cube'],
  ['library', 'Device Library', 'box'],
  ['connections', 'Connections', 'cable'],
  ['schedule', 'Cable Schedule', 'grid'],
  ['cuts', 'Cut List', 'ruler'],
  ['procurement', 'Procurement', 'reel'],
  ['power', 'Power & Weights', 'bolt'],
  ['settings', 'Project Settings', 'settings'],
];
const Scene = lazy(() => import('./Scene'));
const ModelDesigner = lazy(() => import('./ModelDesigner'));
async function save(p: Project, manual = false): Promise<boolean> {
  const store = useStore.getState();
  store.set({ saveStatus: 'Saving…' });
  try {
    await repository.save(p);
    const latest = useStore.getState();
    if (latest.project.id !== p.id || latest.project.revision !== p.revision) {
      latest.set({ saveStatus: 'Newer edits await saving' });
      return false;
    }
    latest.set({
      dirty: false,
      saveStatus: `Saved locally ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      ...(manual ? { notice: 'Project saved to this browser’s local IndexedDB storage.' } : {}),
    });
    return true;
  } catch (error) {
    useStore.getState().set({
      saveStatus: 'Save failed',
      error: `Local save failed: ${String(error)}. Current edits were retained. Export JSON to preserve a portable copy.`,
    });
    return false;
  }
}
export default function App() {
  const s = useStore();
  const { project, workspace, set, edit } = s;
  const [dialog, setDialog] = useState<
    'open' | 'connection' | 'destination' | 'exit' | 'help' | null
  >(null);
  const [savedProjects, setSavedProjects] = useState<ProjectSummary[]>([]);
  // Designer side panels: null width = the responsive default from CSS.
  const [libraryWidth, setLibraryWidth] = useStoredState<number | null>(
    'rack-studio-library-width',
    null,
  );
  const [inspectorWidth, setInspectorWidth] = useStoredState<number | null>(
    'rack-studio-inspector-width',
    null,
  );
  const [libraryOpen, setLibraryOpen] = useStoredState('rack-studio-library-open', true);
  const [inspectorOpen, setInspectorOpen] = useStoredState('rack-studio-inspector-open', true);
  const panelStyle = {
    ...(libraryWidth && libraryOpen ? { '--library-w': `${libraryWidth}px` } : {}),
    ...(inspectorWidth && inspectorOpen ? { '--inspector-w': `${inspectorWidth}px` } : {}),
  } as CSSProperties;
  const analysis = analyseProject(project);
  useEffect(() => {
    let active = true;
    const opening = useStore.getState().project;
    async function restore() {
      try {
        const id = localStorage.getItem('rack-studio-last-project');
        if (id) {
          const p = await repository.load(id);
          if (
            p &&
            active &&
            useStore.getState().project.id === opening.id &&
            useStore.getState().project.revision === opening.revision &&
            !useStore.getState().dirty
          ) {
            useStore.getState().replace(p);
            useStore.getState().set({ saveStatus: 'Restored from local storage' });
          }
        }
      } catch (error) {
        if (active)
          useStore.getState().set({
            error: `Recovery could not open the last project: ${String(error)}. Your stored project has not been overwritten.`,
          });
      } finally {
        if (active) useStore.getState().set({ hydrated: true });
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!s.hydrated || !s.dirty) return;
    const timer = setTimeout(() => void save(project), 900);
    return () => clearTimeout(timer);
  }, [project, s.dirty, s.hydrated]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void save(useStore.getState().project, true);
      }
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
      }
      // Esc first cancels a pending click sequence; with nothing pending it leaves the mode.
      const state = useStore.getState();
      if (e.key === 'Escape' && state.wiringTool !== 'off' && !state.showModelTools) {
        if (state.wiringSource || state.wiringLineStart || typing)
          state.set({
            wiringSource: null,
            wiringLineStart: null,
            notice: 'Pending wiring action cancelled.',
          });
        else {
          exitViewportMode();
          state.set({ notice: 'Wiring mode closed.' });
        }
        return;
      }
      if (e.key === 'Escape' && state.showModelTools) {
        if (state.measureStart || state.modelPreview || state.modelTool !== 'select' || typing)
          state.set({
            measureStart: null,
            modelPreview: null,
            modelTool: 'select',
            notice: 'Pending modelling action cancelled.',
          });
        else {
          exitViewportMode();
          state.set({ notice: 'Modelling tools closed.' });
        }
        return;
      }
      if (e.key === 'Escape')
        useStore
          .getState()
          .set({ selection: null, dragDefinitionId: null, dragDeviceId: null, previewU: null });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  async function newProject(example = false) {
    if (!(await save(project))) return;
    const next = example ? createExampleProject(true) : createWorkspaceProject(false);
    if (example) {
      next.settings.cablePrefix = '';
      next.cables.forEach((c, i) => {
        c.label = String(i);
        c.name = `Cable ${i}`;
      });
    }
    set({
      project: next,
      past: [],
      future: [],
      selection: null,
      dirty: true,
      workspace: 'designer',
      notice: example
        ? 'Explicit stepped demonstration loaded; all physical dimensions are examples.'
        : 'New rack created without a depth step. Depth is front-to-rear screw-plane spacing.',
      error: '',
    });
  }
  async function openProjects() {
    try {
      setSavedProjects(await repository.list());
      setDialog('open');
    } catch (error) {
      set({ error: `Unable to list local projects: ${String(error)}` });
    }
  }
  async function importProject(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 30_000_000) throw new Error('Project exceeds the 30 MB import limit.');
      const p = parseProject(await file.text());
      if (!(await save(project))) return;
      s.replace(p);
      set({
        dirty: true,
        workspace: 'designer',
        notice: 'Project imported; embedded assets and physical connection records restored.',
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  const editingReport =
    workspace !== 'designer' &&
    workspace !== 'library' &&
    workspace !== 'settings' &&
    workspace !== 'power' &&
    s.selection?.kind === 'cable';
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-symbol">
            <Icon name="cube" size={25} />
          </span>
          <strong>
            rack<span>studio</span>
          </strong>
          <span className="brand-divider" />
          <span className="header-description">Engineering workspace</span>
        </div>
        <div className="header-project">
          <span className="project-dot" />
          <span>{project.name}</span>
          <Badge>LOCAL PROJECT</Badge>
        </div>
        <button
          className="avatar"
          data-tooltip="Local project settings"
          aria-label="Project settings"
          onClick={() => set({ workspace: 'settings', selection: null })}
        >
          RS
        </button>
      </header>
      <div className="project-toolbar">
        <div className="button-row">
          <Button className="ghost" icon="plus" onClick={() => void newProject()}>
            New
          </Button>
          <Button className="ghost" icon="folder" onClick={() => void openProjects()}>
            Open
          </Button>
          <Button
            className="ghost"
            icon="save"
            data-tooltip="Save locally (Ctrl+S)"
            onClick={() => void save(project, true)}
          >
            Save
          </Button>
          <span className="toolbar-divider" />
          <label className="button ghost">
            <Icon name="upload" />
            Import
            <input
              aria-label="Import project JSON"
              type="file"
              hidden
              accept="application/json,.json"
              onChange={(e) => {
                void importProject(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <Button
            className="ghost"
            icon="download"
            onClick={() =>
              download(
                `${project.name.replaceAll(/[^a-z0-9]/gi, '-')}.rack.json`,
                serializeProject(project),
                'application/json',
              )
            }
          >
            Export project
          </Button>
          <span className="toolbar-divider" />
          <IconButton
            icon="undo"
            size={18}
            label="Undo"
            tooltip="Undo (Ctrl+Z)"
            disabled={s.past.length === 0}
            onClick={s.undo}
          />
          <IconButton
            icon="redo"
            size={18}
            label="Redo"
            tooltip="Redo (Ctrl+Shift+Z)"
            disabled={s.future.length === 0}
            onClick={s.redo}
          />
        </div>
        <div className="toolbar-save">
          <span className={s.dirty ? 'unsaved-dot' : 'saved-dot'} />
          {s.saveStatus}
          <button
            className="help-button"
            onClick={() => setDialog('help')}
            aria-label="Quick guide"
            data-tooltip="Quick guide and shortcuts"
          >
            ?
          </button>
        </div>
      </div>
      <nav className="workspace-tabs" aria-label="Workspace">
        {tabs.map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() =>
              set({
                workspace: id,
                ...(['library', 'settings'].includes(id) ? { selection: null } : {}),
              })
            }
            className={workspace === id ? 'active' : ''}
          >
            <Icon name={icon} size={17} />
            {label}
            {id === 'schedule' && <span>{project.cables.length}</span>}
          </button>
        ))}
      </nav>
      <div className="accuracy-banner">
        <Icon name="alert" size={16} />
        <strong>
          {project.rack.evidence === 'verified'
            ? 'Model verification'
            : 'Illustrative engineering model'}
        </strong>
        <span>
          {project.rack.evidence === 'verified'
            ? 'Cable specifications and routes must also be verified.'
            : 'Rack construction, equipment dimensions and port positions need confirmation. Calculations describe this model.'}
        </span>
        <button onClick={() => set({ workspace: 'settings', selection: null })}>
          Review specifications <Icon name="chevron" size={14} />
        </button>
      </div>
      <div
        className={`workspace-body ${workspace === 'designer' ? `designer-layout ${libraryOpen ? '' : 'library-collapsed'} ${inspectorOpen ? '' : 'inspector-collapsed'}` : editingReport ? 'report-layout' : ''}`}
        style={workspace === 'designer' ? panelStyle : undefined}
      >
        {workspace === 'designer' ? (
          <>
            {libraryOpen ? (
              <div className="side-panel left">
                <Library onCollapse={() => setLibraryOpen(false)} />
                <ResizeHandle
                  label="Resize equipment library"
                  side="left"
                  width={libraryWidth ?? 244}
                  min={200}
                  max={420}
                  onChange={setLibraryWidth}
                />
              </div>
            ) : (
              <button
                className="side-rail left"
                aria-label="Expand equipment library"
                data-tooltip="Expand equipment library"
                onClick={() => setLibraryOpen(true)}
              >
                <Icon name="panel-right" size={18} />
                <span>Equipment library</span>
              </button>
            )}
            <div className="designer-centre">
              <div className="designer-heading">
                <div>
                  <span className="eyebrow">RACK DESIGN</span>
                  <h1>
                    {project.rack.name}
                    <Badge>{project.rack.heightU}U</Badge>
                  </h1>
                </div>
                <div className="button-row">
                  <Button icon="cable" onClick={() => setDialog('connection')}>
                    Connect
                  </Button>
                  <details
                    className="add-menu"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) e.currentTarget.open = false;
                    }}
                  >
                    <summary className="button">
                      <Icon name="plus" />
                      Add object
                    </summary>
                    <div>
                      <button onClick={() => setDialog('exit')}>Rack cable exit</button>
                      <button onClick={() => setDialog('destination')}>External destination</button>
                      <button
                        onClick={() => {
                          if (
                            edit('Tray added; edit its dimensions in properties.', (p) =>
                              addAccessory(p, 'tray'),
                            )
                          )
                            set({
                              selection: {
                                kind: 'accessory',
                                id: useStore.getState().project.accessories.at(-1)!.id,
                              },
                            });
                        }}
                      >
                        Cable tray
                      </button>
                      <button
                        onClick={() => {
                          if (
                            edit('Physical obstruction added.', (p) =>
                              addAccessory(p, 'obstruction'),
                            )
                          )
                            set({
                              selection: {
                                kind: 'accessory',
                                id: useStore.getState().project.accessories.at(-1)!.id,
                              },
                            });
                        }}
                      >
                        Measured obstruction
                      </button>
                    </div>
                  </details>
                </div>
              </div>
              <Suspense fallback={<div className="scene-fallback">Loading 3D workspace…</div>}>
                <Scene />
              </Suspense>
              <div className="installed-strip">
                <div>
                  <Icon name="layers" size={16} />
                  <strong>Installed equipment</strong>
                  <span>{project.devices.length}</span>
                </div>
                <div className="installed-pills">
                  {project.devices.map((d) => (
                    <button
                      className={
                        s.selection?.kind === 'device' && s.selection.id === d.id ? 'active' : ''
                      }
                      key={d.id}
                      onClick={() => set({ selection: { kind: 'device', id: d.id } })}
                    >
                      <span>U{d.startU}</span>
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {inspectorOpen ? (
              <div className="side-panel right">
                <ResizeHandle
                  label="Resize properties panel"
                  side="right"
                  width={inspectorWidth ?? 288}
                  min={260}
                  max={520}
                  onChange={setInspectorWidth}
                />
                <Inspector onCollapse={() => setInspectorOpen(false)} />
              </div>
            ) : (
              <button
                className="side-rail right"
                aria-label="Expand properties panel"
                data-tooltip="Expand properties panel"
                onClick={() => setInspectorOpen(true)}
              >
                <Icon name="panel-left" size={18} />
                <span>
                  Properties
                  {s.selection
                    ? ` · ${s.selection.kind === 'device' ? 'equipment' : s.selection.kind}`
                    : ''}
                </span>
              </button>
            )}
          </>
        ) : workspace === 'model' ? (
          <Suspense fallback={<p>Loading model designer…</p>}>
            <ModelDesigner />
          </Suspense>
        ) : workspace === 'library' ? (
          <Library expanded />
        ) : workspace === 'settings' ? (
          <div className="settings-workspace">
            <div className="report-heading">
              <div>
                <span className="eyebrow">PROJECT</span>
                <h1>Project settings</h1>
                <p>Physical specifications, provenance and portable project data.</p>
              </div>
              <Button icon="refresh" onClick={() => void newProject(true)}>
                Load stepped example
              </Button>
            </div>
            <div className="settings-grid">
              <section className="surface">
                <h2>Project information</h2>
                <Field label="Project name">
                  <input
                    value={project.name}
                    onChange={(e) =>
                      edit('Project name updated.', (p) => {
                        p.name = e.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Author / organisation">
                  <input
                    value={project.settings.author}
                    onChange={(e) =>
                      edit('Project author updated.', (p) => {
                        p.settings.author = e.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Cable numbering prefix">
                  <input
                    value={project.settings.cablePrefix}
                    onChange={(e) =>
                      edit('Cable ID prefix updated.', (p) => {
                        p.settings.cablePrefix = e.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Engineering notes">
                  <textarea
                    rows={5}
                    value={project.settings.notes}
                    onChange={(e) =>
                      edit('Project notes updated.', (p) => {
                        p.settings.notes = e.target.value;
                      })
                    }
                  />
                </Field>
                <div className="callout">
                  <Icon name="save" />
                  <span>
                    Autosave uses this browser’s IndexedDB. Export JSON for a portable backup,
                    including embedded equipment images.
                  </span>
                </div>
                <Button
                  icon="download"
                  onClick={() =>
                    download(
                      'equipment-list.csv',
                      csv([
                        [
                          'Name',
                          'Definition',
                          'U',
                          'Face',
                          'Mounting',
                          'Width mm',
                          'Height mm',
                          'Depth mm',
                          'Evidence',
                        ],
                        ...project.devices.map((d) => {
                          const def = project.definitions.find((v) => v.id === d.definitionId)!;
                          return [
                            d.name,
                            def.name,
                            d.startU,
                            d.face,
                            def.mounting,
                            def.widthMm,
                            def.heightMm,
                            def.depthMm,
                            def.evidence,
                          ];
                        }),
                      ]),
                      'text/csv',
                    )
                  }
                >
                  Export equipment list
                </Button>
                <div className="section-title">
                  <h3>Implementation boundary</h3>
                  <Badge tone="warn">Foundation milestone</Badge>
                </div>
                <p className="muted">
                  This version includes deterministic geometry checks and routing, not a validated
                  flexible-cable dynamics simulator. Installation state animations, calibrated photo
                  modelling, imported 3D assets, interactive cable anchors/looms, XLSX/PDF reports
                  and cloud accounts remain open requirements.
                </p>
                <p className="muted">
                  Do not use illustrative dimensions as installation measurements. Rack mounting
                  standard, depth construction and hardware compatibility require verified
                  references.
                </p>
              </section>
              <section className="surface">
                <h2>Rack specifications</h2>
                <RackInspector key={`${project.id}-${project.revision}`} full />
              </section>
            </div>
          </div>
        ) : (
          <Reports key={workspace} workspace={workspace} />
        )}
        {editingReport && <Inspector />}
      </div>
      {s.error && (
        <div className="error-toast" role="alert">
          <Icon name="alert" />
          <span>{s.error}</span>
          <IconButton icon="x" label="Dismiss error" onClick={() => set({ error: '' })} />
        </div>
      )}
      <footer className="statusbar">
        <div>
          <span className="saved-dot" />
          <span>{s.notice}</span>
        </div>
        <div>
          <span>mm</span>
          <span>U1 at bottom</span>
          <span>{project.devices.length} devices</span>
          <span>{project.cables.length} cables</span>
          <span className="warning-text">
            {analysis.cables.filter((c) => c.status !== 'Calculated').length} to review
          </span>
          {analysis.power.issues.length > 0 && (
            <span
              className={
                analysis.power.issues.some((i) => i.severity === 'error')
                  ? 'error-text'
                  : 'warning-text'
              }
              title={analysis.power.issues.map((i) => i.message).join('\n')}
              data-testid="power-issues"
            >
              {analysis.power.issues.length} power to review
            </span>
          )}
          <span>v0.1 · foundation</span>
        </div>
      </footer>
      {dialog === 'open' && (
        <Modal title="Open local project" onClose={() => setDialog(null)}>
          <div className="modal-content">
            {savedProjects.length === 0 ? (
              <p className="empty-note">No local projects yet. Save this project to add it here.</p>
            ) : (
              savedProjects.map((p) => (
                <button
                  className="saved-project"
                  key={p.id}
                  onClick={async () => {
                    try {
                      if (!(await save(project))) return;
                      const loaded = await repository.load(p.id);
                      if (loaded) {
                        s.replace(loaded);
                        set({ workspace: 'designer', saveStatus: 'Opened from local storage' });
                        setDialog(null);
                      }
                    } catch (error) {
                      set({ error: String(error) });
                    }
                  }}
                >
                  <Icon name="folder" />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{new Date(p.updatedAt).toLocaleString('en-GB')}</small>
                  </span>
                  <Icon name="chevron" />
                </button>
              ))
            )}
          </div>
        </Modal>
      )}
      {dialog === 'connection' && <ConnectionDialog onClose={() => setDialog(null)} />}{' '}
      {dialog === 'destination' && <DestinationDialog onClose={() => setDialog(null)} />}{' '}
      {dialog === 'exit' && <ExitDialog onClose={() => setDialog(null)} />} <TooltipLayer />
      {dialog === 'help' && (
        <Modal title="Rack Studio · quick guide" onClose={() => setDialog(null)}>
          <Guide />
        </Modal>
      )}
    </div>
  );
}
function Guide() {
  const items: [string, ReactNode][] = [
    [
      'Configure the rack',
      'Use the properties panel to set dimensions, depth sections and the mounting hole type. Unconfirmed mounting details block new installations.',
    ],
    [
      'Install equipment',
      'Drag a library item onto a U position in the rack, or use + on its card to place it by U number. Choose Mount: Front or Mount: Rear in the viewport toolbar before dropping. Orbit with left drag, pan with right drag and zoom with the wheel. Select installed equipment to edit its U position.',
    ],
    [
      'Wiring and tools',
      'Wiring connects ports (click the source port, then the destination), places surface waypoints (Shift-click two points for a line guide) and links cables to guides. Tools move, rotate and measure. The pill in the viewport says what the next click does; Esc cancels a pending click, and Esc again or Exit leaves the mode.',
    ],
    [
      'Connect and document',
      'Use Connect to choose two defined ports. Edit route waypoints, cable supply, external distance and allowances in cable properties. Red routes need correction.',
    ],
    [
      'Review materials',
      'Schedule, cut list and procurement use the same cable records. Unknown external runs stay provisional. Power & Weights lists each device’s draw, mass and feeding bank. Export the complete CSV reports or a portable JSON project.',
    ],
    [
      'Save and recover',
      'Ctrl+S saves locally; edits autosave. Ctrl+Z and Ctrl+Shift+Z undo and redo. Keep exported JSON backups for use in another browser.',
    ],
  ];
  return (
    <div className="modal-content guide">
      {items.map(([title, text], i) => (
        <div key={title}>
          <span>{i + 1}</span>
          <section>
            <h3>{title}</h3>
            <p>{text}</p>
          </section>
        </div>
      ))}
    </div>
  );
}
