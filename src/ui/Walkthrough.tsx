import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

/** Set once the tour is finished or skipped, so it only opens by itself on a first visit. */
export const TOUR_DONE_KEY = 'rack-studio-tour-done';

export function tourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markTourDone() {
  try {
    localStorage.setItem(TOUR_DONE_KEY, '1');
  } catch {
    // Storage can be unavailable (private mode); the tour then simply offers itself again.
  }
}

interface Step {
  /** CSS selector of the area to highlight; omitted for a centred step. */
  target?: string;
  title: string;
  body: string;
}

export const tourSteps: Step[] = [
  {
    title: 'Welcome to Rack Studio',
    body: 'You are starting with an empty 20U rack. This short tour points out the main areas. Replay it any time from the ? button.',
  },
  {
    target: '[data-tour="file"]',
    title: 'File menu',
    body: 'New, Open, Save, Import and Export project. Work autosaves to this browser; export a project file to back it up or move it to another computer.',
  },
  {
    target: '[data-tour="tabs"]',
    title: 'Workspaces',
    body: '3D Rack Designer is where you build. Equipment holds the device library and model designer, Cabling the cable schedule and connections, and Reports the cut list, procurement and Power & Weights. Project Settings holds the rack and project details.',
  },
  {
    target: '[data-tour="library"]',
    title: 'Equipment library',
    body: 'Search or filter the equipment, then drag a card into the rack, or use its + button to place it at an exact U. The Installed tab lists what is already in the rack.',
  },
  {
    target: '[aria-label="Import STEP model"]',
    title: 'Import STEP model',
    body: 'Add a manufacturer CAD model (.stp or .step). It is read in your browser and nothing is uploaded. Choose whether it has rack ears or stands on a shelf.',
  },
  {
    target: '[data-tour="design-zone"]',
    title: 'Design zone',
    body: 'Left-drag to orbit, right-drag to pan and use the wheel to zoom. Click equipment to select it. The view cube and the toolbar switch camera views and tools.',
  },
  {
    target: '[data-tour="view-switch"]',
    title: '3D and 2D views',
    body: 'Switch to flat front and rear elevations. Drag library cards or installed equipment onto a face: green shows the drop fits, red explains why it does not.',
  },
  {
    target: '[data-tour="connect"]',
    title: 'Connect and add objects',
    body: 'Connect joins two ports with a cable. Add object adds rack cable exits, external destinations, trays and obstructions. Cables then appear in the Cabling and Reports workspaces.',
  },
  {
    target: '[data-tour="properties"]',
    title: 'Properties',
    body: 'Edit whatever is selected: the rack when nothing is selected, or the equipment or cable you click. Rack size, depth and mounting hole type are set here.',
  },
  {
    target: '[data-tour="save"]',
    title: 'Undo, save and help',
    body: 'Undo and redo, the save status and the ? quick guide. That is the tour; drag something from the library to start.',
  },
];

const GAP = 12;
const MARGIN = 12;

/** Places the card below, above, right or left of the target, or inside it when none fits. */
function placeCard(target: DOMRect | null, w: number, h: number): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - w - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - h - MARGIN);
  if (!target) return { left: (vw - w) / 2, top: (vh - h) / 2 };
  const centreX = clampX(target.left + target.width / 2 - w / 2);
  const centreY = clampY(target.top + target.height / 2 - h / 2);
  if (target.bottom + GAP + h <= vh - MARGIN) return { left: centreX, top: target.bottom + GAP };
  if (target.top - GAP - h >= MARGIN) return { left: centreX, top: target.top - GAP - h };
  if (target.right + GAP + w <= vw - MARGIN) return { left: target.right + GAP, top: centreY };
  if (target.left - GAP - w >= MARGIN) return { left: target.left - GAP - w, top: centreY };
  return { left: centreX, top: clampY(target.top + GAP * 3) };
}

export function Walkthrough({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<DOMRect | null>(null);
  const [cardStyle, setCardStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = tourSteps[index];
  const last = index === tourSteps.length - 1;
  const close = () => {
    markTourDone();
    onClose();
  };
  useLayoutEffect(() => {
    const measure = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      const rect = el?.getBoundingClientRect() ?? null;
      setTarget(rect && rect.width > 0 && rect.height > 0 ? rect : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [step]);
  useLayoutEffect(() => {
    const el = card.current;
    if (el) setCardStyle(placeCard(target, el.offsetWidth, el.offsetHeight));
  }, [target, index]);
  useEffect(() => next.current?.focus(), [index]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowRight' && !last) setIndex((i) => i + 1);
      else if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  return (
    <div className="tour">
      <div className={`tour-backdrop ${target ? '' : 'dim'}`} />
      {target && (
        <div
          className="tour-spotlight"
          style={{
            left: target.left - 4,
            top: target.top - 4,
            width: target.width + 8,
            height: target.height + 8,
          }}
        />
      )}
      <div
        className="tour-card"
        ref={card}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
      >
        <span className="tour-progress">
          {index + 1} of {tourSteps.length}
        </span>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={close}>
            {last ? 'Close' : 'Skip tour'}
          </button>
          {index > 0 && (
            <button type="button" className="button" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            className="button primary"
            ref={next}
            onClick={() => (last ? close() : setIndex(index + 1))}
          >
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
