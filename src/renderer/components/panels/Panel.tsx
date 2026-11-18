import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

export const panelVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

/** Parent container that staggers its Panels in by 60ms. */
export const staggerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

interface Props {
  code: string; // "SYS.03"
  title: string;
  chip?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({ code, title, chip, className = '', bodyClassName = '', children }: Props) {
  return (
    <motion.section
      variants={panelVariants}
      className={`hud-panel flex min-h-0 flex-col ${className}`}
      aria-label={title}
    >
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line/60 px-4">
        <span className="panel-title shrink-0 text-accent">{code}</span>
        <h2 className="panel-title min-w-[4ch] flex-1 truncate text-ice">{title}</h2>
        {chip}
      </header>
      <div
        className={`min-h-0 flex-1 overflow-hidden px-4 py-3 ${bodyClassName}`}
        // Scrolling bodies must be reachable by keyboard.
        tabIndex={bodyClassName.includes('overflow-y-auto') ? 0 : undefined}
        aria-label={bodyClassName.includes('overflow-y-auto') ? title : undefined}
      >
        {children}
      </div>
    </motion.section>
  );
}
