import { beforeEach, describe, expect, it } from 'vitest';
import { createExampleProject } from '../testing/legacy-example';
import {
  clone,
  definitionSchema,
  type Device,
  type DeviceDefinition,
  type Project,
  type SupportRails,
} from '../model';
import {
  allObstacles,
  deviceBoxes,
  deviceChassisBoxes,
  deviceEarBoxes,
  deviceSupportRailBoxes,
  portWorld,
  segmentHitsBox,
  uBottom,
  validatePlacement,
  validateRack,
  type Obstacle,
} from './geometry';
import { boxesIntersect } from './space';
import { supportRailAssessment } from './support-rails';
import { useStore } from '../state';
import { parseProject, serializeProject } from '../data/project';

/**
 * A 2U, 430 mm wide chassis 630 mm from ear plane to rear with a 40 mm front bezel and 44.28 kg,
 * shaped like the user's SMT3000RMI2U. Rail profile numbers are test values, not measurements.
 */
const rails = (patch: Partial<SupportRails> = {}): SupportRails => ({
  kind: 'fixed-l',
  spanMinMm: null,
  spanMaxMm: null,
  legHeightMm: 30,
  flangeWidthMm: 20,
  thicknessMm: 1.2,
  loadRatingKg: null,
  evidence: 'example',
  source: 'Test values.',
  ...patch,
});
function upsDefinition(project: Project, patch: Partial<DeviceDefinition> = {}): DeviceDefinition {
  return {
    ...project.definitions.find((d) => d.id === 'def-switch')!,
    id: 'def-ups',
    name: 'Rail-carried UPS',
    widthMm: 430,
    heightU: 2,
    heightMm: 86,
    depthMm: 630,
    faceWidthMm: 482.6,
    earThicknessMm: null,
    mounting: 'rails',
    railMinMm: null,
    railMaxMm: null,
    massKg: 44.28,
    screwOffsetsMm: [6.35, 22.225, 66.675, 82.55],
    ports: [
      {
        id: 'input',
        name: 'Input',
        connector: 'IEC-C20',
        surface: 'rear',
        position: [53.5, 25, 630],
        direction: [0, 0, 1],
        multiple: false,
      },
    ],
    parts: [{ id: 'bezel', name: 'Bezel', position: [0, 43, -20], size: [430, 86, 40] }],
    supportRails: rails(),
    ...patch,
  };
}
const ups = (face: Device['face'] = 'front', startU = 3): Device => ({
  id: 'ups',
  definitionId: 'def-ups',
  name: 'UPS',
  startU,
  face,
  supportId: null,
  installation: 'installed',
});
/** Lower section 1–15: rails at 0/700 mm; 850 mm exterior leaves 80 mm behind the rear rails. */
function fixture(
  face: Device['face'] = 'front',
  startU = 3,
  patch: Partial<DeviceDefinition> = {},
) {
  const p = createExampleProject(false);
  p.rack.sections[0].overallDepthMm = 850;
  p.definitions.push(upsDefinition(p, patch));
  const d = ups(face, startU);
  p.devices = [d];
  return { p, d, def: p.definitions.find((x) => x.id === 'def-ups')! };
}
const byId = (boxes: Obstacle[]) =>
  Object.fromEntries(boxes.map((b) => [b.id.split(':').slice(2).join(':'), b]));
const close = (actual: number[], expected: number[]) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
const touches = (a: Obstacle, b: Obstacle) =>
  !boxesIntersect(a, b) &&
  a.min.every((v, i) => v <= b.max[i] + 1e-9 && a.max[i] >= b.min[i] - 1e-9);

// U3 bottom is 88.9 mm; the 86 mm chassis is centred in its 88.9 mm allocation, so its bottom is
// 88.9 + 1.45 = 90.35 mm. The 1.2 mm flange occupies 89.15–90.35 mm, inside the allocation.
const BOTTOM = 88.9 + (88.9 - 86) / 2;

