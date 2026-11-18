import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const open = (href?: string): void => {
  if (href && /^https?:\/\//i.test(href)) window.arc.app.openUrl(href);
};

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        open(href);
      }}
      title={href}
      className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h3 className="mb-1 mt-3 font-display text-[15px] font-semibold text-ice">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-1 mt-3 font-display text-[14px] font-semibold text-ice">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-1 mt-2.5 text-[13px] font-semibold text-ice">{children}</h4>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-2 text-[13px] font-semibold text-text-primary">{children}</h4>
  ),
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-accent/70">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-0.5 pl-5 marker:text-accent/70">{children}</ol>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ice">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-accent/50 pl-3 text-text-muted">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className="block overflow-x-auto whitespace-pre border border-line/60 bg-void/60 p-2 font-mono text-[12px]">
        {children}
      </code>
    ) : (
      <code className="bg-panel-raised px-1 font-mono text-[12px] text-ice">{children}</code>
    ),
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-line/40 px-2 py-1 align-top">{children}</td>,
  hr: () => <hr className="my-3 border-line/50" />,
  img: () => null, // never load remote images from model output
};

/** ARC's replies: Markdown (no raw HTML), HUD-styled, links open in the browser. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="arc-md min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
});
