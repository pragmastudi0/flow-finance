import { cn } from '@/lib/cn';
import { forwardRef, type HTMLAttributes } from 'react';

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  fallback?: string;
  src?: string;
  alt?: string;
}

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, fallback, src, alt, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
          className
        )}
        {...props}
      >
        {src ? (
          <img src={src} alt={alt ?? ''} className="aspect-square h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground">
            {fallback ? fallback.slice(0, 2).toUpperCase() : null}
          </div>
        )}
      </div>
    );
  }
);
Avatar.displayName = 'Avatar';

export { Avatar };
