import { useMemo } from 'react';
import { leerNotasVersion, type BloqueNotas, type Tramo } from '@/domain/updates/notas-version';
import { cn } from '@/shared/lib/cn';

interface NotasVersionProps {
  notas: string;
  className?: string;
}

function Tramos({ tramos }: { tramos: Tramo[] }) {
  return (
    <>
      {tramos.map((tramo, i) => {
        if (tramo.codigo) {
          return (
            <code
              key={i}
              className="rounded-sm border border-border bg-surface-alt px-1 py-px font-mono text-text"
            >
              {tramo.texto}
            </code>
          );
        }
        if (tramo.negrita) {
          return (
            <strong key={i} className="font-semibold text-text">
              {tramo.texto}
            </strong>
          );
        }
        if (tramo.cursiva) return <em key={i}>{tramo.texto}</em>;
        return <span key={i}>{tramo.texto}</span>;
      })}
    </>
  );
}

function Bloque({ bloque }: { bloque: BloqueNotas }) {
  switch (bloque.tipo) {
    case 'titulo':
      return (
        <p
          className={cn(
            'mt-2 font-semibold text-text first:mt-0',
            bloque.nivel === 2 ? 'text-body' : 'text-caption',
          )}
        >
          <Tramos tramos={bloque.tramos} />
        </p>
      );
    case 'vineta':
      return (
        <p className={cn('flex gap-2', bloque.nivel === 1 ? 'pl-6' : 'pl-1')}>
          <span aria-hidden className="text-primary">
            {bloque.nivel === 1 ? '◦' : '•'}
          </span>
          <span>
            <Tramos tramos={bloque.tramos} />
          </span>
        </p>
      );
    case 'numerada':
      return (
        <p className="flex gap-2 pl-1">
          <span aria-hidden className="min-w-4 font-semibold tabular-nums text-primary">
            {bloque.numero}.
          </span>
          <span>
            <Tramos tramos={bloque.tramos} />
          </span>
        </p>
      );
    case 'cita':
      return (
        <p className="border-l-2 border-border-strong pl-3 italic">
          <Tramos tramos={bloque.tramos} />
        </p>
      );
    default:
      return (
        <p>
          <Tramos tramos={bloque.tramos} />
        </p>
      );
  }
}

/** Notas de una versión, leídas del Markdown de la release (ver `domain/updates`). */
export function NotasVersion({ notas, className }: NotasVersionProps) {
  const bloques = useMemo(() => leerNotasVersion(notas), [notas]);
  if (bloques.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1.5 text-caption leading-relaxed text-muted', className)}>
      {bloques.map((bloque, i) => (
        <Bloque key={i} bloque={bloque} />
      ))}
    </div>
  );
}
