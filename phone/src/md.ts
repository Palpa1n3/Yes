/** Tiny, safe Markdown → HTML: everything is escaped first and only known tags are added. */
export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function inline(src: string): string {
  const keep: string[] = [];
  const hold = (html: string): string => {
    keep.push(html);
    return `\uE000${keep.length - 1}\uE000`;
  };
  let s = src
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t: string, u: string) =>
      hold(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`),
    )
    .replace(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g, (u) =>
      hold(
        `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>`,
      ),
    )
    .replace(/`([^`]+)`/g, (_m, c: string) => hold(`<code>${esc(c)}</code>`));
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?])/g, '$1<i>$2</i>');
  return s.replace(/\uE000(\d+)\uE000/g, (_m, i: string) => keep[Number(i)] ?? '');
}

export function md(text: string): string {
  let out = '';
  text.split('```').forEach((part, i) => {
    if (i % 2) {
      out += `<pre><code>${esc(part.replace(/^[a-z]*\n/, ''))}</code></pre>`;
      return;
    }
    let list: 'ul' | 'ol' | null = null;
    let para: string[] = [];
    const flush = (): void => {
      if (para.length) out += `<p>${para.map(inline).join('<br>')}</p>`;
      para = [];
    };
    const end = (): void => {
      if (list) out += `</${list}>`;
      list = null;
    };
    for (const l of part.split('\n')) {
      let m: RegExpExecArray | null;
      if (!l.trim()) {
        flush();
        end();
      } else if ((m = /^\s*#{1,4}\s+(.*)$/.exec(l))) {
        flush();
        end();
        out += `<h3>${inline(m[1] ?? '')}</h3>`;
      } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) {
        flush();
        if (list !== 'ul') {
          end();
          out += '<ul>';
          list = 'ul';
        }
        out += `<li>${inline(m[1] ?? '')}</li>`;
      } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) {
        flush();
        if (list !== 'ol') {
          end();
          out += '<ol>';
          list = 'ol';
        }
        out += `<li>${inline(m[1] ?? '')}</li>`;
      } else if ((m = /^\s*>\s?(.*)$/.exec(l))) {
        flush();
        end();
        out += `<blockquote>${inline(m[1] ?? '')}</blockquote>`;
      } else if (/^\s*\|.*\|\s*$/.test(l)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
        flush();
        end();
        out += `<p>${inline(
          l
            .replace(/^\s*\||\|\s*$/g, '')
            .split('|')
            .map((c) => c.trim())
            .join(' · '),
        )}</p>`;
      } else {
        end();
        para.push(l);
      }
    }
    flush();
    end();
  });
  return out;
}

export function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>|]/g, '');
}
