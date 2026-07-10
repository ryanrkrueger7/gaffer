import type {
  GafferDocument,
  DocumentMeta,
  PlayerEntity,
  BallEntity,
  ConeEntity,
  MinigoalEntity,
  MannequinEntity,
  GoalEntity,
  PassAction,
  PassTarget,
  PassType,
  Path,
  RunAction,
  RunDestination,
  CarryAction,
  Beat,
  Annotation,
} from './types';

export function makeId(): string {
  return crypto.randomUUID();
}

export function createEmptyDocument(meta: Partial<DocumentMeta> = {}): GafferDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    meta: {
      id: meta.id ?? makeId(),
      name: meta.name ?? 'Untitled',
      description: meta.description ?? '',
      type: meta.type ?? 'drill',
      createdBy: meta.createdBy ?? '',
      createdAt: meta.createdAt ?? now,
    },
    stage: {
      fieldExtent: 'full',
      direction: 'up',
      teams: [{ id: 'A', color: 'yellow' }],
      markingLogic: false,
    },
    entities: [],
    actions: [],
    beats: [],
    annotations: [],
    markup: [],
  };
}

export function makePlayer(
  opts: Partial<Omit<PlayerEntity, 'id' | 'kind'>> = {}
): PlayerEntity {
  return {
    kind: 'player',
    id: makeId(),
    initial: opts.initial ?? { x: 0, y: 0 },
    team: opts.team,
    color: opts.color,
    radius: opts.radius,
    display: opts.display,
  };
}

export function makeBall(
  opts: Partial<Omit<BallEntity, 'id' | 'kind'>> = {}
): BallEntity {
  return {
    kind: 'ball',
    id: makeId(),
    initial: opts.initial ?? { x: 0, y: 0 },
    team: opts.team,
    color: opts.color,
    radius: opts.radius,
  };
}

export function makeCone(
  opts: Partial<Omit<ConeEntity, 'id' | 'kind'>> = {}
): ConeEntity {
  return {
    kind: 'cone',
    id: makeId(),
    initial: opts.initial ?? { x: 0, y: 0 },
    team: opts.team,
    color: opts.color,
    radius: opts.radius,
  };
}

export function makeMinigoal(
  opts: Partial<Omit<MinigoalEntity, 'id' | 'kind'>> = {}
): MinigoalEntity {
  return {
    kind: 'minigoal',
    id: makeId(),
    initial: opts.initial ?? { x: 0, y: 0 },
    team: opts.team,
    color: opts.color,
    radius: opts.radius,
  };
}

export function makeMannequin(
  opts: Partial<Omit<MannequinEntity, 'id' | 'kind'>> = {}
): MannequinEntity {
  return {
    kind: 'mannequin',
    id: makeId(),
    initial: opts.initial ?? { x: 0, y: 0 },
    team: opts.team,
    color: opts.color,
    radius: opts.radius,
  };
}

export function makeGoal(
  opts: Partial<Omit<GoalEntity, 'id' | 'kind'>> = {}
): GoalEntity {
  return {
    kind: 'goal',
    id: makeId(),
    initial: opts.initial ?? { x: 0, y: 0 },
    team: opts.team,
    color: opts.color,
    radius: opts.radius,
  };
}

export function makePass(opts: {
  entityId: string;
  beatId: string;
  target: PassTarget;
  path?: Path;
  passType?: PassType;
  start?: number;
  duration?: number;
}): PassAction {
  return {
    kind: 'pass',
    id: makeId(),
    entityId: opts.entityId,
    beatId: opts.beatId,
    target: opts.target,
    path: opts.path ?? { type: 'straight' },
    passType: opts.passType ?? 'ground',
    start: opts.start ?? 0,
    duration: opts.duration ?? 0.8,
  };
}

export function makeRun(opts: {
  entityId: string;
  beatId: string;
  destination: RunDestination;
  path?: Path;
  start?: number;
  duration?: number;
}): RunAction {
  return {
    kind: 'run',
    id: makeId(),
    entityId: opts.entityId,
    beatId: opts.beatId,
    destination: opts.destination,
    path: opts.path ?? { type: 'straight' },
    start: opts.start ?? 0,
    duration: opts.duration ?? 1.5,
  };
}

export function makeCarry(opts: {
  entityId: string;
  beatId: string;
  path?: Path;
  start?: number;
  duration?: number;
  destination?: { x: number; y: number };
}): CarryAction {
  const carry: CarryAction = {
    kind: 'carry',
    id: makeId(),
    entityId: opts.entityId,
    beatId: opts.beatId,
    path: opts.path ?? { type: 'straight' },
    start: opts.start ?? 0,
    duration: opts.duration ?? 1.0,
  };
  if (opts.destination != null) carry.destination = opts.destination;
  return carry;
}

export function makeBeat(opts: Partial<Omit<Beat, 'id'>> = {}): Beat {
  return {
    id: makeId(),
    order: opts.order ?? 0,
    annotationIds: opts.annotationIds ?? [],
    hold: opts.hold ?? 0,
  };
}

export function makeAnnotation(opts: {
  text: string;
  kind?: 'caption' | 'intent';
  beatId?: string;
  anchorEntityId?: string | null;
  holdAuto?: boolean;
}): Annotation {
  return {
    id: makeId(),
    text: opts.text,
    kind: opts.kind ?? 'caption',
    beatId: opts.beatId,
    anchorEntityId: opts.anchorEntityId ?? null,
    holdAuto: opts.holdAuto ?? true,
  };
}
