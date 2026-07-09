// Gaffer position knowledge — formation definitions and slot lookup.
// Consumed by positionInference.ts; never imported from lib/engine/*.

export type PositionId =
  | 'GK'
  | 'LB' | 'CB' | 'LCB' | 'RCB' | 'RB' | 'LWB' | 'RWB'
  | 'CDM'
  | 'LM' | 'CM' | 'RM'
  | 'CAM'
  | 'LW' | 'RW'
  | 'ST' | 'CF';

export type Third = 'defensive' | 'middle' | 'attacking';
export type Flank = 'left' | 'center' | 'right';

export interface RegionHint {
  third: Third;
  flank: Flank;
}

export interface FormationSlot {
  position: PositionId;
  regionHint: RegionHint;
}

export interface Formation {
  id: string;
  slots: FormationSlot[]; // always 11
}

const FORMATIONS: Record<string, Formation> = {
  '4-4-2': {
    id: '4-4-2',
    slots: [
      { position: 'GK',  regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'LB',  regionHint: { third: 'defensive', flank: 'left'   } },
      { position: 'LCB', regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'RCB', regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'RB',  regionHint: { third: 'defensive', flank: 'right'  } },
      { position: 'LM',  regionHint: { third: 'middle',    flank: 'left'   } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'center' } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'center' } },
      { position: 'RM',  regionHint: { third: 'middle',    flank: 'right'  } },
      { position: 'ST',  regionHint: { third: 'attacking', flank: 'center' } },
      { position: 'ST',  regionHint: { third: 'attacking', flank: 'center' } },
    ],
  },
  '4-3-3': {
    id: '4-3-3',
    slots: [
      { position: 'GK',  regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'LB',  regionHint: { third: 'defensive', flank: 'left'   } },
      { position: 'LCB', regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'RCB', regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'RB',  regionHint: { third: 'defensive', flank: 'right'  } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'left'   } },
      { position: 'CDM', regionHint: { third: 'middle',    flank: 'center' } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'right'  } },
      { position: 'LW',  regionHint: { third: 'attacking', flank: 'left'   } },
      { position: 'ST',  regionHint: { third: 'attacking', flank: 'center' } },
      { position: 'RW',  regionHint: { third: 'attacking', flank: 'right'  } },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    slots: [
      { position: 'GK',  regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'LB',  regionHint: { third: 'defensive', flank: 'left'   } },
      { position: 'LCB', regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'RCB', regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'RB',  regionHint: { third: 'defensive', flank: 'right'  } },
      { position: 'CDM', regionHint: { third: 'middle',    flank: 'left'   } },
      { position: 'CDM', regionHint: { third: 'middle',    flank: 'right'  } },
      { position: 'LW',  regionHint: { third: 'attacking', flank: 'left'   } },
      { position: 'CAM', regionHint: { third: 'attacking', flank: 'center' } },
      { position: 'RW',  regionHint: { third: 'attacking', flank: 'right'  } },
      { position: 'ST',  regionHint: { third: 'attacking', flank: 'center' } },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    slots: [
      { position: 'GK',  regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'CB',  regionHint: { third: 'defensive', flank: 'left'   } },
      { position: 'CB',  regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'CB',  regionHint: { third: 'defensive', flank: 'right'  } },
      { position: 'LWB', regionHint: { third: 'middle',    flank: 'left'   } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'left'   } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'center' } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'right'  } },
      { position: 'RWB', regionHint: { third: 'middle',    flank: 'right'  } },
      { position: 'ST',  regionHint: { third: 'attacking', flank: 'left'   } },
      { position: 'ST',  regionHint: { third: 'attacking', flank: 'right'  } },
    ],
  },
  '4-5-1': {
    id: '4-5-1',
    slots: [
      { position: 'GK',  regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'LB',  regionHint: { third: 'defensive', flank: 'left'   } },
      { position: 'LCB', regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'RCB', regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'RB',  regionHint: { third: 'defensive', flank: 'right'  } },
      { position: 'LM',  regionHint: { third: 'middle',    flank: 'left'   } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'left'   } },
      { position: 'CDM', regionHint: { third: 'middle',    flank: 'center' } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'right'  } },
      { position: 'RM',  regionHint: { third: 'middle',    flank: 'right'  } },
      { position: 'ST',  regionHint: { third: 'attacking', flank: 'center' } },
    ],
  },
  '3-4-3': {
    id: '3-4-3',
    slots: [
      { position: 'GK',  regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'CB',  regionHint: { third: 'defensive', flank: 'left'   } },
      { position: 'CB',  regionHint: { third: 'defensive', flank: 'center' } },
      { position: 'CB',  regionHint: { third: 'defensive', flank: 'right'  } },
      { position: 'LM',  regionHint: { third: 'middle',    flank: 'left'   } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'center' } },
      { position: 'CM',  regionHint: { third: 'middle',    flank: 'center' } },
      { position: 'RM',  regionHint: { third: 'middle',    flank: 'right'  } },
      { position: 'LW',  regionHint: { third: 'attacking', flank: 'left'   } },
      { position: 'CF',  regionHint: { third: 'attacking', flank: 'center' } },
      { position: 'RW',  regionHint: { third: 'attacking', flank: 'right'  } },
    ],
  },
};

export function getFormation(formation: string): Formation | null {
  return FORMATIONS[formation] ?? null;
}
