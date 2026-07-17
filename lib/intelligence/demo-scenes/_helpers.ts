// Shared helpers for all demo scene files.

import { narrate } from '../narrate';

export type NarrateResult = ReturnType<typeof narrate>;

export function printResult(title: string, result: NarrateResult): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
  result.clauses.forEach((c, i) => console.log(`  ${i + 1}. ${c.text}`));
  if (result.notes.length > 0) {
    console.log('  notes:');
    result.notes.forEach((n) => console.log(`    • ${n}`));
  }
  console.log(`  ok: ${result.ok}`);
}