describe('fixed L-section support rails', () => {
  it('validates the rack fixture and the definition schema', () => {
    const { p, def } = fixture();
    expect(validateRack(p.rack)).toEqual([]);
    expect(definitionSchema.safeParse(def).success).toBe(true);
  });

  it.each(['front', 'rear'] as const)(
    'places %s-mounted rail solids between the post inner faces, under and beside the chassis',
    (face) => {
      const { p, d } = fixture(face);
      const boxes = byId(deviceSupportRailBoxes(p, d));
      expect(Object.keys(boxes).sort()).toEqual(
        ['far-tab', 'flange', 'leg', 'near-tab'].flatMap((n) => [`left:${n}`, `right:${n}`]).sort(),
      );
      // Device-local "right" (+x) is world +x on the front face and world -x on the rear face.
      const s = face === 'front' ? 1 : -1;
      const x = (a: number, b: number) => [Math.min(s * a, s * b), Math.max(s * a, s * b)];
      const near = face === 'front' ? [10, 11.2] : [688.8, 690];
      const far = face === 'front' ? [688.8, 690] : [10, 11.2];
      const right = (id: string) => boxes[`right:${id}`];
      close(
        [right('leg').min[0], right('leg').max[0], right('leg').min[1], right('leg').max[1]],
        [...x(215, 216.2), BOTTOM - 1.2, BOTTOM - 1.2 + 30],
      );
      close([right('leg').min[2], right('leg').max[2]], [10, 690]);
      close(
        [
          right('flange').min[0],
          right('flange').max[0],
          right('flange').min[1],
          right('flange').max[1],
        ],
        [...x(196.2, 215), BOTTOM - 1.2, BOTTOM],
      );
      close([right('flange').min[2], right('flange').max[2]], [10, 690]);
      // Tabs reach the post's outer edge, 465.1 / 2 + 10 / 2 = 237.55 mm from the centre.
      close([right('near-tab').min[0], right('near-tab').max[0]], x(216.2, 237.55));
      close([right('near-tab').min[2], right('near-tab').max[2]], near);
      close([right('far-tab').min[2], right('far-tab').max[2]], far);
      // Left is the mirror image of right in x.
      for (const id of ['leg', 'flange', 'near-tab', 'far-tab']) {
        close(
          [boxes[`left:${id}`].min[0], boxes[`left:${id}`].max[0]],
          [-right(id).max[0], -right(id).min[0]],
        );
        close(
          [boxes[`left:${id}`].min[2], boxes[`left:${id}`].max[2]],
          [right(id).min[2], right(id).max[2]],
        );
      }
      expect(validatePlacement(p, d)).toEqual([]);
    },
  );

  it('mirrors the rail solids for rear mounting with the chassis (x and z about the rack)', () => {
    const front = fixture('front'),
      rear = fixture('rear');
    const f = byId(deviceSupportRailBoxes(front.p, front.d)),
      r = byId(deviceSupportRailBoxes(rear.p, rear.d));
    // Rear transform: x -> -x, z -> 700 - z (front plane 0, rear plane 700); y unchanged.
    for (const [id, box] of Object.entries(f)) {
      const m = r[id];
      close([m.min[0], m.max[0]], [-box.max[0], -box.min[0]]);
      close([m.min[1], m.max[1]], [box.min[1], box.max[1]]);
      close([m.min[2], m.max[2]], [700 - box.max[2], 700 - box.min[2]]);
    }
    // The same mapping carries the chassis and its port, so rails and chassis stay together.
    const fb = deviceChassisBoxes(front.p, front.d).find((b) => b.id.endsWith(':body'))!;
    const rb = deviceChassisBoxes(rear.p, rear.d).find((b) => b.id.endsWith(':body'))!;
    close([rb.min[2], rb.max[2]], [700 - fb.max[2], 700 - fb.min[2]]);
    const port = { kind: 'device' as const, deviceId: 'ups', portId: 'input' };
    close(portWorld(front.p, port)!, [53.5, BOTTOM + 25, 630]);
    close(portWorld(rear.p, port)!, [-53.5, BOTTOM + 25, 70]);
  });

  it.each(['front', 'rear'] as const)(
    'bears the %s chassis on the flange top and leg sides by contact, not penetration',
    (face) => {
      const { p, d } = fixture(face);
      const body = deviceChassisBoxes(p, d).find((b) => b.id.endsWith(':body'))!;
      const boxes = byId(deviceSupportRailBoxes(p, d));
      expect(body.min[1]).toBeCloseTo(BOTTOM, 9);
      for (const side of ['left', 'right']) {
        const flange = boxes[`${side}:flange`],
          leg = boxes[`${side}:leg`];
        expect(flange.max[1]).toBeCloseTo(body.min[1], 9);
        expect(leg.min[0] === body.max[0] || leg.max[0] === body.min[0]).toBe(true);
        // 18.8 mm of each flange lies under the chassis footprint (20 mm less the 1.2 mm leg).
        expect(
          Math.min(flange.max[0], body.max[0]) - Math.max(flange.min[0], body.min[0]),
        ).toBeCloseTo(18.8, 9);
        expect(touches(flange, body)).toBe(true);
        expect(touches(leg, body)).toBe(true);
        for (const own of deviceBoxes(p, d))
          expect(boxesIntersect(own, flange) || boxesIntersect(own, leg)).toBe(false);
      }
      const assessment = supportRailAssessment(p, d)!;
      expect(assessment.bearingTopMm).toBeCloseTo(BOTTOM, 9);
      expect(assessment.belowAllocationMm).toBe(0);
    },
  );

  it.each(['front', 'rear'] as const)(
    'keeps %s ears, screw holes, chassis and ports where direct mounting puts them',
    (face) => {
      const { p, d, def } = fixture(face);
      const withRails = {
        ears: deviceEarBoxes(p, d),
        body: deviceChassisBoxes(p, d),
        port: portWorld(p, { kind: 'device', deviceId: 'ups', portId: 'input' }),
      };
      def.supportRails = undefined;
      def.mounting = 'direct';
      expect(deviceSupportRailBoxes(p, d)).toEqual([]);
      expect(deviceEarBoxes(p, d)).toEqual(withRails.ears);
      expect(deviceChassisBoxes(p, d)).toEqual(withRails.body);
      expect(portWorld(p, { kind: 'device', deviceId: 'ups', portId: 'input' })).toEqual(
        withRails.port,
      );
      for (const ear of withRails.ears) {
        // Ear bearing face on the rail plane; ears span the chassis height above U3's bottom.
        expect(face === 'front' ? ear.max[2] : ear.min[2]).toBe(face === 'front' ? 0 : 700);
        expect(ear.min[1]).toBeCloseTo(BOTTOM, 9);
      }
      // Screw offsets are measured from the allocated U bottom, so the holes are unchanged.
      expect(def.screwOffsetsMm.map((o) => Math.round((uBottom(3) + o) * 1000) / 1000)).toEqual([
        95.25, 111.125, 155.575, 171.45,
      ]);
    },
  );

  it.each(['front', 'rear'] as const)(
    'seats the %s end tabs on the inside of the posts',
    (face) => {
      const { p, d } = fixture(face);
      const posts = allObstacles(p).filter((b) => /^rack:lower:-?1:(front|rear):rail$/.test(b.id));
      expect(posts).toHaveLength(4);
      for (const tab of deviceSupportRailBoxes(p, d).filter((b) => b.id.endsWith('tab'))) {
        expect(posts.some((post) => touches(tab, post))).toBe(true);
        expect(posts.some((post) => boxesIntersect(tab, post))).toBe(false);
      }
    },
  );

  it('includes the rail solids in routing obstacles and collision checks', () => {
    const { p, d } = fixture();
    const flange = allObstacles(p).find((b) => b.id === 'support-rail:ups:right:flange')!;
    expect(flange).toBeDefined();
    // Not a connector-owner box (`device:ups:`), so cable leads from the UPS ports avoid it too.
    expect(allObstacles(p).filter((b) => b.id.startsWith(`support-rail:${d.id}:`))).toHaveLength(8);
    const y = (flange.min[1] + flange.max[1]) / 2;
    expect(segmentHitsBox([205, y, -10], [205, y, 800], flange, 1)).toBe(true);
    // A thicker flange intrudes into the U below and must collide with a 1U device there.
    const thick = fixture('front', 3, { supportRails: rails({ thicknessMm: 3 }) });
    thick.p.devices.push({
      id: 'switch',
      definitionId: 'def-switch',
      name: 'Switch',
      startU: 2,
      face: 'front',
      supportId: null,
      installation: 'installed',
    });
    // Switch top: 44.45 + 0.75 + 42.95 = 88.15 mm; flange underside: 90.35 - 3 = 87.35 mm.
    expect(validatePlacement(thick.p, thick.d).join(' ')).toContain(
      'Rail collision with device:switch:body',
    );
    expect(validatePlacement(thick.p, thick.p.devices[1]).join(' ')).toContain(
      'Physical collision with support-rail:ups:',
    );
    expect(supportRailAssessment(thick.p, thick.d)!.belowAllocationMm).toBe(1.55);
    expect(supportRailAssessment(thick.p, thick.d)!.advisories.join(' ')).toContain(
      'extends 1.55 mm below the allocated U range into U2',
    );
  });

  it('reports a flange below U1 and legs that exceed the clear opening', () => {
    const low = fixture('front', 1, { supportRails: rails({ thicknessMm: 2 }) });
    // 1.45 mm under the chassis, so a 2 mm flange is 0.55 mm below the rack U volume.
    expect(validatePlacement(low.p, low.d)).toContain(
      'Fixed support rail extends below the bottom of the rack U volume.',
    );
    expect(supportRailAssessment(low.p, low.d)!.belowAllocationMm).toBe(0.55);
    const fits = fixture('front', 1, { supportRails: rails({ thicknessMm: 1.45 }) });
    expect(validatePlacement(fits.p, fits.d)).toEqual([]);
    // 430 + 2 × 10 = 450 mm fits the 450 mm opening exactly; 10.5 mm does not.
    const exact = fixture('front', 3, { supportRails: rails({ thicknessMm: 10 }) });
    expect(validatePlacement(exact.p, exact.d)).not.toContain(
      'Chassis and fixed support rail legs exceed the rack clear opening.',
    );
    const wide = fixture('front', 3, { supportRails: rails({ thicknessMm: 10.5 }) });
    expect(validatePlacement(wide.p, wide.d)).toContain(
      'Chassis and fixed support rail legs exceed the rack clear opening.',
    );
  });

  it.each(['front', 'rear'] as const)(
    'validates the %s rail span against the post spacing and leaves an unknown range unverified',
    (face) => {
      const { p, d, def } = fixture(face);
      expect(validatePlacement(p, d)).toEqual([]);
      expect(supportRailAssessment(p, d)).toMatchObject({ spacingMm: 700, span: 'unverified' });
      expect(supportRailAssessment(p, d)!.advisories.join(' ')).toContain(
        'range is unknown; fit to the 700 mm screw-plane spacing is unverified',
      );
      def.supportRails = rails({ spanMinMm: 600, spanMaxMm: 750 });
      expect(validatePlacement(p, d)).toEqual([]);
      expect(supportRailAssessment(p, d)!.span).toBe('within');
      def.supportRails = rails({ spanMinMm: 600, spanMaxMm: 650 });
      expect(validatePlacement(p, d)).toContain(
        'Rack screw-plane spacing 700 mm is outside the fixed support rail range 600–650 mm.',
      );
      expect(supportRailAssessment(p, d)!.span).toBe('outside');
      def.supportRails = rails({ spanMinMm: 710, spanMaxMm: null });
      expect(validatePlacement(p, d).join(' ')).toContain('710–unknown mm');
      def.supportRails = rails({ spanMinMm: 600, spanMaxMm: null });
      expect(validatePlacement(p, d)).toEqual([]);
      expect(supportRailAssessment(p, d)!.span).toBe('unverified');
      expect(supportRailAssessment(p, d)!.advisories.join(' ')).toContain(
        'maximum spacing is unknown',
      );
    },
  );

  it('rejects rails spanning a change of post planes on either face', () => {
    // U15–U16 crosses from the 700 mm to the 650 mm rear plane.
    const { p, d } = fixture('front', 15);
    expect(validatePlacement(p, d)).toContain(
      'Fixed support rails cannot span a change of front/rear post planes.',
    );
    d.face = 'rear';
    expect(validatePlacement(p, d)).toContain(
      'Fixed support rails cannot span a change of front/rear post planes.',
    );
  });

  it('compares a known load rating with the mass and keeps unknowns unknown', () => {
    const { p, d, def } = fixture();
    expect(supportRailAssessment(p, d)).toMatchObject({ load: 'unknown', loadFraction: null });
    expect(supportRailAssessment(p, d)!.advisories.join(' ')).toContain(
      'load rating is unknown; the 44.28 kg equipment mass is not checked',
    );
    def.supportRails = rails({ loadRatingKg: 60 });
    expect(validatePlacement(p, d)).toEqual([]);
    expect(supportRailAssessment(p, d)!.load).toBe('within');
    expect(supportRailAssessment(p, d)!.loadFraction).toBeCloseTo(0.738, 9);
    def.supportRails = rails({ loadRatingKg: 44.28 });
    expect(validatePlacement(p, d)).toEqual([]);
    def.supportRails = rails({ loadRatingKg: 40 });
    expect(validatePlacement(p, d)).toContain(
      'Equipment mass 44.28 kg exceeds the fixed support rail load rating of 40 kg.',
    );
    expect(supportRailAssessment(p, d)!.load).toBe('exceeded');
    def.massKg = null;
    expect(validatePlacement(p, d)).toEqual([]);
    expect(supportRailAssessment(p, d)).toMatchObject({ load: 'unknown', loadFraction: null });
    expect(supportRailAssessment(p, d)!.advisories.join(' ')).toContain(
      'Equipment mass is unknown; the 40 kg fixed support rail load rating is not checked',
    );
  });

  it.each(['front', 'rear'] as const)('never hides the %s bezel depth-envelope overrun', (face) => {
    const { p, d } = fixture(face);
    // 30 mm of exterior in front of the front rails (front face), or 800 - 50 - 20 - 700 = 30 mm
    // behind the rear rails (rear face): either way less than the 40 mm bezel.
    if (face === 'front') p.rack.frontInsetMm = 30;
    else p.rack.sections[0].overallDepthMm = 800;
    expect(validateRack(p.rack)).toEqual([]);
    expect(validatePlacement(p, d)).toContain(
      'Physical depth exceeds the usable envelope in depth section lower.',
    );
  });

  it('keeps sliding rails a separate kind and refuses both on one chassis', () => {
    const { p, d } = fixture();
    d.rails = {
      memberLengthMm: 520,
      profileWidthMm: 8,
      profileHeightMm: 28,
      chassisLeadMm: 100,
      extensionMm: 0,
      evidence: 'example',
    };
    expect(validatePlacement(p, d).join(' ')).toContain(
      'Sliding rails cannot be fitted to equipment carried on its fixed support rails.',
    );
  });

  it('enforces definition consistency in the schema', () => {
    const p = createExampleProject(false);
    const base = upsDefinition(p);
    const fails = (patch: Partial<DeviceDefinition>) =>
      definitionSchema.safeParse({ ...base, ...patch }).success === false;
    expect(fails({})).toBe(false);
    expect(fails({ mounting: 'direct' })).toBe(true);
    expect(fails({ bodyMode: 'parts' })).toBe(true);
    expect(fails({ railMinMm: 600, railMaxMm: 800 })).toBe(true);
    expect(fails({ supportRails: rails({ spanMinMm: 800, spanMaxMm: 700 }) })).toBe(true);
    expect(fails({ supportRails: rails({ flangeWidthMm: 1.2 }) })).toBe(true);
    expect(fails({ supportRails: rails({ loadRatingKg: 0 }) })).toBe(true);
    expect(fails({ supportRails: { ...rails(), kind: 'sliding' as 'fixed-l' } })).toBe(true);
  });

  it('leaves legacy definitions and rails-mounted range checks unchanged', () => {
    const p = createExampleProject(false);
    for (const definition of p.definitions) {
      const parsed = definitionSchema.parse(clone(definition));
      expect('supportRails' in parsed).toBe(false);
      expect(parsed).toEqual(definition);
    }
    const server = p.definitions.find((d) => d.id === 'def-server')!;
    const device: Device = { ...ups(), id: 'server', definitionId: 'def-server' };
    p.devices = [device];
    expect(deviceSupportRailBoxes(p, device)).toEqual([]);
    expect(supportRailAssessment(p, device)).toBeNull();
    expect(validatePlacement(p, device)).toEqual([]);
    server.railMinMm = null;
    expect(validatePlacement(p, device)).toContain(
      'Rail mounting requires an explicit compatible minimum and maximum rail spacing.',
    );
  });
});

