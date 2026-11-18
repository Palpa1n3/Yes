import { app } from 'electron';
import { join } from 'node:path';
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
  handle(IPC.notes.state, () => store.state());
  handle(IPC.notes.apply, (op) =>
    op && typeof op === 'object' && typeof (op as NotesOp).op === 'string'
      ? store.apply(op as NotesOp)
      : store.state(),
  );
  return store;
}
