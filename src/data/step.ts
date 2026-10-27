import type { MeshAsset, Vec3 } from '../model';

/**
 * Pure processing for STEP (ISO 10303) imports. The CAD kernel (occt-import-js, in a worker)
 * tessellates the file into parts; this module orients them into device-local millimetres, drops
 * parts no outside view can see, and packs a compact display mesh. Nothing here measures a
 * mounting interface: dimensions are the model's bounding box.
 */

export type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export const axes: Axis[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
export interface Orientation {
  /** CAD direction that faces out of the rack front (towards the viewer in a front view). */
  front: Axis;
  /** CAD direction that points up in the rack. */
  up: Axis;
}
/** CAD "front view" convention for a Y-up model: looking at the +Z face. */
export const defaultOrientation: Orientation = { front: '+z', up: '+y' };

export interface RawPart {
  name: string;
  color: [number, number, number] | null;
  positions: Float32Array;
  indices: Uint32Array;
}

const unit = (a: Axis): Vec3 => {
  const v: Vec3 = [0, 0, 0];
  v['xyz'.indexOf(a[1])] = a[0] === '+' ? 1 : -1;
  return v;
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Local x, y, z axes expressed in CAD coordinates; z (rearwards) is opposite the front. */
export function orientationBasis(o: Orientation): [Vec3, Vec3, Vec3] {
  const z = unit(o.front).map((v) => -v) as Vec3,
    y = unit(o.up);
  if (dot(y, z) !== 0) throw new Error('The up direction must be perpendicular to the front.');
  // Adding 0 turns -0 into 0, so bases compare cleanly.
  return [cross(y, z), y, z].map((v) => v.map((n) => n + 0) as Vec3) as [Vec3, Vec3, Vec3];
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}
export function partsBounds(parts: RawPart[]): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const part of parts)
    for (let i = 0; i < part.positions.length; i++) {
      const v = part.positions[i],
        axis = i % 3;
      if (v < min[axis]) min[axis] = v;
      if (v > max[axis]) max[axis] = v;
    }
  return { min, max };
}

/** Rotate into device-local mm: x centred, y from 0 at the bottom, z from 0 at the front face. */
export function orientParts(parts: RawPart[], o: Orientation): RawPart[] {
  const basis = orientationBasis(o);
  const turned = parts.map((part) => {
    const positions = new Float32Array(part.positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const p: Vec3 = [part.positions[i], part.positions[i + 1], part.positions[i + 2]];
      for (let axis = 0; axis < 3; axis++) positions[i + axis] = dot(p, basis[axis]);
    }
    return { ...part, positions };
  });
  const { min, max } = partsBounds(turned);
  const shift: Vec3 = [-(min[0] + max[0]) / 2, -min[1], -min[2]];
  for (const part of turned)
    for (let i = 0; i < part.positions.length; i++) part.positions[i] += shift[i % 3];
  return turned;
}

interface View {
  /** Screen right, screen up and viewing direction (into the scene). */
  right: Vec3;
  up: Vec3;
  into: Vec3;
}
function viewFor(into: Vec3): View {
  const length = Math.hypot(...into);
  const d = into.map((v) => v / length) as Vec3;
  const helper: Vec3 = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const right = cross(helper, d);
  const r = Math.hypot(...right);
  const rightUnit = right.map((v) => v / r) as Vec3;
  return { right: rightUnit, up: cross(d, rightUnit), into: d };
}

/**
 * Orthographic z-buffer raster of every triangle. `shade` receives the winning part index and
 * triangle normal per pixel; the result lists which parts own at least one pixel.
 */
