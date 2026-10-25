import { lazy, Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
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
import { Button, Icon, Badge, Field, Modal, download } from './shared';
import { analyseProject, csv } from '../engineering/analysis';

const tabs: [Workspace, string, string][] = [
  ['designer', '3D Rack Designer', 'cube'],
  ['model', 'Device Model Designer', 'cube'],
  ['library', 'Device Library', 'box'],
  ['connections', 'Connections', 'cable'],
  ['schedule', 'Cable Schedule', 'grid'],
  ['cuts', 'Cut List', 'ruler'],
  ['procurement', 'Procurement', 'reel'],
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
      if (e.key === 'Escape' && useStore.getState().wiringTool !== 'off') {
        useStore.getState().set({
          wiringSource: null,
          wiringLineStart: null,
          notice: 'Pending wiring action cancelled.',
        });
        return;
      }
      if (e.key === 'Escape' && useStore.getState().showModelTools) {
        useStore.getState().set({
          measureStart: null,
          modelPreview: null,
          modelTool: 'select',
          notice: 'Pending modelling action cancelled.',
        });
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
          title="Local project settings"
          aria-label="Project settings"
          onClick={() => set({ workspace: 'settings', selection: null })}
        >
          RS
        </button>
      </header>
      <div className="project-toolbar">
        <div className="button-row">
          <Button icon="plus" onClick={() => void newProject()}>
            New
          </Button>
          <Button icon="folder" onClick={() => void openProjects()}>
            Open
          </Button>
          <Button icon="save" onClick={() => void save(project, true)}>
            Save
          </Button>
          <span className="toolbar-divider" />
          <label className="button">
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
          <button
            className="icon-button"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={s.past.length === 0}
            onClick={s.undo}
          >
            <Icon name="undo" />
          </button>
          <button
            className="icon-button"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            disabled={s.future.length === 0}
            onClick={s.redo}
          >
            <Icon name="redo" />
          </button>
        </div>
        <div className="toolbar-save">
          <span className={s.dirty ? 'unsaved-dot' : 'saved-dot'} />
          {s.saveStatus}
          <button className="help-button" onClick={() => setDialog('help')} title="Quick guide">
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
        className={`workspace-body ${workspace === 'designer' ? 'designer-layout' : editingReport ? 'report-layout' : ''}`}
      >
        {workspace === 'designer' ? (
          <>
            <Library />
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
            <Inspector />
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
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => set({ error: '' })}
          >
            <Icon name="x" />
          </button>
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
      {dialog === 'exit' && <ExitDialog onClose={() => setDialog(null)} />}{' '}
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
      'Drag a library item into the rack, or use its precise placement button. Rotate with left drag, pan with right drag and zoom with the wheel. Select installed equipment to edit its U position.',
    ],
    [
      'Connect and document',
      'Use Connect to choose two defined ports. Edit route waypoints, cable supply, external distance and allowances in cable properties. Red routes need correction.',
    ],
    [
      'Review materials',
      'Schedule, cut list and procurement use the same cable records. Unknown external runs stay provisional. Export the complete CSV reports or a portable JSON project.',
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
