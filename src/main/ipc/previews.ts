import { nativeImage } from 'electron';
import { lookup } from 'node:dns/promises';
import { IPC } from '@shared/ipc';
import { LinkPreviews, type Fetcher } from '../services/link-preview';
import { handle } from './handle';

export function registerPreviewsIpc(): void {
  const previews = new LinkPreviews({
    // Node's fetch: manual redirects come back as real 3xx responses we can check.
    fetch: ((url, init) => fetch(url, init)) as Fetcher,
    lookup: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
    thumbnail: (bytes) => {
      const img = nativeImage.createFromBuffer(bytes);
      if (img.isEmpty()) return null;
      const { width } = img.getSize();
      const small = width > 360 ? img.resize({ width: 360, quality: 'good' }) : img;
      return `data:image/jpeg;base64,${small.toJPEG(78).toString('base64')}`;
    },
  });
  handle(IPC.previews.get, (urls) =>
    previews.many(
      (Array.isArray(urls) ? urls : [])
        .filter((u): u is string => typeof u === 'string')
        .slice(0, 8),
    ),
  );
}
