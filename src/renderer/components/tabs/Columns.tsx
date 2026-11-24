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
      className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto hud:grid-cols-12 hud:overflow-visible"
    >
      <div className="-m-1 flex min-h-0 min-w-0 flex-col gap-4 p-1 hud:col-span-3 hud:overflow-y-auto">
        {left}
      </div>
      <div className="flex min-h-[420px] min-w-0 flex-col gap-4 hud:col-span-6 hud:min-h-0">
        {center}
      </div>
      <div className="-m-1 flex min-h-[320px] min-w-0 flex-col gap-4 p-1 hud:col-span-3 hud:min-h-0 hud:overflow-y-auto">
        {right}
      </div>
    </motion.div>
  );
}
