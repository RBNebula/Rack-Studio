import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Icon } from './shared';

/**
 * Navigation cube in the viewport corner. It turns with the camera; clicking a face views the rack
 * from that side. The home button returns to the 3D view, and the menu lists every named view so
 * faces turned away, and keyboard users, can still reach them.
 */

export type CubeView = 'front' | 'rear' | 'left' | 'right' | 'top' | 'orbit';

// Faces in CSS space (x right, y down, z towards the viewer); world +Y up becomes CSS -Y.
// Directions match CameraRig: the front camera is at -Z, left at -X, right at +X, top at +Y.
const faces: { view: CubeView | null; label: string; transform: string }[] = [
  { view: 'front', label: 'Front', transform: 'rotateY(180deg)' },
  { view: 'rear', label: 'Rear', transform: 'rotateY(0deg)' },
  { view: 'right', label: 'Right', transform: 'rotateY(90deg)' },
  { view: 'left', label: 'Left', transform: 'rotateY(-90deg)' },
  { view: 'top', label: 'Top', transform: 'rotateX(90deg) rotateZ(180deg)' },
  { view: null, label: 'Bottom', transform: 'rotateX(-90deg)' },
];
const menu: [Exclude<CubeView, 'orbit'>, string][] = [
  ['front', 'Front'],
  ['rear', 'Rear'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['top', 'Top'],
];

/** Inside the Canvas: copies the camera orientation onto the cube every rendered frame. */
export function ViewCubeSync({ cube }: { cube: RefObject<HTMLDivElement | null> }) {
  const rotation = useRef(new THREE.Matrix4());
  useFrame(({ camera }) => {
    if (!cube.current) return;
    const e = rotation.current.extractRotation(camera.matrixWorldInverse).elements;
    // CSS = S·R·S with S = diag(1, -1, 1): flip the Y axis on both sides of the view rotation.
    const sign = [1, -1, 1];
    const m: number[] = [];
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 4; row++)
        m.push(row < 3 && col < 3 ? e[col * 4 + row] * sign[row] * sign[col] : row === col ? 1 : 0);
    cube.current.style.transform = `matrix3d(${m.map((v) => v.toFixed(6)).join(',')})`;
  });
  return null;
}

export function ViewCube({
  cube,
  view,
  disabled,
  onView,
}: {
  cube: RefObject<HTMLDivElement | null>;
  view: CubeView;
  disabled: boolean;
  onView: (view: CubeView) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [menuOpen]);
  return (
    <div className={`view-cube ${disabled ? 'disabled' : ''}`} ref={root}>
      <button
        className="view-cube-home"
        aria-label="Orbit 3D view"
        aria-pressed={view === 'orbit'}
        data-tooltip="3D view (home)"
        disabled={disabled}
        onClick={() => onView('orbit')}
      >
        <Icon name="home" size={16} />
      </button>
      {/* Faces are a pointer shortcut; the views menu is the accessible route to every view. */}
      <div className="view-cube-stage" aria-hidden="true">
        <div className="view-cube-body" ref={cube}>
          {faces.map((f) => (
            <div
              key={f.label}
              className={`view-cube-face ${f.view && f.view === view ? 'current' : ''} ${f.view ? '' : 'inert'}`}
              style={{ transform: `${f.transform} translateZ(var(--cube-half))` }}
              onClick={() => {
                if (f.view && !disabled) onView(f.view);
              }}
            >
              {f.label}
            </div>
          ))}
        </div>
      </div>
      <button
        className="view-cube-menu-button"
        aria-label="Camera views"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        data-tooltip="Camera views"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Icon name="chevron" size={12} />
      </button>
      <div className="view-cube-menu" role="group" aria-label="Camera views" hidden={!menuOpen}>
        {menu.map(([id, label]) => (
          <button
            key={id}
            aria-label={`${label} view`}
            aria-pressed={view === id}
            disabled={disabled}
            onClick={() => {
              setMenuOpen(false);
              onView(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
