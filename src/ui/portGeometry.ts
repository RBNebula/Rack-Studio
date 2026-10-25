import * as THREE from 'three';
import type { Port } from '../model';
import { portPanelCorners } from '../engineering/ports';

export function portAperture(port: Port, padding = 0): THREE.Path {
  const corners = portPanelCorners(port, padding),
    path = new THREE.Path();
  path.moveTo(...corners[0]);
  for (const corner of corners.slice(1)) path.lineTo(...corner);
  path.closePath();
  return path;
}
