import { useEffect, useRef, useState } from 'react';
import type { MeshAsset, Vec3 } from '../model';
import { useStore } from '../state';
import { U_MM } from '../engineering/geometry';
import { axes, defaultOrientation } from '../data/step';
import type { Axis, Orientation, ViewImage } from '../data/step';
import { stepDefinition } from '../data/step-definition';
import type { StepMount as Mount } from '../data/step-definition';
import type { StepRequest, StepResponse } from '../data/step.worker';
import { Button, Field, Modal, NumberField } from './shared';

/**
 * Import a STEP (.stp/.step) model as an equipment definition. The model is read in a worker,
 * oriented so its CAD front faces the rack front, and stored as a display mesh. Mounting comes from
 * the user's choice: rack ears on the rails (front ear plane offset), or no ears on a shelf (set
 * back from the shelf front). Dimensions are the CAD bounding box; nothing here is a measurement
 * of the mounting interface, so the definition stays user-entered evidence.
 */

interface Built {
  asset: MeshAsset;
  sizeMm: Vec3;
  front: string;
  rear: string;
  ms: number;
}

const toPng = (image: ViewImage) => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.putImageData(
    new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height),
    0,
    0,
  );
  return canvas.toDataURL('image/png');
};
const axisLabel = (a: Axis) => `${a[0]}${a[1].toUpperCase()}`;
const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

