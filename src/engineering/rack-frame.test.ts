import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../testing/legacy-example';
import { clone, rackSchema, type Device, type Rack } from '../model';
import { allObstacles, segmentHitsBox, U_MM, validatePlacement } from './geometry';
import { genericRackFrameBoxes } from './rack-frame';

function flatRack(): Rack {
  const rack = clone(createExampleProject(false).rack);
  rack.sections = [{ ...rack.sections[0], id: 'flat', startU: 1, endU: rack.heightU }];
  rack.frameStyle = 'generic';
  rack.endPanels = { top: true, base: true, thicknessMm: 2 };
  return rack;
}

describe('reference rack frame and independent end plates', () => {
  it('forms four corner posts and a complete rectangular frame at both outer ends', () => {
    const rack = flatRack();
    const boxes = genericRackFrameBoxes(rack);
    expect(boxes.filter((box) => box.id.endsWith(':post'))).toHaveLength(4);
    expect(boxes.filter((box) => box.id.endsWith('front-beam'))).toHaveLength(2);
    expect(boxes.filter((box) => box.id.endsWith('rear-beam'))).toHaveLength(2);
    const sides = boxes.filter((box) => box.id.endsWith('side-beam'));
    expect(sides).toHaveLength(4);
    for (const side of sides) {
      expect(side.min[2]).toBe(-rack.frontInsetMm);
      expect(side.max[2]).toBe(rack.sections[0].overallDepthMm - rack.frontInsetMm);
      expect(side.max[0] - side.min[0]).toBe(rack.frameMm);
      expect(side.max[1] - side.min[1]).toBe(rack.frameMm);
    }
    expect(boxes.filter((box) => box.id.endsWith(':rail'))).toHaveLength(0);
  });

  it('places full-depth top and base plates outside the allocated U volume', () => {
    const rack = flatRack();
    rack.endPanels!.thicknessMm = 3.5;
    const boxes = genericRackFrameBoxes(rack);
    const top = boxes.find((box) => box.id === 'rack:panel:top')!;
    const base = boxes.find((box) => box.id === 'rack:panel:base')!;
    expect(top.min[1]).toBeCloseTo(rack.heightU * U_MM + rack.frameMm, 9);
    expect(top.max[1]).toBeCloseTo(rack.heightU * U_MM + rack.frameMm + 3.5, 9);
    expect(base.min[1]).toBe(-rack.frameMm - 3.5);
    expect(base.max[1]).toBe(-rack.frameMm);
    for (const plate of [top, base]) {
      expect(plate.min[0]).toBe(-rack.outerWidthMm / 2);
      expect(plate.max[0]).toBe(rack.outerWidthMm / 2);
      expect(plate.min[2]).toBe(-rack.frontInsetMm);
      expect(plate.max[2]).toBe(rack.sections[0].overallDepthMm - rack.frontInsetMm);
    }
  });

  it.each(['top', 'base'] as const)('allows the %s plate to be configured on its own', (end) => {
    const rack = flatRack();
    rack.endPanels = { top: end === 'top', base: end === 'base', thicknessMm: 2 };
    expect(genericRackFrameBoxes(rack).filter((box) => box.id.startsWith('rack:panel:'))).toEqual([
      expect.objectContaining({ id: `rack:panel:${end}` }),
    ]);
  });

  it('retains an open frame when end plates are disabled', () => {
    const rack = flatRack();
    rack.endPanels = { top: false, base: false, thicknessMm: 2 };
    expect(genericRackFrameBoxes(rack).some((box) => box.id.startsWith('rack:panel:'))).toBe(false);
  });

  it('uses the outer sections for plates and never creates plates or side beams at a depth step', () => {
    const rack = flatRack();
    const lower = rack.sections[0];
    rack.sections = [
      { ...lower, id: 'lower', endU: 15, overallDepthMm: 800 },
      { ...lower, id: 'upper', startU: 16, overallDepthMm: 750 },
    ];
    const boxes = genericRackFrameBoxes(rack);
    const panels = boxes.filter((box) => box.id.startsWith('rack:panel:'));
    expect(panels).toHaveLength(2);
    expect(panels.find((box) => box.id === 'rack:panel:base')!.max[2]).toBe(750);
    expect(panels.find((box) => box.id === 'rack:panel:top')!.max[2]).toBe(700);
    const sideBeams = boxes.filter((box) => box.id.endsWith('side-beam'));
    expect(sideBeams).toHaveLength(4);
    expect(sideBeams.every((box) => box.max[1] <= 0 || box.min[1] >= rack.heightU * U_MM)).toBe(
      true,
    );
    // The existing provisional transition crossbeams remain available separately.
    expect(boxes.some((box) => box.id === 'rack:lower:top:rear-beam')).toBe(true);
  });

  it('keeps explicit structural construction independent of configured top and base plates', () => {
    const rack = flatRack();
    rack.frameStyle = 'explicit';
    expect(genericRackFrameBoxes(rack).map((box) => box.id)).toEqual([
      'rack:panel:base',
      'rack:panel:top',
    ]);
    const panels = genericRackFrameBoxes(rack);
    expect(panels.find((box) => box.id === 'rack:panel:base')!.max[1]).toBe(0);
    expect(panels.find((box) => box.id === 'rack:panel:top')!.min[1]).toBeCloseTo(
      rack.heightU * U_MM,
      9,
    );
    rack.endPanels = null;
    expect(genericRackFrameBoxes(rack)).toEqual([]);
  });

  it('does not move the frame or plates when independently moving the mounting rails', () => {
    const rack = flatRack();
    const before = genericRackFrameBoxes(rack);
    rack.sections[0].frontRailZMm += 25;
    rack.sections[0].rearRailZMm -= 75;
    expect(genericRackFrameBoxes(rack)).toEqual(before);
  });

  it('does not move the mounting rails when plate dimensions change', () => {
    const project = createExampleProject(false);
    project.rack = flatRack();
    const rails = () => allObstacles(project).filter((box) => box.id.endsWith(':rail'));
    const before = rails();
    project.rack.endPanels = { top: false, base: true, thicknessMm: 4 };
    expect(rails()).toEqual(before);
    expect(allObstacles(project).find((box) => box.id === 'rack:panel:base')!.min[1]).toBe(
      -project.rack.frameMm - 4,
    );
  });

  it.each([1, 20])('leaves normal mounted equipment clear of the end plates at U%i', (startU) => {
    const project = createExampleProject(false);
    project.rack = flatRack();
    const device: Device = {
      id: 'switch',
      definitionId: 'def-switch',
      name: 'Reference switch',
      startU,
      face: 'front',
      supportId: null,
      installation: 'installed',
    };
    project.devices = [device];
    expect(validatePlacement(project, device)).toEqual([]);
  });

  it('shares a solid top plate with cable collision checks', () => {
    const project = createExampleProject(false);
    project.rack = flatRack();
    const top = allObstacles(project).find((box) => box.id === 'rack:panel:top')!;
    const y = top.min[1];
    expect(segmentHitsBox([0, y - 10, 300], [0, y + 10, 300], top)).toBe(true);
    expect(segmentHitsBox([0, y - 10, 300], [0, y - 1, 300], top)).toBe(false);
  });

  it('loads older projects without inventing end plates, irrespective of legacy showPanels', () => {
    const raw = { ...flatRack() } as Partial<Rack>;
    delete raw.endPanels;
    raw.showPanels = true;
    const rack = rackSchema.parse(raw);
    expect(rack.endPanels).toBeNull();
    expect(genericRackFrameBoxes(rack).some((box) => box.id.startsWith('rack:panel:'))).toBe(false);
  });

  it('roundtrips explicit plate settings and rejects nonpositive plate thickness', () => {
    const rack = flatRack();
    expect(rackSchema.parse(JSON.parse(JSON.stringify(rack))).endPanels).toEqual(rack.endPanels);
    expect(
      rackSchema.safeParse({ ...rack, endPanels: { top: true, base: false, thicknessMm: 0 } })
        .success,
    ).toBe(false);
  });
});
