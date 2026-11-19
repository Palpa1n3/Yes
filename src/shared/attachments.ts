/** Files and pictures added to a chat message. */
export type AttachmentKind = 'image' | 'pdf' | 'text';

export interface Attachment {
  name: string;
  kind: AttachmentKind;
  /** image/jpeg, image/png, application/pdf, text/plain… */
  mime: string;
  /** base64 for images and PDFs; the text itself for text files. */
  data: string;
  size: number;
}

/** What's kept in the saved chat: no file contents, just a label and a tiny preview. */
export interface AttachmentInfo {
  name: string;
  kind: AttachmentKind;
  size: number;
  /** Small JPEG data: URL for pictures. */
  thumb?: string;
}

export const MAX_ATTACHMENTS = 5;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_CHARS = 300_000;
export const IMAGE_MAX_EDGE = 1568;

const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|log|xml|ya?ml|ini|cfg|conf|html?|css|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|sh|bat|ps1|sql|srt)$/i;

/** Which kind a file is, or null if Claude can't read it. */
export function kindOf(name: string, mime: string): AttachmentKind | null {
  if (/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(mime)) return 'image';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (/^text\//i.test(mime) || TEXT_EXT.test(name) || mime === 'application/json') return 'text';
  return null;
}

/** Claude content blocks for the attachments (before the message text). */
export function attachmentBlocks(list: Attachment[]): Array<Record<string, unknown>> {
  return list.map((a) =>
    a.kind === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } }
      : a.kind === 'pdf'
        ? {
            type: 'document',
            title: a.name,
            source: { type: 'base64', media_type: 'application/pdf', data: a.data },
          }
        : {
            type: 'document',
            title: a.name,
            source: { type: 'text', media_type: 'text/plain', data: a.data },
          },
  );
}
