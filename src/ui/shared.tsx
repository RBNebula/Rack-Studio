import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    cube: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7z" />
        <path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    save: (
      <>
        <path d="M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    folder: <path d="M3 7V4h6l2 3h10v13H3z" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4" />
      </>
    ),
    undo: (
      <>
        <path d="m8 4-5 5 5 5M3 9h11a7 7 0 0 1 7 7v4" />
      </>
    ),
    redo: (
      <>
        <path d="m16 4 5 5-5 5M21 9H10a7 7 0 0 0-7 7v4" />
      </>
    ),
    cable: (
      <>
        <path d="M6 3v4M3 3v4h6V3M6 7v4a5 5 0 0 0 10 0V7M13 3v4h6V3M16 3v4" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18" />
      </>
    ),
    box: (
      <>
        <path d="M3 5h18v14H3zM3 10h18" />
        <circle cx="6" cy="15" r=".5" />
        <path d="M10 15h7" />
      </>
    ),
    settings: (
      <>
        <path d="m10 2-1 3-3 1-3 1 1 4-1 3 3 2 2 3 4-1 3 1 2-3 3-2-1-4 1-3-3-1-2-3z" />
        <circle cx="12" cy="11" r="3" />
      </>
    ),
    check: <path d="m5 12 4 4 10-10" />,
    alert: (
      <>
        <path d="m12 3 10 18H2zM12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="13" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    x: <path d="m5 5 14 14M19 5 5 19" />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    ruler: (
      <>
        <path d="m3 16 13-13 5 5L8 21zM8 12l3 3M12 8l3 3M16 4l3 3" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    layers: (
      <>
        <path d="m2 7 10-5 10 5-10 5zM2 12l10 5 10-5M2 17l10 5 10-5" />
      </>
    ),
    reel: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
      </>
    ),
    bolt: <path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12z" />,
    home: (
      <>
        <path d="m3 11 9-7 9 7" />
        <path d="M5 9.5V20h14V9.5M10 20v-6h4v6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </>
    ),
    'panel-left': (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16M15 10l-2 2 2 2" />
      </>
    ),
    'panel-right': (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16M9 10l2 2-2 2" />
      </>
    ),
    mouse: (
      <>
        <rect x="6" y="3" width="12" height="18" rx="6" />
        <path d="M12 7v3" />
      </>
    ),
    printer: (
      <>
        <path d="M7 9V3h10v6" />
        <rect x="3" y="9" width="18" height="8" rx="1.5" />
        <path d="M7 14h10v7H7z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.box}
    </svg>
  );
}
/**
 * Text button. Variants (via className): default = secondary, `primary`, `ghost`, `danger`,
 * plus the `sm` size modifier. Icon-only actions use IconButton instead.
 */
export function Button({
  icon,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string }) {
  return (
    <button className={`button ${className}`} {...props}>
      {icon && <Icon name={icon} />} {children}
    </button>
  );
}
/**
 * Icon-only button. `label` is the accessible name and, unless `tooltip` overrides it, the
 * visible tooltip shown on hover and keyboard focus.
 */
export function IconButton({
  icon,
  label,
  tooltip,
  size = 16,
  className = '',
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: string;
  label: string;
  tooltip?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      data-tooltip={tooltip ?? label}
      {...props}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}
/**
 * One fixed-position tooltip for every element with `data-tooltip`. It is drawn outside
 * scrolling panels so it is never clipped, shows on hover and on keyboard focus, and renders
 * its text through CSS so it does not duplicate accessible names or page text.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{
    text: string;
    x: number;
    y: number;
    below: boolean;
    align: 'start' | 'center' | 'end';
  } | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null;
    const show = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null;
      if (el === current) return;
      current = el;
      const text = el?.dataset.tooltip;
      if (!el || !text) return setTip(null);
      const r = el.getBoundingClientRect();
      const below = r.top < 44;
      // Near a viewport edge, align the tooltip with the element's edge so it is not clipped.
      const align = r.left < 140 ? 'start' : r.right > window.innerWidth - 140 ? 'end' : 'center';
      const x = align === 'start' ? r.left : align === 'end' ? r.right : r.left + r.width / 2;
      setTip({ text, x, y: below ? r.bottom + 6 : r.top - 6, below, align });
    };
    const over = (e: Event) => show(e.target);
    const focus = (e: Event) => {
      if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) show(e.target);
    };
    const hide = () => {
      current = null;
      setTip(null);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);
  if (!tip) return null;
  return (
    <div
      className={`ui-tooltip ${tip.below ? 'below' : ''} ${tip.align}`}
      aria-hidden="true"
      data-text={tip.text}
      style={{ left: tip.x, top: tip.y }}
    />
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(value === null ? '' : String(value));
  }
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (draft.trim() && Number.isFinite(n) && n >= min && (max === undefined || n <= max))
            onChange(n);
          else setDraft(value === null ? '' : String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </Field>
  );
}
/** A number that may be unknown: an empty field commits null instead of zero. */
export function OptionalNumberField({
  label,
  value,
  onChange,
  min = 0,
  positive = false,
  step = 1,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  /** Reject zero as well as values below `min`. */
  positive?: boolean;
  step?: number;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(value === null ? '' : String(value));
  }
  return (
    <Field label={label} hint={hint ?? (value === null ? 'Unknown' : undefined)}>
      <input
        type="number"
        aria-label={label}
        value={draft}
        min={min}
        step={step}
        placeholder="Unknown"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (!draft.trim()) {
            if (value !== null) onChange(null);
          } else if (Number.isFinite(n) && n >= min && (!positive || n > 0)) {
            if (n !== value) onChange(n);
          }
          // Show the stored value again; an accepted edit replaces it when `value` updates,
          // while a value the caller refuses must not stay on screen.
          setDraft(value === null ? '' : String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </Field>
  );
}
/** Free text committed once on blur, so typing does not create one undo step per key. */
export function BlurTextField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(value);
  }
  return (
    <Field label={label} hint={hint}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </Field>
  );
}
export function TextField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'error';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <IconButton icon="x" size={18} label="Close dialog" onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
export function download(name: string, content: string | Blob, type = 'text/plain') {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const metres = (mm: number | null | undefined) =>
  mm == null ? 'Unknown' : `${(mm / 1000).toFixed(2)} m`;