function raster(
  parts: RawPart[],
  view: View,
  cellMm: number,
  shade?: (pixel: number, part: number, normal: Vec3) => void,
  frame?: { minU: number; maxV: number; width: number; height: number },
) {
  let minU = Infinity,
    maxU = -Infinity,
    minV = Infinity,
    maxV = -Infinity;
  if (!frame)
    for (const part of parts)
      for (let i = 0; i < part.positions.length; i += 3) {
        const p: Vec3 = [part.positions[i], part.positions[i + 1], part.positions[i + 2]];
        const u = dot(p, view.right),
          v = dot(p, view.up);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }
  const f = frame ?? {
    minU,
    maxV,
    width: Math.max(1, Math.ceil((maxU - minU) / cellMm) + 1),
    height: Math.max(1, Math.ceil((maxV - minV) / cellMm) + 1),
  };
  const depth = new Float32Array(f.width * f.height).fill(Infinity);
  const owner = new Int32Array(f.width * f.height).fill(-1);
  const normals: Vec3[] = shade ? new Array(f.width * f.height) : [];
  // Fragments each part covers before the depth test: roughly its own projected area.
  const covered = new Float64Array(parts.length);
  const sx = [0, 0, 0],
    sy = [0, 0, 0],
    sz = [0, 0, 0];
  parts.forEach((part, partIndex) => {
    const p = part.positions,
      idx = part.indices;
    for (let t = 0; t < idx.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const o = idx[t + k] * 3;
        const q: Vec3 = [p[o], p[o + 1], p[o + 2]];
        sx[k] = (dot(q, view.right) - f.minU) / cellMm;
        sy[k] = (f.maxV - dot(q, view.up)) / cellMm;
        sz[k] = dot(q, view.into);
      }
      const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(sx[0], sx[1], sx[2]))),
        x1 = Math.min(f.width - 1, Math.ceil(Math.max(sx[0], sx[1], sx[2]))),
        y0 = Math.max(0, Math.floor(Math.min(sy[0], sy[1], sy[2]))),
        y1 = Math.min(f.height - 1, Math.ceil(Math.max(sy[0], sy[1], sy[2])));
      let normal: Vec3 | null = null;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5,
            py = y + 0.5;
          const w0 = ((sx[1] - px) * (sy[2] - py) - (sx[2] - px) * (sy[1] - py)) / area,
            w1 = ((sx[2] - px) * (sy[0] - py) - (sx[0] - px) * (sy[2] - py)) / area,
            w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          covered[partIndex]++;
          const z = w0 * sz[0] + w1 * sz[1] + w2 * sz[2],
            pixel = y * f.width + x;
          if (z >= depth[pixel]) continue;
          depth[pixel] = z;
          owner[pixel] = partIndex;
          if (shade) {
            if (!normal) {
              const a = idx[t] * 3,
                b = idx[t + 1] * 3,
                c = idx[t + 2] * 3;
              const n = cross(
                [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]],
                [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]],
              );
              const l = Math.hypot(...n) || 1;
              normal = n.map((v) => v / l) as Vec3;
            }
            normals[pixel] = normal;
          }
        }
    }
  });
  const seen = new Map<number, number>();
  owner.forEach((part, pixel) => {
    if (part < 0) return;
    seen.set(part, (seen.get(part) ?? 0) + 1);
    shade?.(pixel, part, normals[pixel]);
  });
  return { seen, covered, frame: f };
}

/** A part must show this share of its outline in some view to count as exterior. */
export const VISIBLE_SHARE = 0.03;
/**
 * Parts visible from outside, from axis and corner views of an orthographic depth buffer. A part
 * that shows less than `VISIBLE_SHARE` of itself in every view (an internal board glimpsed through
 * vents) is dropped, as is one seen only through openings narrower than the raster cell.
 */
export function visibleParts(parts: RawPart[]): boolean[] {
  const { min, max } = partsBounds(parts);
  const extent = Math.max(...max.map((v, i) => v - min[i]));
  const cell = extent / 480;
  const directions: Vec3[] = [];
  for (const a of axes) directions.push(unit(a));
  for (const x of [-1, 1])
    for (const y of [-1, 1]) for (const z of [-1, 1]) directions.push([x, y, z]);
  const share = parts.map(() => 0);
  for (const d of directions) {
    const { seen, covered } = raster(parts, viewFor(d), cell);
    // Each surface is drawn front and back, so the outline is about half the coverage.
    for (const [part, pixels] of seen)
      share[part] = Math.max(share[part], (2 * pixels) / covered[part]);
  }
  return share.map((v) => v >= VISIBLE_SHARE);
}

