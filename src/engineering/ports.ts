import type { Port } from '../model';

/** Clockwise when viewed from outside the connector face. Legacy ports use zero. */
export const portRotationDeg = (p: Port) => (((p.rotationDeg ?? 0) % 360) + 360) % 360;
export const portFaceAngle = (p: Port) => (-portRotationDeg(p) * Math.PI) / 180;
export const portPanelAngle = (p: Port) => (p.surface === 'front' ? -1 : 1) * portFaceAngle(p);
export const portSize = (p: Port): [number, number] => [
  p.widthMm ?? (p.connector.startsWith('IEC') ? 21 : 11),
  p.heightMm ?? (p.connector.startsWith('IEC') ? 14 : 9),
];
export function portFootprint(p: Port): [number, number] {
  const [w, h] = portSize(p),
    a = portFaceAngle(p),
    c = Math.abs(Math.cos(a)) < 1e-12 ? 0 : Math.abs(Math.cos(a)),
    s = Math.abs(Math.sin(a)) < 1e-12 ? 0 : Math.abs(Math.sin(a));
  return [w * c + h * s, w * s + h * c];
}
/** XY aperture in chassis coordinates; front and rear use opposite viewed normals. */
export function portPanelCorners(p: Port, padding = 0): [number, number][] {
  const [w, h] = portSize(p),
    a = portPanelAngle(p),
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ].map(([x, y]) => {
    const dx = x * (w / 2 + padding),
      dy = y * (h / 2 + padding);
    return [p.position[0] + dx * c - dy * s, p.position[1] + dx * s + dy * c];
  });
}
