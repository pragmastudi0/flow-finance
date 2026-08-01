/**
 * Shared motion vocabulary.
 *
 * The same spring was copy-pasted into three components with slightly different
 * numbers, so lists and cards settled at visibly different speeds. Everything
 * animates off these now.
 */
import type { Transition, Variants } from 'framer-motion';

/** Default: quick, barely overshoots. Rows, pills, sheets. */
export const SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.9,
};

/** Slower and looser. Big surfaces — balance figures, page entrances. */
export const SPRING_SOFT: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
};

/** For opacity/colour, where a spring reads as sloppy. */
export const EASE_IOS: Transition = {
  duration: 0.28,
  ease: [0.32, 0.72, 0, 1],
};

/** Page entrance. Deliberately small travel: big slides feel cheap. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: SPRING_SOFT },
};

/** List rows. `x` on exit is overridden by the swipe-to-delete direction. */
export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, height: 0, transition: EASE_IOS },
};
