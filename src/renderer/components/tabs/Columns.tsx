import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { staggerVariants } from '@renderer/components/panels/Panel';

/** The 3 / 6 / 3 HUD grid. Each column is a vertical flex stack of panels. */
export function Columns({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  return (
    <motion.div
      variants={staggerVariants}
      initial="hidden"
      animate="show"
      className="grid h-full min-h-0 grid-cols-12 gap-4"
    >
      <div className="col-span-3 -m-1 flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-1">
        {left}
      </div>
      <div className="col-span-6 flex min-h-0 min-w-0 flex-col gap-4">{center}</div>
      <div className="col-span-3 -m-1 flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-1">
        {right}
      </div>
    </motion.div>
  );
}
