import { useId, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { Icon } from './shared';

/**
 * Panel layout primitives: collapsible property sections, compact caveat notes and resizable
 * side-panel edges. Presentation only: nothing here reads or writes the project.
 */

const SECTION_KEY = 'rack-studio-panel-sections';

/** Read/write a small JSON value in localStorage; storage can be unavailable, so never throw. */
function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows or blocked storage: the preference simply is not remembered.
  }
}

/** UI preference remembered across sessions in this browser. */
export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));
  const update = (next: T) => {
    setValue(next);
    writeStored(key, next);
  };
  return [value, update] as const;
}

/**
 * A titled, collapsible group of fields. `id` is stable per section type (e.g. `cable.route`), so
 * the open state is remembered for that kind of section across selections and reloads. Collapsed
 * content stays mounted but hidden, keeping unapplied drafts.
 */
export function Section({
  id,
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(
    () => readStored<Record<string, boolean>>(SECTION_KEY, {})[id] ?? defaultOpen,
  );
  const bodyId = useId();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeStored(SECTION_KEY, {
      ...readStored<Record<string, boolean>>(SECTION_KEY, {}),
      [id]: next,
    });
  };
  return (
    <section className={`panel-section ${open ? 'open' : ''}`} data-section={id}>
      <h3 className="panel-section-heading">
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <Icon name="chevron" size={14} />
          <span>{title}</span>
        </button>
        {badge !== undefined && <span className="panel-section-badge">{badge}</span>}
      </h3>
      <div className="panel-section-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/**
 * A compact caveat. The one-line `summary` stays visible; the full explanation opens with "Why?".
 * Use tone `warn` for provisional/unverified data so it keeps the amber evidence colour.
 */
export function Note({
  summary,
  children,
  tone = 'info',
}: {
  summary: ReactNode;
  children?: ReactNode;
  tone?: 'info' | 'warn';
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className={`note ${tone}`}>
      <div className="note-row">
        <Icon name={tone === 'warn' ? 'alert' : 'info'} size={14} />
        <span>{summary}</span>
        {children && (
          <button
            type="button"
            className="note-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Less' : 'Why?'}
          </button>
        )}
      </div>
      {children && (
        <div className="note-body" id={bodyId} hidden={!open}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Drag or arrow-key handle on a side panel's inner edge. `side` is where the panel sits, so a
 * left panel grows when dragged right. Width is clamped to [min, max].
 */
export function ResizeHandle({
  label,
  side,
  width,
  min,
  max,
  onChange,
}: {
  label: string;
  side: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
}) {
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)));
  const start = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget,
      x0 = e.clientX,
      // Start from the rendered width: before the first resize it is the responsive CSS default.
      w0 = target.parentElement?.getBoundingClientRect().width ?? width;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
    const move = (ev: globalThis.PointerEvent) =>
      onChange(clamp(w0 + (side === 'left' ? 1 : -1) * (ev.clientX - x0)));
    const end = () => {
      document.body.classList.remove('is-resizing');
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === grow) onChange(clamp(width + step));
    else if (e.key === shrink) onChange(clamp(width - step));
    else if (e.key === 'Home') onChange(min);
    else if (e.key === 'End') onChange(max);
    else return;
    e.preventDefault();
  };
  return (
    <div
      className={`resize-handle ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      data-tooltip={`${label} · drag or use arrow keys`}
      onPointerDown={start}
      onKeyDown={key}
    />
  );
}
