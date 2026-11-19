import {
  IMAGE_MAX_EDGE,
  MAX_PDF_BYTES,
  MAX_TEXT_CHARS,
  kindOf,
  type Attachment,
  type AttachmentInfo,
} from '@shared/attachments';

export interface Prepared {
  att: Attachment;
  info: AttachmentInfo;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function shrink(file: Blob, maxEdge: number, quality: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.fillStyle = '#fff'; // transparent PNGs become JPEG on white
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', quality);
}

/** A file ready to send (pictures shrunk), or a plain reason it can't be. */
export async function prepareFile(file: File): Promise<Prepared | { error: string }> {
  const name = file.name || 'pasted image.png';
  const kind = kindOf(name, file.type);
  if (!kind) return { error: `${name}: only pictures, PDFs and text files can be added.` };
  try {
    if (kind === 'image') {
      const full = await shrink(file, IMAGE_MAX_EDGE, 0.85);
      const thumb = await shrink(file, 160, 0.7);
      const data = full.slice(full.indexOf(',') + 1);
      return {
        att: { name, kind, mime: 'image/jpeg', data, size: Math.round((data.length * 3) / 4) },
        info: { name, kind, size: file.size, thumb },
      };
    }
    if (kind === 'pdf') {
      if (file.size > MAX_PDF_BYTES) return { error: `${name} is too big (PDFs up to 20 MB).` };
      const data = toBase64(await file.arrayBuffer());
      return {
        att: { name, kind, mime: 'application/pdf', data, size: file.size },
        info: { name, kind, size: file.size },
      };
    }
    let text = await file.text();
    if (text.length > MAX_TEXT_CHARS)
      text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n[…file cut short: it was too long]`;
    return {
      att: { name, kind, mime: 'text/plain', data: text, size: file.size },
      info: { name, kind, size: file.size },
    };
  } catch {
    return { error: `${name} couldn't be read.` };
  }
}
