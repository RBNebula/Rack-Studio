import type { DeviceDefinition } from './model';
/** Incomplete source references. Zero denotes an unanswered field in this editor
 * draft only; schema validation prevents saving it as physical project geometry. */
const base: DeviceDefinition = {
  id: '',
  name: '',
  manufacturer: '',
  model: '',
  category: 'Custom equipment',
  widthMm: 0,
  heightU: 1,
  heightMm: 0,
  depthMm: 0,
  faceWidthMm: 0,
  earThicknessMm: null,
  shelf: null,
  plate: null,
  appearance: null,
  mounting: 'direct',
  bodyMode: 'box',
  color: '#415361',
  evidence: 'unknown',
  source: '',
  massKg: null,
  railMinMm: null,
  railMaxMm: null,
  screwOffsetsMm: [],
  ports: [],
  parts: [],
  frontImage: null,
  rearImage: null,
};
export const catalogueReferences: {
  definition: DeviceDefinition;
  published: string;
  missing: string;
}[] = [
  {
    definition: {
      ...base,
      id: 'ref-ups',
      name: 'APC SMT3000RMI2UC',
      manufacturer: 'APC / Schneider Electric',
      model: 'SMT3000RMI2UC',
      category: 'Power equipment',
      heightU: 2,
      heightMm: 86.1,
      massKg: 44.28,
      mounting: 'rails',
      source:
        'Schneider SmartConnect brochure maximum W480 × D683 × H86.1 mm, 2U, mass44.28kg; 8 IEC C13 + 1 IEC C19 outlets. 480 mm is maximum width, not verified chassis width. Ear-to-rear datum, chassis width, rail kit adjustment range, fasteners and port coordinates remain unknown. Source: https://ckm-content.se.com/ckmContent/sfc/servlet.shepherd/document/download/0691H00000FWcBtQAL',
    },
    published: '2U · maximum 480 W × 683 D × 86.1 H mm',
    missing: 'Chassis/ears, depth datum, exact rail kit and port geometry',
  },
  {
    definition: {
      ...base,
      id: 'ref-pdu',
      name: 'APC AP7922B',
      manufacturer: 'APC / Schneider Electric',
      model: 'AP7922B',
      category: 'Power equipment',
      heightU: 2,
      massKg: 4.5,
      source:
        'Schneider catalogue W445 × D114 × H89 mm (rounded), horizontal2U, 16 IEC C13 outlets, IEC60309 32A input. Nominal2U=88.9mm; precise height, chassis/ear width distinction, ear-depth datum, screw offsets and connector positions are unknown. Source: https://shop.se.com/pro/ca/en/product/rack-pdu-switched-2u-32a-230v-16-c13/',
    },
    published: '2U · 445 W × 114 D × 89 H mm (rounded)',
    missing: 'Ear/chassis datums, precise height, screw and port coordinates',
  },
];
