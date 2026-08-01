import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { pageVariants } from '@/lib/motion';

interface PageShellProps {
  children: React.ReactNode;
  /** Content column width. Home runs narrow; Reports needs room for charts. */
  width?: 'narrow' | 'wide';
  className?: string;
}

/**
 * Every screen's outer frame.
 *
 * Six pages used to repeat the same `motion.div` + slate gradient + padding
 * wrapper by hand, which is how the app ended up with two visual languages.
 * The `pb-nav` here is load-bearing: the nav bar floats, so nothing reserves
 * space for it in flow.
 */
export function PageShell({ children, width = 'narrow', className }: PageShellProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className={cn('pb-nav min-h-full bg-surface', className)}
    >
      <div
        className={cn(
          'mx-auto w-full px-5',
          width === 'narrow' ? 'max-w-xl' : 'max-w-4xl',
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}