export function StepImport({ onClose }: { onClose: () => void }) {
  const { edit, set } = useStore();
  const worker = useRef<Worker | null>(null);
  // The first error explains the problem; a queued build failing after it adds nothing.
  const failed = useRef(false);
  const [fileName, setFileName] = useState('');
  const [phase, setPhase] = useState<'choose' | 'reading' | 'building' | 'ready' | 'error'>(
    'choose',
  );
  const [message, setMessage] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>(defaultOrientation);
  const [omitHidden, setOmitHidden] = useState(true);
  const [built, setBuilt] = useState<Built | null>(null);
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [mount, setMount] = useState<Mount>('shelf');
  const [earOffsetMm, setEarOffsetMm] = useState(4);
  const [setbackMm, setSetbackMm] = useState(50);
  const [chassisWidthMm, setChassisWidthMm] = useState<number | null>(null);

  useEffect(() => {
    const w = new Worker(new URL('../data/step.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (event: MessageEvent<StepResponse>) => {
      const r = event.data;
      if (r.type === 'error') {
        if (failed.current) return;
        failed.current = true;
        setPhase('error');
        setMessage(r.message);
      } else if (r.type === 'read')
        setMessage(`${r.parts} parts read in ${(r.ms / 1000).toFixed(0)} s.`);
      else if (r.type === 'build') {
        setBuilt({
          asset: r.asset,
          sizeMm: r.sizeMm,
          front: toPng(r.front) ?? '',
          rear: toPng(r.rear) ?? '',
          ms: r.ms,
        });
        setPhase('ready');
      } else if (r.type === 'measure') setChassisWidthMm(r.widthMm);
    };
    return () => w.terminate();
  }, []);
  const post = (request: StepRequest, transfer: Transferable[] = []) =>
    worker.current?.postMessage(request, transfer);

  useEffect(() => {
    if (phase !== 'reading' && phase !== 'building') return;
    const start = performance.now();
    const timer = setInterval(() => setElapsed((performance.now() - start) / 1000), 500);
    return () => clearInterval(timer);
  }, [phase]);

  // Measure the chassis behind the ear flanges whenever the model or ear depth changes.
  useEffect(() => {
    if (built && mount === 'ears') post({ type: 'measure', fromZ: earOffsetMm + 2 });
  }, [built, mount, earOffsetMm]);

  async function choose(file: File | undefined) {
    if (!file) return;
    if (!/\.(stp|step)$/i.test(file.name)) {
      setPhase('error');
      setMessage('Choose a STEP file (.stp or .step).');
      return;
    }
    setFileName(file.name);
    setName(file.name.replace(/\.(stp|step)$/i, '').replace(/[_]+/g, ' '));
    setBuilt(null);
    failed.current = false;
    setPhase('reading');
    setMessage('');
    const bytes = await file.arrayBuffer();
    post({ type: 'read', bytes }, [bytes]);
    build(orientation, omitHidden, file.name);
  }
  function build(o: Orientation, omit: boolean, file = fileName) {
    failed.current = false;
    setPhase((p) => (p === 'reading' ? p : 'building'));
    post({ type: 'build', fileName: file, orientation: o, omitHidden: omit });
  }
  function reorient(patch: Partial<Orientation>) {
    let next = { ...orientation, ...patch };
    // Keep up perpendicular to front: pick the first axis that is.
    if (next.up[1] === next.front[1])
      next = { ...next, up: axes.find((a) => a[1] !== next.front[1])! };
    setOrientation(next);
    build(next, omitHidden);
  }

  const size = built?.sizeMm;
  const heightU = size ? Math.max(1, Math.ceil(size[1] / U_MM - 1e-6)) : 0;
  const issues: string[] = [];
  if (size && mount === 'ears') {
    if (earOffsetMm >= size[2]) issues.push('Ear offset must be less than the model depth.');
    if (size[0] < 450)
      issues.push(
        `The model is ${fmt(size[0])} mm wide, narrower than a 19-inch rack opening; it probably has no ears. Choose "No rack ears" to stand it on a shelf.`,
      );
  }
  if (!name.trim()) issues.push('Give the equipment a name.');
  const busy = phase === 'reading' || phase === 'building';

  function save() {
    if (!built || !size || issues.length) return;
    const definition = stepDefinition({
      asset: built.asset,
      sizeMm: size,
      name: name.trim(),
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      mount,
      earOffsetMm,
      setbackMm,
      chassisWidthMm: chassisWidthMm ?? size[0],
      frontImage: built.front || null,
      rearImage: built.rear || null,
    });
    if (
      edit(
        `Imported ${definition.name} from ${fileName}. ${mount === 'shelf' ? 'Drag it onto a shelf; it sits ' + setbackMm + ' mm back from the shelf front.' : 'Drag it onto a U; its front sits ' + earOffsetMm + ' mm forward of the rails.'} Add ports in its definition editor.`,
        (p) => {
          p.definitions.push(definition);
        },
      )
    ) {
      set({ selection: null });
      onClose();
    }
  }

  return (
    <Modal title="Import STEP model" onClose={onClose} wide>
      <div className="step-import">
        <Field label="STEP file (.stp, .step)">
          <input
            type="file"
            accept=".stp,.step,application/step"
            aria-label="STEP file"
            disabled={busy}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </Field>
        {busy && (
          <p className="step-progress" role="status">
            {phase === 'reading' ? 'Reading and tessellating the CAD model' : 'Updating the model'}…{' '}
            {elapsed.toFixed(0)} s. Detailed assemblies can take a minute. {message}
          </p>
        )}
        {phase === 'error' && (
          <p className="callout error" role="alert">
            {message}
          </p>
        )}
        {built && size && (
          <>
            <div className="step-preview">
              <figure>
                <img src={built.front} alt="Model front view" />
                <figcaption>Front (faces the rack front)</figcaption>
              </figure>
              <figure>
                <img src={built.rear} alt="Model rear view" />
                <figcaption>Rear</figcaption>
              </figure>
            </div>
            <p className="step-facts" data-testid="step-facts">
              {fmt(size[0])} W × {fmt(size[1])} H × {fmt(size[2])} D mm · {heightU}U ·{' '}
              {built.asset.triangles.toLocaleString()} triangles
              {built.asset.omittedParts
                ? ` · ${built.asset.omittedParts} hidden parts omitted`
                : ''}
            </p>
            <div className="form-grid">
              <Field label="Front of the model" hint="The CAD direction facing out of the rack.">
                <select
                  value={orientation.front}
                  disabled={busy}
                  onChange={(e) => reorient({ front: e.target.value as Axis })}
                >
                  {axes.map((a) => (
                    <option key={a} value={a}>
                      {axisLabel(a)}
                      {a === defaultOrientation.front ? ' (CAD front view)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Up">
                <select
                  value={orientation.up}
                  disabled={busy}
                  onChange={(e) => reorient({ up: e.target.value as Axis })}
                >
                  {axes
                    .filter((a) => a[1] !== orientation.front[1])
                    .map((a) => (
                      <option key={a} value={a}>
                        {axisLabel(a)}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={omitHidden}
                disabled={busy}
                onChange={(e) => {
                  setOmitHidden(e.target.checked);
                  build(orientation, e.target.checked);
                }}
              />
              Omit internal parts hidden by the enclosure (smaller project file)
            </label>
            <fieldset className="step-mount">
              <legend>Mounting</legend>
              <label className="check-field">
                <input
                  type="radio"
                  name="step-mount"
                  checked={mount === 'ears'}
                  onChange={() => setMount('ears')}
                />
                Model has rack ears: mounts on the rails, centred on the U it is dropped on
              </label>
              <label className="check-field">
                <input
                  type="radio"
                  name="step-mount"
                  checked={mount === 'shelf'}
                  onChange={() => setMount('shelf')}
                />
                Model has no rack ears: stands on a shelf, set back from the shelf front
              </label>
              {mount === 'ears' ? (
                <div className="form-grid">
                  <NumberField
                    label="Ear offset (mm)"
                    value={earOffsetMm}
                    min={0.1}
                    step={0.5}
                    onChange={setEarOffsetMm}
                    hint="How far the model front sits forward of the rack screw plane."
                  />
                  <NumberField
                    label="Chassis width behind the ears (mm)"
                    value={chassisWidthMm === null ? null : Math.round(chassisWidthMm * 10) / 10}
                    min={1}
                    step={0.5}
                    onChange={setChassisWidthMm}
                    hint="Measured from the model behind the ear flanges; check it."
                  />
                </div>
              ) : (
                <NumberField
                  label="Set back from shelf front (mm)"
                  value={setbackMm}
                  min={0}
                  step={5}
                  onChange={setSetbackMm}
                />
              )}
            </fieldset>
            <div className="form-grid">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Manufacturer">
                <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
              </Field>
              <Field label="Model">
                <input value={model} onChange={(e) => setModel(e.target.value)} />
              </Field>
            </div>
            {issues.map((issue) => (
              <p className="callout" key={issue}>
                {issue}
              </p>
            ))}
            <p className="step-hint">
              Dimensions come from the CAD bounding box and stay user-entered evidence. Ports, mass
              and power are not in a STEP file; add them in the definition editor.
            </p>
          </>
        )}
        <div className="button-row step-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={save} disabled={!built || busy || issues.length > 0}>
            Add to library
          </Button>
        </div>
      </div>
    </Modal>
  );
}