const hex = (c: [number, number, number] | null) =>
  c
    ? `#${c
        .map((v) =>
          Math.round(Math.min(1, Math.max(0, v)) * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
    : '#8a929a';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface MeshBuild {
  asset: MeshAsset;
  /** Bounding box size of the kept parts in local mm (width, height, depth). */
  sizeMm: Vec3;
  /** The local parts that were kept, for images and width measurement. */
  parts: RawPart[];
}

/** Orient, cull and pack the parts into a mesh asset (offset zero; the importer sets it). */
export function buildMeshAsset(
  raw: RawPart[],
  options: { fileName: string; orientation: Orientation; omitHidden: boolean },
): MeshBuild {
  if (!raw.some((p) => p.indices.length)) throw new Error('The STEP file contains no surfaces.');
  let parts = orientParts(
    raw.filter((p) => p.indices.length),
    options.orientation,
  );
  const total = parts.length;
  if (options.omitHidden) {
    const visible = visibleParts(parts);
    parts = parts.filter((_, i) => visible[i]);
    // Culling can expose a new bounding box (e.g. a hidden internal part was outermost).
    parts = orientParts(parts, { front: '-z', up: '+y' });
  }
  const bounds = partsBounds(parts);
  const centre = bounds.min.map((v, i) => (v + bounds.max[i]) / 2) as Vec3;
  const half = Math.max(...bounds.max.map((v, i) => (v - bounds.min[i]) / 2), 1e-3);
  const quantumMm = half / 32767;
  const byColor = new Map<string, RawPart[]>();
  for (const part of parts) {
    const key = hex(part.color);
    byColor.set(key, [...(byColor.get(key) ?? []), part]);
  }
  let triangles = 0;
  const groups = [...byColor].map(([color, members]) => {
    const vertexCount = members.reduce((n, p) => n + p.positions.length / 3, 0);
    const indexCount = members.reduce((n, p) => n + p.indices.length, 0);
    const positions = new Int16Array(vertexCount * 3);
    const indexBytes = vertexCount > 65535 ? 4 : 2;
    const indices = indexBytes === 4 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    let v = 0,
      k = 0;
    for (const part of members) {
      for (let i = 0; i < part.indices.length; i++) indices[k++] = part.indices[i] + v / 3;
      for (let i = 0; i < part.positions.length; i++)
        positions[v + i] = Math.round((part.positions[i] - centre[i % 3]) / quantumMm);
      v += part.positions.length;
    }
    triangles += indexCount / 3;
    return {
      color,
      positions: toBase64(new Uint8Array(positions.buffer)),
      indices: toBase64(new Uint8Array(indices.buffer)),
      indexBytes: indexBytes as 2 | 4,
    };
  });
  return {
    asset: {
      source: 'step',
      fileName: options.fileName,
      boundsMm: bounds,
      quantumMm,
      offsetMm: [0, 0, 0],
      groups,
      triangles,
      omittedParts: total - parts.length,
    },
    sizeMm: bounds.max.map((v, i) => v - bounds.min[i]) as Vec3,
    parts,
  };
}

export interface DecodedGroup {
  color: string;
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
}
/** Unpack to local-mm float positions (offset not applied). */
export function decodeMeshAsset(asset: MeshAsset): DecodedGroup[] {
  const centre = asset.boundsMm.min.map((v, i) => (v + asset.boundsMm.max[i]) / 2);
  return asset.groups.map((g) => {
    const raw = fromBase64(g.positions);
    const q = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    const positions = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) positions[i] = centre[i % 3] + q[i] * asset.quantumMm;
    const bytes = fromBase64(g.indices);
    const indices =
      g.indexBytes === 4
        ? new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
        : new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    return { color: g.color, positions, indices };
  });
}

/**
 * Overall width of the kept parts behind local depth `fromZ`: for a model with rack ears, the
 * chassis width between the ears when `fromZ` lies behind the ear flanges.
 */
export function widthBehind(parts: RawPart[], fromZ: number): number | null {
  let min = Infinity,
    max = -Infinity;
  for (const part of parts)
    for (let i = 0; i < part.positions.length; i += 3)
      if (part.positions[i + 2] > fromZ) {
        min = Math.min(min, part.positions[i]);
        max = Math.max(max, part.positions[i]);
      }
  return max > min ? max - min : null;
}

export interface ViewImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}
/**
 * Shaded orthographic picture of the front or rear, framed to the model's width and height
 * exactly so it can stretch over the device face. Background pixels are transparent.
 */
export function renderFace(parts: RawPart[], face: 'front' | 'rear', pxPerMm = 4): ViewImage {
  const { min, max } = partsBounds(parts);
  const cell = 1 / pxPerMm;
  // From the front, +X shows on the left, so screen right is -X; from the rear it is +X.
  const view: View =
    face === 'front'
      ? { right: [-1, 0, 0], up: [0, 1, 0], into: [0, 0, 1] }
      : { right: [1, 0, 0], up: [0, 1, 0], into: [0, 0, -1] };
  const width = Math.max(1, Math.round((max[0] - min[0]) * pxPerMm)),
    height = Math.max(1, Math.round((max[1] - min[1]) * pxPerMm));
  const rgba = new Uint8ClampedArray(width * height * 4);
  raster(
    parts,
    view,
    cell,
    (pixel, part, normal) => {
      const c = parts[part].color ?? [0.54, 0.57, 0.6];
      const light = 0.35 + 0.65 * Math.abs(dot(normal, view.into));
      for (let i = 0; i < 3; i++) rgba[pixel * 4 + i] = c[i] * 255 * light;
      rgba[pixel * 4 + 3] = 255;
    },
    {
      minU: face === 'front' ? -max[0] : min[0],
      maxV: max[1],
      width,
      height,
    },
  );
  return { width, height, rgba };
}
