import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { cn } from '@/lib/cn';
import { SPRING_SOFT } from '@/lib/motion';

/**
 * iOS Safari shrinks the *visual* viewport when the keyboard opens but leaves
 * the layout viewport alone, so a `bottom-0` panel ends up underneath it.
 * Growing the panel's bottom padding pushes its content back into view without
 * touching the transform that the dismiss drag owns.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
      });
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rendered visually; also used as the accessible name. */
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * A bottom sheet built on Radix Dialog, animated by framer so it shares the
 * app's spring instead of importing a second drawer library with its own.
 *
 * Only the grabber starts a drag (`dragListener={false}` + drag controls), so
 * scrolling or selecting inside the content never dismisses the sheet.
 */
export function BottomSheet({ open, onOpenChange, title, children, className }: BottomSheetProps) {
  const controls = useDragControls();
  const keyboardInset = useKeyboardInset();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {/* AnimatePresence has to sit *outside* the Portal: Radix renders the
          portal with `asChild` and would hand a ref to AnimatePresence, which
          isn't a forwardRef component. `forceMount` keeps Radix from
          unmounting the tree before framer can play the exit. */}
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <>
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]"
                />
              </DialogPrimitive.Overlay>

              <DialogPrimitive.Content asChild forceMount>
                <motion.div
                  drag="y"
                  dragControls={controls}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.4 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y + info.velocity.y * 0.08 > 90) onOpenChange(false);
                  }}
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={SPRING_SOFT}
                  className={cn(
                    'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-[24px] bg-surface shadow-float',
                    className,
                  )}
                  style={{ paddingBottom: keyboardInset }}
                >
                  <div
                    onPointerDown={(e) => controls.start(e)}
                    className="flex cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
                  >
                    <span className="h-1 w-9 rounded-full bg-hairline" />
                  </div>

                  <DialogPrimitive.Title className="px-5 pb-4 pt-2 text-[17px] font-semibold text-ink">
                    {title}
                  </DialogPrimitive.Title>

                  <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
                    {children}
                  </div>
                </motion.div>
              </DialogPrimitive.Content>
            </>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
