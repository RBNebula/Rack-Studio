/// <reference lib="webworker" />
import occtimportjs from 'occt-import-js';
import type { Occt } from 'occt-import-js';
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';
import { buildMeshAsset, renderFace, widthBehind } from './step';
import type { MeshBuild, Orientation, RawPart, ViewImage } from './step';
import type { MeshAsset, Vec3 } from '../model';

/**
 * STEP import worker: OpenCascade (occt-import-js, LGPL-2.1) tessellates the file off the main
 * thread. The raw parts stay here so a changed orientation only re-runs the pure processing.
 */
export type StepRequest =
  | { type: 'read'; bytes: ArrayBuffer }
  | { type: 'build'; fileName: string; orientation: Orientation; omitHidden: boolean }
  | { type: 'measure'; fromZ: number };
export type StepResponse =
  | { type: 'read'; parts: number; ms: number }
  | {
      type: 'build';
      asset: MeshAsset;
      sizeMm: Vec3;
      front: ViewImage;
      rear: ViewImage;
      ms: number;
    }
  | { type: 'measure'; widthMm: number | null }
  | { type: 'error'; message: string };

const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
let kernel: Promise<Occt> | null = null;
let raw: RawPart[] = [];
let built: MeshBuild | null = null;
const reply = (message: StepResponse, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer);

// Requests run in order: a build posted straight after a read waits for the read to finish.
let queue: Promise<void> = Promise.resolve();
// The kernel can fail asynchronously (for example while instantiating WebAssembly); report it
// rather than leaving the request waiting.
self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const reason: unknown = event.reason;
  reply({ type: 'error', message: reason instanceof Error ? reason.message : String(reason) });
};
self.onmessage = (event: MessageEvent<StepRequest>) => {
  queue = queue.then(() => handle(event.data));
};
async function handle(request: StepRequest) {
  const started = performance.now();
  try {
    if (request.type === 'read') {
      kernel ??= fetch(wasmUrl)
        .then((r) => r.arrayBuffer())
        .then((wasmBinary) => occtimportjs({ wasmBinary }));
      const result = (await kernel).ReadStepFile(new Uint8Array(request.bytes), {
        linearUnit: 'millimeter',
        linearDeflectionType: 'bounding_box_ratio',
        linearDeflection: 0.004,
        angularDeflection: 0.8,
      });
      if (!result.success) throw new Error('The file could not be read as a STEP model.');
      raw = result.meshes.map((m) => ({
        name: m.name,
        // The kernel reports linear colour; materials and images expect sRGB.
        color: m.color ? (m.color.map(toSrgb) as [number, number, number]) : null,
        positions: new Float32Array(m.attributes.position.array),
        indices: new Uint32Array(m.index.array),
      }));
      built = null;
      reply({ type: 'read', parts: raw.length, ms: performance.now() - started });
    } else if (request.type === 'build') {
      built = buildMeshAsset(raw, request);
      const front = renderFace(built.parts, 'front'),
        rear = renderFace(built.parts, 'rear');
      reply(
        {
          type: 'build',
          asset: built.asset,
          sizeMm: built.sizeMm,
          front,
          rear,
          ms: performance.now() - started,
        },
        [front.rgba.buffer, rear.rgba.buffer],
      );
    } else {
      reply({ type: 'measure', widthMm: built ? widthBehind(built.parts, request.fromZ) : null });
    }
  } catch (error) {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}
