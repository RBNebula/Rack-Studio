import { describe, it, expect } from 'vitest';
import { createWorkspaceProject, baseCable } from '../testing/legacy-example';
import { parseProject, serializeProject, validateReferences } from '../data/project';
import { offsetSurfacePoint, resolveGuideLinks } from './wiring';
import { routeCable } from './routing';

describe('shared surface wiring guides', () => {
  it('routes between real PC sockets through 10 mm post-offset guides in either line direction', () => {
    const p = createWorkspaceProject(false),
      c = baseCable('test');
    p.devices = [8, 12].map((startU, i) => ({
      id: `pc${i}`,
      definitionId: 'def-user-rack-pc',
      name: `PC ${i}`,
      startU,
      face: 'front',
      supportId: null,
      installation: 'installed',
    }));
    c.source = { kind: 'device', deviceId: 'pc0', portId: 'front-usb-top' };
    c.destination = { kind: 'device', deviceId: 'pc1', portId: 'front-usb-top' };
    p.wiringGuides = [
      { id: 'p', name: 'Point', kind: 'point', position: [232.55, 450, -10] },
      { id: 'l', name: 'Line', kind: 'line', start: [-232.55, 400, -10], end: [-232.55, 440, -10] },
    ];
    for (const links of [
      [
        { guideId: 'p', reverse: false },
        { guideId: 'l', reverse: false },
      ],
      [
        { guideId: 'l', reverse: true },
        { guideId: 'p', reverse: false },
      ],
    ]) {
      c.guideLinks = links;
      const route = routeCable(p, c);
      expect(route.valid, route.issues.join()).toBe(true);
    }
  });
  it('uses a normalized world surface normal for an exact 10 mm offset', () => {
    expect(offsetSurfacePoint([20, 40, 80], [0, 0, -7])).toEqual([20, 40, 70]);
    const p = offsetSurfacePoint([0, 0, 0], [1, 1, 0]);
    expect(Math.hypot(...p)).toBeCloseTo(10, 12);
    expect(() => offsetSurfacePoint([0, 0, 0], [0, 0, 0])).toThrow();
  });
  it('resolves cable-specific order and line direction without copying shared geometry', () => {
    const p = createWorkspaceProject(),
      c = p.cables[0] ?? baseCable('test');
    p.wiringGuides = [
      { id: 'p', name: 'Point', kind: 'point', position: [1, 2, 3] },
      { id: 'l', name: 'Line', kind: 'line', start: [4, 5, 6], end: [7, 8, 9] },
    ];
    c.guideLinks = [
      { guideId: 'l', reverse: true },
      { guideId: 'p', reverse: false },
    ];
    expect(resolveGuideLinks(p, c).points).toEqual([
      [7, 8, 9],
      [4, 5, 6],
      [1, 2, 3],
    ]);
    if (p.wiringGuides[1].kind === 'line') p.wiringGuides[1].end[0] = 10;
    expect(resolveGuideLinks(p, c).points[0]).toEqual([10, 8, 9]);
    const second = { ...c, guideLinks: [{ guideId: 'l', reverse: false }] };
    expect(resolveGuideLinks(p, second).points).toEqual([
      [4, 5, 6],
      [10, 8, 9],
    ]);
  });
  it('rejects missing guides, duplicate links and zero length lines on import/reference validation', () => {
    const p = createWorkspaceProject();
    p.cables = [];
    p.wiringGuides = [{ id: 'l', name: 'Line', kind: 'line', start: [0, 0, 0], end: [0, 0, 0] }];
    expect(() => parseProject(serializeProject(p))).toThrow('at least 1 mm');
    if (p.wiringGuides[0].kind === 'line') p.wiringGuides[0].end[0] = 100;
    const c = baseCable('0');
    c.guideLinks = [
      { guideId: 'missing', reverse: false },
      { guideId: 'missing', reverse: false },
    ];
    p.cables = [c];
    expect(validateReferences(p).join()).toContain('missing wiring guide');
    expect(validateReferences(p).join()).toContain('duplicate wiring guide link');
  });
  it('round-trips guides and links while old projects remain compatible', () => {
    const p = createWorkspaceProject();
    p.cables = [];
    expect(parseProject(serializeProject(p)).wiringGuides).toBeUndefined();
    p.wiringGuides = [{ id: 'p', name: 'Shared', kind: 'point', position: [0, 300, -10] }];
    expect(parseProject(serializeProject(p)).wiringGuides).toEqual(p.wiringGuides);
  });
  function straight() {
    const p = createWorkspaceProject(false),
      c = baseCable('test');
    p.destinations = ['a', 'b'].map((id, i) => ({
      id,
      name: id,
      location: '',
      notes: '',
      position: [1000, 100, i * 400] as [number, number, number],
      ports: [
        {
          id: 'p',
          name: 'Port',
          connector: 'Example',
          multiple: false,
          surface: 'custom' as const,
          position: [0, 0, 0] as [number, number, number],
          direction: [0, 0, i ? -1 : 1] as [number, number, number],
        },
      ],
    }));
    c.source = { kind: 'external', destinationId: 'a', portId: 'p' };
    c.destination = { kind: 'external', destinationId: 'b', portId: 'p' };
    c.minBendRadiusMm = 20;
    p.wiringGuides = [
      { id: 'line', name: 'Line', kind: 'line', start: [1000, 100, 100], end: [1000, 100, 300] },
    ];
    c.guideLinks = [{ guideId: 'line', reverse: false }];
    return { p, c };
  }
  it('traverses every point of a linked line directly from A to B', () => {
    const { p, c } = straight(),
      route = routeCable(p, c);
    expect(route.valid, route.issues.join()).toBe(true);
    expect(route.lengthMm).toBeCloseTo(400, 9);
    expect(route.points).toContainEqual([1000, 100, 100]);
    expect(route.points).toContainEqual([1000, 100, 300]);
    expect(route.points.every((v) => v[0] === 1000 && v[1] === 100)).toBe(true);
  });
  it('reports a blocked line instead of accepting an automatic detour as following that line', () => {
    const { p, c } = straight();
    p.accessories = [
      {
        id: 'block',
        name: 'Block',
        kind: 'obstruction',
        position: [1000, 100, 200],
        size: [30, 30, 30],
        evidence: 'example',
        cableIds: [],
        parentId: null,
      },
    ];
    const route = routeCable(p, c);
    expect(route.valid).toBe(false);
    expect(route.issues.join()).toContain('line guide cannot be traversed straight');
  });
  it('reverses traversal rather than silently choosing the nearest line end', () => {
    const { p, c } = straight();
    c.guideLinks![0].reverse = true;
    const route = routeCable(p, c);
    const entry = route.points.findIndex((v) => v[2] === 300 && v[0] === 1000);
    const exit = route.points.findIndex((v, i) => i > entry && v[2] === 100 && v[0] === 1000);
    expect(entry).toBeGreaterThan(0);
    expect(exit).toBeGreaterThan(entry);
    expect(route.lengthMm).toBeGreaterThan(400);
  });
});