describe('fixed support rails in atomic edits and persistence', () => {
  beforeEach(() => {
    const p = createExampleProject(false);
    p.rack.sections[0].overallDepthMm = 850;
    useStore.getState().replace(p);
  });
  const store = () => useStore.getState();

  it('adds, places, round-trips, undoes and redoes a definition carrying support rails', () => {
    expect(
      store().edit('Add UPS', (p) => {
        p.definitions.push(upsDefinition(p, { supportRails: rails({ loadRatingKg: 60 }) }));
        p.devices.push(ups('rear'));
      }),
    ).toBe(true);
    const saved = store().project;
    const restored = parseProject(serializeProject(saved));
    expect(restored.definitions.find((d) => d.id === 'def-ups')!.supportRails).toEqual(
      rails({ loadRatingKg: 60 }),
    );
    expect(deviceSupportRailBoxes(restored, restored.devices[0])).toEqual(
      deviceSupportRailBoxes(saved, saved.devices[0]),
    );
    store().undo();
    expect(store().project.definitions.some((d) => d.id === 'def-ups')).toBe(false);
    store().redo();
    expect(store().project.definitions).toEqual(saved.definitions);
    expect(store().project.devices).toEqual(saved.devices);
    expect(deviceSupportRailBoxes(store().project, store().project.devices[0])).toEqual(
      deviceSupportRailBoxes(saved, saved.devices[0]),
    );
  });

  it('rejects a rating below the mass or an out-of-range rack spacing without changing the project', () => {
    store().edit('Add UPS', (p) => {
      p.definitions.push(upsDefinition(p, { supportRails: rails({ spanMaxMm: 750 }) }));
      p.devices.push(ups('front'));
    });
    const before = store().project;
    expect(
      store().edit('Low rating', (p) => {
        p.definitions.find((d) => d.id === 'def-ups')!.supportRails!.loadRatingKg = 40;
      }),
    ).toBe(false);
    expect(store().error).toContain('exceeds the fixed support rail load rating of 40 kg');
    expect(store().project).toBe(before);
    expect(
      store().edit('Deeper rack', (p) => {
        p.rack.sections[0].rearRailZMm = 760;
      }),
    ).toBe(false);
    expect(store().error).toContain('outside the fixed support rail range unknown–750 mm');
    expect(store().project).toBe(before);
    expect(
      store().edit('Unknown range', (p) => {
        p.definitions.find((d) => d.id === 'def-ups')!.supportRails!.spanMaxMm = null;
        p.rack.sections[0].rearRailZMm = 760;
      }),
    ).toBe(true);
  });
});
