import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { SPRING } from '@/lib/motion';

interface FloatingActionButtonProps {
  onClick: () => void;
  label: string;
}

/**
 * Portalled to `document.body` on purpose.
 *
 * `position: fixed` is viewport-relative only while no ancestor has a
 * transform — and PageShell is an animating `motion.div`, which during its
 * entrance would make this button scroll away with the page.
 */
export function FloatingActionButton({ onClick, label }: FloatingActionButtonProps) {
  return createPortal(
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.92 }}
      transition={SPRING}
      className="bottom-nav-offset fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-fab"
    >
      <Plus className="h-6 w-6" strokeWidth={2.4} />
    </motion.button>,
    document.body,
  );
}
