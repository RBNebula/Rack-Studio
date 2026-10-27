import { useStore } from '../state';
import { endpointLabel } from '../engineering/connectivity';
import { Icon, IconButton } from './shared';
import { WiringPanel } from './WiringPanel';
import { ModellingPanel } from './ModellingPanel';

/**
 * Viewport interaction modes: a labelled indicator of what the next click does, and the docked
 * drawer that holds the Wiring or Tools panel beside the canvas instead of over the rack.
 */

export type ViewportMode = 'wiring' | 'tools' | null;

export function viewportMode(s: { wiringTool: string; showModelTools: boolean }): ViewportMode {
  if (s.showModelTools) return 'tools';
  return s.wiringTool !== 'off' ? 'wiring' : null;
}

/** Leave Wiring or Tools entirely, discarding any pending (uncommitted) click sequence. */
export function exitViewportMode() {
  useStore.getState().set({
    wiringTool: 'off',
    wiringSource: null,
    wiringLineStart: null,
    showModelTools: false,
    modelTool: 'select',
    modelPreview: null,
    measureStart: null,
  });
}

const wiringTools = {
  select: 'Select',
  connect: 'Connect ports',
  waypoints: 'Waypoints',
  link: 'Link cable',
} as const;
const modelTools = {
  select: 'Select',
  translate: 'Move',
  rotate: 'Rotate',
  measure: 'Measure',
  anchor: 'Place clip',
  tie: 'Place tie',
} as const;

function useModeText() {
  const s = useStore();
  const mode = viewportMode(s);
  if (mode === 'wiring') {
    const tool = wiringTools[s.wiringTool as keyof typeof wiringTools] ?? s.wiringTool;
    const next =
      s.wiringTool === 'connect'
        ? s.wiringSource
          ? `from ${endpointLabel(s.project, s.wiringSource)}: click the destination port`
          : 'click the source port'
        : s.wiringTool === 'waypoints'
          ? s.wiringLineStart
            ? 'click the line end'
            : 'click a surface · Shift-click starts a line guide'
          : s.wiringTool === 'link'
            ? 'click guides in route order'
            : 'click a cable or guide to select it';
    return {
      mode,
      title: 'Wiring',
      tool,
      next,
      pending: Boolean(s.wiringSource || s.wiringLineStart),
    };
  }
  if (mode === 'tools') {
    const tool = modelTools[s.modelTool as keyof typeof modelTools] ?? s.modelTool;
    const next =
      s.modelTool === 'measure'
        ? s.measureStart
          ? 'click the second surface'
          : 'click the first surface'
        : s.modelTool === 'translate' || s.modelTool === 'rotate'
          ? s.selection
            ? 'drag the gizmo handles'
            : 'choose an object first'
          : s.modelTool === 'anchor' || s.modelTool === 'tie'
            ? 'click a physical surface to attach it'
            : 'click an object to select it';
    return {
      mode,
      title: 'Tools',
      tool,
      next,
      pending: Boolean(s.measureStart || s.modelPreview),
    };
  }
  return null;
}

/** "Wiring · Connect ports — click the source port", with an explicit exit. */
export function ModeIndicator() {
  const text = useModeText();
  if (!text) return null;
  return (
    <div className={`scene-mode-pill ${text.mode}`} role="status" aria-live="polite">
      <span className="scene-mode-dot" />
      <span className="scene-mode-text">
        <strong>
          {text.title} · {text.tool}
        </strong>
        <span> — {text.next}</span>
      </span>
      <button
        type="button"
        className="scene-mode-exit"
        aria-label={`Exit ${text.title.toLowerCase()} mode`}
        data-tooltip={text.pending ? 'Esc cancels the pending click; Esc again exits' : 'Esc'}
        onClick={exitViewportMode}
      >
        Exit <kbd>Esc</kbd>
      </button>
    </div>
  );
}

/** Docked side drawer for the active mode's panel; collapsible to a slim tab. */
export function SceneDrawer({
  collapsed,
  onCollapsedChange,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const s = useStore();
  const mode = viewportMode(s);
  if (!mode) return null;
  const title = mode === 'wiring' ? 'Wiring' : 'Modelling tools';
  if (collapsed)
    return (
      <div className="scene-drawer collapsed">
        <button
          type="button"
          className="scene-drawer-tab"
          aria-label={`Show ${title.toLowerCase()} panel`}
          data-tooltip={`Show ${title.toLowerCase()} panel`}
          onClick={() => onCollapsedChange(false)}
        >
          <Icon name="panel-right" size={16} />
          <span>{title}</span>
        </button>
      </div>
    );
  return (
    <div className="scene-drawer">
      <div className="scene-drawer-heading">
        <Icon name={mode === 'wiring' ? 'cable' : 'settings'} size={16} />
        <strong>{title}</strong>
        <IconButton
          icon="panel-left"
          size={16}
          label={`Hide ${title.toLowerCase()} panel`}
          tooltip={`Hide panel · ${title} stays active`}
          onClick={() => onCollapsedChange(true)}
        />
      </div>
      <div className="scene-drawer-body">
        <WiringPanel />
        <ModellingPanel />
      </div>
    </div>
  );
}
