import { lazy, Suspense, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../state';
import type { Workspace } from '../state';
import { createExampleProject, createWorkspaceProject } from '../examples';
import { repository } from '../data/storage';
import type { ProjectSummary } from '../data/storage';
import { parseProject, serializeProject } from '../data/project';
import { removeRetiredEquipment, retiredNotice } from '../data/retired';
import type { Project } from '../model';
import Library from './Library';
import Inspector, { RackInspector, addAccessory } from './Inspector';
import Reports from './Reports';
import { ConnectionDialog, DestinationDialog, ExitDialog } from './Forms';
import { Button, Icon, IconButton, Badge, Field, Modal, TooltipLayer, download } from './shared';
import { analyseProject, csv } from '../engineering/analysis';
import { ResizeHandle, useStoredState } from './Panels';
import { FileMenu } from './FileMenu';
import { exitViewportMode } from './ViewportMode';
import RackElevations from './RackElevations';

/** Workspace views, grouped under five top-level tabs. View ids are unchanged state values. */
const views: Record<Workspace, [string, string]> = {
  designer: ['3D Rack Designer', 'cube'],
  library: ['Device Library', 'box'],
  model: ['Device Model Designer', 'cube'],
  schedule: ['Cable Schedule', 'grid'],
  connections: ['Connections', 'cable'],
  cuts: ['Cut List', 'ruler'],
  procurement: ['Procurement', 'reel'],
  power: ['Power & Weights', 'bolt'],
  settings: ['Project Settings', 'settings'],
};
const groups: { id: string; label: string; icon: string; views: Workspace[] }[] = [
  { id: 'designer', label: '3D Rack Designer', icon: 'cube', views: ['designer'] },
  { id: 'equipment', label: 'Equipment', icon: 'box', views: ['library', 'model'] },
  { id: 'cabling', label: 'Cabling', icon: 'cable', views: ['schedule', 'connections'] },
  { id: 'reports', label: 'Reports', icon: 'grid', views: ['cuts', 'procurement', 'power'] },
  { id: 'project', label: 'Project Settings', icon: 'settings', views: ['settings'] },
];
const groupOf = (view: Workspace) => groups.find((g) => g.views.includes(view)) ?? groups[0];
const Scene = lazy(() => import('./Scene'));
const ModelDesigner = lazy(() => import('./ModelDesigner'));
let persistenceRequested = false;
/** Once work exists, ask the browser not to evict this origin's IndexedDB under storage pressure. */
function requestPersistentStorage() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  void navigator.storage?.persist?.().catch(() => false);
}
/** Opening a saved or imported project removes equipment retired from Rack Studio. */
function withoutRetired(p: Project): { project: Project; notice: string } {
  const result = removeRetiredEquipment(p);
  return { project: result.project, notice: retiredNotice(result) };
}
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
    requestPersistentStorage();
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
  const [designView, setDesignView] = useStoredState<'3d' | '2d'>('rack-studio-design-view', '3d');
  // The last view opened in each top-level tab, so returning to a tab restores it.
  const [lastViews, setLastViews] = useStoredState<Record<string, string>>(
    'rack-studio-last-views',
    {},
  );
  const activeGroup = groupOf(workspace);
  const openView = (id: Workspace) => {
    setLastViews({ ...lastViews, [groupOf(id).id]: id });
    set({ workspace: id, ...(['library', 'settings'].includes(id) ? { selection: null } : {}) });
  };
  const panelStyle = {
    ...(libraryWidth && libraryOpen ? { '--library-w': `${libraryWidth}px` } : {}),
    ...(inspectorWidth && inspectorOpen ? { '--inspector-w': `${inspectorWidth}px` } : {}),
  } as CSSProperties;
  const analysis = analyseProject(project);
  const verified = project.rack.evidence === 'verified';
  const [bannerHidden, setBannerHidden] = useState(() => {
    try {
      return sessionStorage.getItem('rack-studio-accuracy-hidden') === '1';
    } catch {
      return false;
    }
  });
  const hideBanner = (hidden: boolean) => {
    setBannerHidden(hidden);
    try {
      sessionStorage.setItem('rack-studio-accuracy-hidden', hidden ? '1' : '0');
    } catch {
      // Storage unavailable: the choice lasts until reload.
    }
  };
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
            const retired = withoutRetired(p);
            useStore.getState().replace(retired.project);
            useStore.getState().set({
              saveStatus: 'Restored from local storage',
              notice: retired.notice || 'Reopened your last project.',
              ...(retired.notice ? { dirty: true } : {}),
            });
            return;
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
  async function newProject(kind: 'blank' | 'tutorial' | 'stepped' = 'blank') {
    // An untouched project has nothing to keep, so switching away does not store it.
    const pristine = project.revision === 0 && !s.dirty;
    if (!pristine && !(await save(project))) return;
    const example = kind === 'stepped';
    const next = example ? createExampleProject(true) : createWorkspaceProject(kind === 'tutorial');
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
        : kind === 'tutorial'
          ? 'Tutorial rack opened as a separate project; your other projects are unchanged. All physical dimensions are examples.'
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
      const retired = withoutRetired(parseProject(await file.text()));
      if (!(await save(project))) return;
      s.replace(retired.project);
      set({
        dirty: true,
        workspace: 'designer',
        notice: [
          'Project imported; embedded assets and physical connection records restored.',
          retired.notice,
        ]
          .filter(Boolean)
          .join(' '),
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
  if (!s.hydrated)
    return (
      <div className="app-loading" role="status">
        Opening Rack Studio…
      </div>
    );
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-symbol">
            <Icon name="cube" size={23} />
          </span>
          <strong>
            rack<span>studio</span>
          </strong>
        </div>
        <FileMenu
          onNew={() => void newProject()}
          onOpen={() => void openProjects()}
          onTutorial={() => void newProject('tutorial')}
          onSave={() => void save(project, true)}
          onImport={(file) => void importProject(file)}
          onExport={() =>
            download(
              `${project.name.replaceAll(/[^a-z0-9]/gi, '-')}.rack.json`,
              serializeProject(project),
              'application/json',
            )
          }
        />
        <nav className="workspace-tabs" aria-label="Workspace">
          {groups.map((g) => (
            <button
              key={g.id}
              aria-current={activeGroup.id === g.id ? 'page' : undefined}
              onClick={() =>
                openView(
                  g.views.includes(lastViews[g.id] as Workspace)
                    ? (lastViews[g.id] as Workspace)
                    : g.views[0],
                )
              }
              className={activeGroup.id === g.id ? 'active' : ''}
            >
              <Icon name={g.icon} size={16} />
              {g.label}
              {g.id === 'cabling' && <span>{project.cables.length}</span>}
            </button>
          ))}
        </nav>
        <div className="header-actions">
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
          <span className="toolbar-divider" />
          <div className="toolbar-save" role="status">
            <span className={s.dirty ? 'unsaved-dot' : 'saved-dot'} />
            {s.saveStatus}
          </div>
          <button
            className="help-button"
            onClick={() => setDialog('help')}
            aria-label="Quick guide"
            data-tooltip="Quick guide and shortcuts"
          >
            ?
          </button>
          <button
            className="avatar"
            data-tooltip="Project settings"
            aria-label="Project settings"
            onClick={() => openView('settings')}
          >
            RS
          </button>
        </div>
      </header>
      {activeGroup.views.length > 1 && (
        <nav className="workspace-subtabs" aria-label={`${activeGroup.label} views`}>
          {activeGroup.views.map((id) => (
            <button
              key={id}
              aria-current={workspace === id ? 'page' : undefined}
              className={workspace === id ? 'active' : ''}
              onClick={() => openView(id)}
            >
              <Icon name={views[id][1]} size={15} />
              {views[id][0]}
            </button>
          ))}
        </nav>
      )}
      {!bannerHidden && (
        <div className="accuracy-banner" role="note">
          <Icon name="alert" size={16} />
          <strong>{verified ? 'Model verification' : 'Illustrative engineering model'}</strong>
          <span>
            {verified
              ? 'Cable specifications and routes must also be verified.'
              : 'Rack construction, equipment dimensions and port positions need confirmation. Calculations describe this model.'}
          </span>
          <button onClick={() => set({ workspace: 'settings', selection: null })}>
            Review specifications <Icon name="chevron" size={14} />
          </button>
          <IconButton
            icon="x"
            size={14}
            label="Hide accuracy notice for this session"
            tooltip="Hide for this session · the status-bar badge keeps it available"
            onClick={() => hideBanner(true)}
          />
        </div>
      )}
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
            <div className={`designer-centre view-${designView}`}>
              <div className="designer-heading">
                <span className="eyebrow">DESIGN ZONE</span>
                <div className="design-view-switch" role="group" aria-label="Design view">
                  {(['3d', '2d'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={designView === v}
                      data-tooltip={v === '3d' ? '3D rack view' : '2D front and rear elevations'}
                      onClick={() => {
                        // Wiring and modelling tools act on the 3D scene, so leave them first.
                        if (v === '2d') exitViewportMode();
                        setDesignView(v);
                      }}
                    >
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="designer-toolbar" id="designer-toolbar" />
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
              {/* The 3D scene stays mounted in 2D so the camera is kept; CSS hides it. */}
              <Suspense fallback={<div className="scene-fallback">Loading 3D workspace…</div>}>
                <Scene />
              </Suspense>
              {designView === '2d' && <RackElevations />}
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
                <div className="header-project">
                  <span className="project-dot" />
                  <strong>{project.name}</strong>
                  <Badge>LOCAL PROJECT</Badge>
                  <Badge tone={verified ? 'good' : 'warn'}>
                    {verified ? 'Rack verified · verify cables' : 'Illustrative model'}
                  </Badge>
                </div>
              </div>
              <Button icon="refresh" onClick={() => void newProject('stepped')}>
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
          <button
            className={`accuracy-badge ${verified ? 'verified' : ''}`}
            aria-expanded={!bannerHidden}
            aria-label={`${verified ? 'Model verification' : 'Illustrative engineering model'}: ${bannerHidden ? 'show' : 'hide'} accuracy notice`}
            data-tooltip={
              verified
                ? 'Rack marked verified; cable specifications and routes must also be verified'
                : 'Dimensions and port positions need confirmation · click to show the notice'
            }
            onClick={() => hideBanner(!bannerHidden)}
          >
            <Icon name="alert" size={12} />
            {verified ? 'Verify cables' : 'Illustrative model'}
          </button>
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
                        const retired = withoutRetired(loaded);
                        s.replace(retired.project);
                        set({
                          workspace: 'designer',
                          saveStatus: 'Opened from local storage',
                          ...(retired.notice ? { notice: retired.notice, dirty: true } : {}),
                        });
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
      'Use the properties panel to set dimensions, depth sections and the mounting hole type. Unconfirmed mounting details block new installations. File → Tutorial rack opens a worked example as a separate project.',
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
