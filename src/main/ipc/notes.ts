import { app } from 'electron';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROADMAP } from '@shared/roadmap';
import { IPC } from '@shared/ipc';
import type { NotesOp } from '@shared/notes';
import type { MainContext } from '../context';
import { NotesStore } from '../services/notes-store';
import { emit, handle } from './handle';

export function registerNotesIpc(ctx: MainContext): NotesStore {
  const store = new NotesStore({
    file: join(app.getPath('userData'), 'notes.json'),
    onChange: (s) => emit(ctx.getWindow(), IPC.notes.onChange, s),
  });
  store.load();
  handle(IPC.notes.shifts, () => ctx.shifts.upcoming().slice(0, 30));
  // The feature wish-list, added once as a list the user can tick and grow.
  const seeded = join(app.getPath('userData'), 'roadmap-seeded');
  if (!existsSync(seeded)) {
    const l = store.addItems(
      'Alton roadmap',
      ROADMAP.map((r) => r.text),
    );
    for (const r of ROADMAP) {
      const item = l.items.find((i) => i.text === r.text.slice(0, 200));
      if (item && r.done) store.toggle(l.id, item.id);
    }
    try {
      writeFileSync(seeded, '1');
    } catch {
      /* try again next time */
    }
  }
  handle(IPC.notes.state, () => store.state());
  handle(IPC.notes.apply, (op) =>
    op && typeof op === 'object' && typeof (op as NotesOp).op === 'string'
      ? store.apply(op as NotesOp)
      : store.state(),
  );
  return store;
}
