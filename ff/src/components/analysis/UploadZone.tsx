import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  loading?: boolean;
  /** MIME types to accept. Defaults to a receipt photo or PDF. */
  acceptedTypes?: string[];
  /** The `accept` attribute of the hidden input. */
  accept?: string;
  title?: string;
  loadingTitle?: string;
  hint?: string;
  /** Shown instead of the default cloud icon. */
  icon?: LucideIcon;
}

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

/**
 * The drop target, shared by receipt analysis and statement import.
 *
 * The two flows differ only in what they accept and what they say, so they
 * are props rather than a second component — a duplicate would have drifted
 * on the drag states within a release.
 */
export function UploadZone({
  onFileSelected,
  loading,
  acceptedTypes = RECEIPT_TYPES,
  accept = 'image/*,application/pdf',
  title,
  loadingTitle,
  hint,
  icon: Icon = UploadCloud,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndSend = useCallback(
    (file: File) => {
      setError(null);
      if (!acceptedTypes.includes(file.type)) {
        setError(
          acceptedTypes.length === 1 && acceptedTypes[0] === 'application/pdf'
            ? 'Formato no soportado. Subí el resumen en PDF.'
            : 'Formato no soportado. Usá imágenes JPG, PNG, WEBP, HEIC o PDF.',
        );
        return;
      }
      if (file.size > MAX_SIZE) {
        setError('El archivo es demasiado grande. Máximo 10 MB.');
        return;
      }
      onFileSelected(file);
    },
    [acceptedTypes, onFileSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSend(file);
    },
    [validateAndSend],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSend(file);
    e.target.value = '';
  };

  return (
    <motion.div
      animate={dragOver ? { scale: 1.02 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-muted/30',
          loading && 'pointer-events-none opacity-50',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
        />
        <Icon className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {loading ? loadingTitle ?? 'Analizando comprobante…' : title ?? 'Subí tu comprobante'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hint ?? 'Foto o PDF — máximo 10 MB'}
        </p>
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
      </div>
    </motion.div>
  );
}
