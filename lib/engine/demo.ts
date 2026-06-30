import {
  createEmptyDocument,
  makePlayer,
  makeBall,
  makePass,
  makeBeat,
  makeAnnotation,
} from './factory';
import { serializeDocument, deserializeDocument } from './serialize';

const doc = createEmptyDocument({ name: 'Day 1 Demo', type: 'drill' });

// Three team-A players with positionSlots
const p1 = makePlayer({ team: 'A', initial: { x: 200, y: 400 }, display: { positionSlot: 6 } });
const p2 = makePlayer({ team: 'A', initial: { x: 350, y: 250 }, display: { positionSlot: 8 } });
const p3 = makePlayer({ team: 'A', initial: { x: 500, y: 400 }, display: { positionSlot: 10 } });

// One ball starting with p1
const ball = makeBall({ initial: { x: 200, y: 400 } });

// One beat
const beat = makeBeat({ order: 0 });

// Pass: p1 -> p2, straight path, ground, 0.8 s
const pass = makePass({
  entityId: p1.id,
  beatId: beat.id,
  target: { entityId: p2.id },
  path: { type: 'straight' },
  passType: 'ground',
  start: 0,
  duration: 0.8,
});

// Caption annotation attached to the beat
const annotation = makeAnnotation({
  text: 'Switch play through the 6',
  kind: 'caption',
  beatId: beat.id,
  holdAuto: true,
});

beat.annotationIds.push(annotation.id);

doc.entities.push(p1, p2, p3, ball);
doc.actions.push(pass);
doc.beats.push(beat);
doc.annotations.push(annotation);

// Round-trip: serialize -> deserialize -> re-serialize
const first = serializeDocument(doc);
const roundTripped = deserializeDocument(first);
const second = serializeDocument(roundTripped);

console.log(first);
console.log(first === second ? 'ROUND-TRIP: PASS' : 'ROUND-TRIP: FAIL');
