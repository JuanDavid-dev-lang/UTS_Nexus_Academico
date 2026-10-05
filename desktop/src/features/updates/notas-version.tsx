import { useMemo } from 'react';
import { leerNotasVersion } from '@/domain/updates/notas-version';
import { cn } from '@/shared/lib/cn';

interface NotasVersionProps {
  notas: string;
  className?: string;
}

/** Notas de una versión, leídas del Markdown de la release (ver `domain/updates`). */
export function NotasVersion({ notas, className }: NotasVersionProps) {
  const bloques = useMemo(() => leerNotasVersion(notas), [notas]);
  if (bloques.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1.5 text-caption text-muted', className)}>
      {bloques.map((bloque, i) => {
        if (bloque.tipo === 'titulo') {
          return (
            <p key={i} className="mt-1.5 font-semibold text-text first:mt-0">
              {bloque.texto}
            </p>
          );
        }
        if (bloque.tipo === 'vineta') {
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span aria-hidden className="text-primary">
                •
              </span>
              <span>{bloque.texto}</span>
            </p>
          );
        }
        return <p key={i}>{bloque.texto}</p>;
      })}
    </div>
  );
}
