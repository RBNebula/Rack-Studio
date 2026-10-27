// Writes tests/fixtures/test-unit.stp: a small synthetic AP214 model (no manufacturer data) for the
// STEP import browser test. Y is up and the front is +Z, like a CAD front view: a 200 × 30 × 150 mm
// body, a coloured port on the front at CAD +X, and a board hidden inside the body.
import { writeFileSync } from 'node:fs';

const lines = [];
let next = 1;
const add = (text) => {
  const id = next++;
  lines.push(`#${id}=${text};`);
  return `#${id}`;
};
const num = (v) => (Number.isInteger(v) ? `${v}.` : String(v));
const point = (p) => add(`CARTESIAN_POINT('',(${p.map(num).join(',')}))`);
const direction = (d) => add(`DIRECTION('',(${d.map(num).join(',')}))`);

const context = (() => {
  const length = add('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const angle = add('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const solid = add('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const uncertainty = add(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${length},'distance_accuracy_value','')`,
  );
  return add(
    `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${length},${angle},${solid})) REPRESENTATION_CONTEXT('','') )`,
  );
})();

/** A closed box solid with shared, oppositely oriented edges. */
function box(name, min, max) {
  const corner = (i) => [i & 4 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 1 ? max[2] : min[2]];
  const vertices = Array.from({ length: 8 }, (_, i) => add(`VERTEX_POINT('',${point(corner(i))})`));
  // Loops counter-clockwise seen from outside (corner index = 4x + 2y + z).
  const faces = [
    [0, 1, 3, 2, [-1, 0, 0]],
    [4, 6, 7, 5, [1, 0, 0]],
    [0, 4, 5, 1, [0, -1, 0]],
    [2, 3, 7, 6, [0, 1, 0]],
    [0, 2, 6, 4, [0, 0, -1]],
    [1, 5, 7, 3, [0, 0, 1]],
  ];
  const edges = new Map();
  const edge = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edges.has(key)) {
      const [s, e] = a < b ? [a, b] : [b, a];
      const from = corner(s),
        to = corner(e);
      const d = to.map((v, i) => v - from[i]);
      const length = Math.hypot(...d);
      const line = add(
        `LINE('',${point(from)},${add(`VECTOR('',${direction(d.map((v) => v / length))},${num(length)})`)})`,
      );
      edges.set(key, add(`EDGE_CURVE('',${vertices[s]},${vertices[e]},${line},.T.)`));
    }
    return add(`ORIENTED_EDGE('',*,*,${edges.get(key)},${a < b ? '.T.' : '.F.'})`);
  };
  const advanced = faces.map(([a, b, c, d, normal]) => {
    const loop = add(
      `EDGE_LOOP('',(${[edge(a, b), edge(b, c), edge(c, d), edge(d, a)].join(',')}))`,
    );
    const ref = corner(b).map((v, i) => v - corner(a)[i]);
    const len = Math.hypot(...ref);
    const plane = add(
      `PLANE('',${add(`AXIS2_PLACEMENT_3D('',${point(corner(a))},${direction(normal)},${direction(ref.map((v) => v / len))})`)})`,
    );
    return add(`ADVANCED_FACE('',(${add(`FACE_OUTER_BOUND('',${loop},.T.)`)}),${plane},.T.)`);
  });
  return add(`MANIFOLD_SOLID_BREP('${name}',${add(`CLOSED_SHELL('',(${advanced.join(',')}))`)})`);
}

function colour(solid, [r, g, b]) {
  const rgb = add(`COLOUR_RGB('',${num(r)},${num(g)},${num(b)})`);
  const fill = add(`FILL_AREA_STYLE('',(${add(`FILL_AREA_STYLE_COLOUR('',${rgb})`)}))`);
  const side = add(`SURFACE_SIDE_STYLE('',(${add(`SURFACE_STYLE_FILL_AREA(${fill})`)}))`);
  const style = add(
    `PRESENTATION_STYLE_ASSIGNMENT((${add(`SURFACE_STYLE_USAGE(.BOTH.,${side})`)}))`,
  );
  return add(`STYLED_ITEM('color',(${style}),${solid})`);
}

const solids = [
  ['body', [-100, 0, -150], [100, 30, 0], [0.2, 0.2, 0.22]],
  ['port', [60, 5, 0], [90, 20, 6], [1, 0.8, 0]],
  ['board', [-90, 5, -140], [90, 8, -10], [0, 0.5, 0]],
];
const items = solids.map(([name, min, max]) => box(name, min, max));
const styled = items.map((solid, i) => colour(solid, solids[i][3]));
const shape = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${items.join(',')}),${context})`);
add(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.join(',')}),${context})`);
const app = add("APPLICATION_CONTEXT('automotive design')");
add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${app})`);
const product = add(
  `PRODUCT('test-unit','Rack Studio STEP test unit','',(${add(`PRODUCT_CONTEXT('',${app},'mechanical')`)}))`,
);
const definition = add(
  `PRODUCT_DEFINITION('design','',${add(`PRODUCT_DEFINITION_FORMATION('','',${product})`)},${add(`PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`)})`,
);
add(
  `SHAPE_DEFINITION_REPRESENTATION(${add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`)},${shape})`,
);

writeFileSync(
  'tests/fixtures/test-unit.stp',
  [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Rack Studio synthetic STEP test unit'),'2;1');",
    "FILE_NAME('test-unit.stp','2026-10-27T00:00:00',(''),(''),'Rack Studio','','');",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n'),
);
