import { cn } from '@/lib/cn';
import { forwardRef, type HTMLAttributes } from 'react';

const Separator = forwardRef<HTMLHRElement, HTMLAttributes<HTMLHRElement>>(
  ({ className, ...props }, ref) => (
    <hr
      ref={ref}
      className={cn('shrink-0 bg-border h-px w-full', className)}
      {...props}
    />
  )
);
Separator.displayName = 'Separator';

export { Separator };
