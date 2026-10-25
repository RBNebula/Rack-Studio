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
      id: 'ref-cisco',
      name: 'Cisco C1300-48P-4G',
      manufacturer: 'Cisco',
      model: 'C1300-48P-4G',
      category: 'Network switches',
      widthMm: 444.3,
      heightMm: 43.94,
      massKg: 5.43,
      source:
        'Cisco catalogue unit W444.3 × D350 × H43.94 mm, 1U, 48 RJ45 + 4 Gigabit SFP. Ear-plane-to-rear depth, ear width, mounting-hole offsets and port coordinates are unknown. Enter measured geometry; 0 means unresolved in this draft. Source: https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-1300-series-switches/nb-06-cat1300-ser-data-sheet-cte-en.html',
    },
    published: '1U · 444.3 W × 350 D × 43.94 H mm',
    missing: 'Ear datum, face width, screw offsets and port positions',
  },
  {
    definition: {
      ...base,
      id: 'ref-patch',
      name: 'Connectix CCS 20/20 Cat6A · 24 port',
      manufacturer: 'Connectix',
      model: '009-002-001-40',
      category: 'Patch panels',
      heightU: 1,
      source:
        'CableMonkey catalogue overall W483 × D98 × H44.5 mm (rounded), 1U, 24 shielded RJ45 / right-angle IDC. Chassis/tray width, ear-plane depth, precise height and screw/port coordinates are unknown. Do not treat 44.5 mm rounded catalogue height as exact overheight. Source: https://www.cablemonkey.co.uk/cat6a-patch-panels/9164-24-port-cat6a-ftp-shielded-ccs-2020-right-angled-patch-panel-5056045700394.html',
    },
    published: '1U · 483 W × 98 D × 44.5 H mm (catalogue)',
    missing: 'Chassis width, ear depth, precise height and port geometry',
  },
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
