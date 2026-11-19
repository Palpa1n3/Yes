import { Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useComposerStore } from '@renderer/stores/composerStore';
import { useUiStore } from '@renderer/stores/uiStore';

/** Drag files anywhere onto ARC to attach them to the next message. Also stops
 *  Electron from opening a dropped file as a page. */
export function DropZone() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent): boolean =>
      [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (): void => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent): void => e.preventDefault();
    const drop = (e: DragEvent): void => {
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      const ui = useUiStore.getState();
      if (ui.tab !== 'chat' && ui.tab !== 'overview') ui.setTab('chat');
      void useComposerStore.getState().add(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  if (!over) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-void/70">
      <div className="flex items-center gap-3 border-2 border-dashed border-accent px-8 py-6 font-mono text-[13px] uppercase tracking-[0.16em] text-accent">
        <Paperclip size={18} /> Drop to add to your message
      </div>
    </div>
  );
}
