// Gaffer engine types — canonical. Field names match §7 of GAFFER_ENGINE_SPEC.md exactly.

// ── Region (Zone shape) ──────────────────────────────────────────────────────

export type Region =
  | { shape: 'rect'; x: number; y: number; width: number; height: number }
  | { shape: 'polygon'; points: { x: number; y: number }[] };

// ── Entity ───────────────────────────────────────────────────────────────────

interface EntityBase {
  id: string;
  team?: 'A' | 'B' | 'neutral';
  color?: string;
  radius?: number;
}

export interface PlayerEntity extends EntityBase {
  kind: 'player';
  initial: { x: number; y: number };
  display?: {
    positionSlot?: number | null;
    jerseyNumber?: number | null;
    drillLabel?: string | null;
    roleName?: string | null;
    inferredPositionId?: string | null;
  };
}

export interface BallEntity extends EntityBase {
  kind: 'ball';
  initial: { x: number; y: number };
}

export interface ConeEntity extends EntityBase {
  kind: 'cone';
  initial: { x: number; y: number };
}

export interface MinigoalEntity extends EntityBase {
  kind: 'minigoal';
  initial: { x: number; y: number };
}

export interface MannequinEntity extends EntityBase {
  kind: 'mannequin';
  initial: { x: number; y: number };
}

export interface GoalEntity extends EntityBase {
  kind: 'goal';
  initial: { x: number; y: number };
}

export interface ZoneEntity extends EntityBase {
  kind: 'zone';
  region: Region;
}

export type Entity =
  | PlayerEntity
  | BallEntity
  | ConeEntity
  | MinigoalEntity
  | MannequinEntity
  | GoalEntity
  | ZoneEntity;

// ── Path ─────────────────────────────────────────────────────────────────────

export type Path =
  | { type: 'straight' }
  | { type: 'bezier'; cx: number; cy: number };

// ── Relative Timing ───────────────────────────────────────────────────────────

export interface RelTiming {
  ref: string; // actionId
  mode: 'with' | 'before' | 'after';
  gap?: number;
}

// ── Actions ───────────────────────────────────────────────────────────────────

interface ActionBase {
  id: string;
  entityId: string;
  beatId: string;
  start: number;
  duration: number;
}

export type PassTarget =
  | { entityId: string }
  | { x: number; y: number };

export type PassType = 'ground' | 'driven' | 'lofted' | 'cross' | 'switch' | 'shot';

export interface PassAction extends ActionBase {
  kind: 'pass';
  target: PassTarget;
  path: Path;
  passType: PassType;
}

export type RunDestination =
  | { x: number; y: number }
  | { landmark: string; side?: string };

export interface RunAction extends ActionBase {
  kind: 'run';
  destination: RunDestination;
  path: Path;
  relTiming?: RelTiming;
}

export interface CarryAction extends ActionBase {
  kind: 'carry';
  path: Path;
  /** Carry endpoint. When present, resolvePosition moves the carrier here (no concurrent Run needed). */
  destination?: { x: number; y: number };
}

export type MarkOffset = 'goal-side-tight' | 'zonal' | { dx: number; dy: number };

export interface MarkAction extends ActionBase {
  kind: 'mark';
  assignedTo: string; // entityId of the attacker
  offset: MarkOffset;
}

export interface HoldAction extends ActionBase {
  kind: 'hold';
}

export type Action = PassAction | RunAction | CarryAction | MarkAction | HoldAction;

// ── Beat ──────────────────────────────────────────────────────────────────────

export interface Beat {
  id: string;
  order: number;
  annotationIds: string[];
  hold: number;
}

// ── Annotation ────────────────────────────────────────────────────────────────

export interface Annotation {
  id: string;
  text: string;
  kind: 'caption' | 'intent';
  beatId?: string;
  anchorEntityId?: string | null;
  holdAuto: boolean;
}

// ── Stage ─────────────────────────────────────────────────────────────────────

export interface Stage {
  fieldExtent: 'full' | 'half' | 'blank';
  direction: 'up' | 'down';
  teams: { id: string; color: string }[];
  markingLogic: boolean;
}

// ── Markup ────────────────────────────────────────────────────────────────────

export interface Markup {
  id: string;
  shapeType: 'ellipse' | 'rect' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity?: number;
}

// ── Document meta ─────────────────────────────────────────────────────────────

export interface DocumentMeta {
  id: string;
  name: string;
  description: string;
  type: 'drill' | 'tactic' | 'scouting' | 'set_piece';
  createdBy: string;
  createdAt: string;
}

// ── GafferDocument ────────────────────────────────────────────────────────────

export interface GafferDocument {
  schemaVersion: 1;
  meta: DocumentMeta;
  stage: Stage;
  entities: Entity[];
  actions: Action[];
  beats: Beat[];
  annotations: Annotation[];
  markup: Markup[];
}
