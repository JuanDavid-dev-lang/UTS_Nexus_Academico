import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, type LucideIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Rubri } from '@/shared/ui/rubri';
import { INICIO_WEB, URL_DESCARGAS } from '@/domain/platform/web-access';

type Ventaja = { Icono: LucideIcon; titulo: string; detalle: string };

type Props = {
  titulo: string;
  descripcion: string;
  ventajas: Ventaja[];
  /** Una etiqueta sobre el título («Machine learning», «Solo en la app»). */
  etiqueta?: string;
};

/**
 * Lo que ve la versión web en una pantalla que vive en la aplicación.
 *
 * No es un error ni un 403: es una invitación. Dice qué hay ahí y lleva a la
 * página de descargas; el segundo botón devuelve a algo que sí funciona aquí.
 */
export function SoloEnLaApp({ titulo, descripcion, ventajas, etiqueta = 'En la aplicación' }: Props) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 170, damping: 20 }}
        className="w-full max-w-2xl"
      >
        <Card className="overflow-hidden p-0">
          <div className="surface-brand flex items-center gap-5 rounded-none px-8 py-7">
            <Rubri emotion="happy" size="medium" className="shrink-0 drop-shadow-lg" />
            <div className="flex flex-col gap-1.5">
              <span className="text-caption font-semibold uppercase tracking-[0.12em] text-accent">
                {etiqueta}
              </span>
              <h1 className="text-h3 font-bold leading-tight">{titulo}</h1>
              <p className="text-body opacity-85">{descripcion}</p>
            </div>
          </div>

          <ul className="grid gap-4 px-8 py-6 sm:grid-cols-2">
            {ventajas.map(({ Icono, titulo: nombre, detalle }) => (
              <li key={nombre} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icono className="size-4" aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="text-body font-semibold text-text">{nombre}</span>
                  <span className="text-caption text-muted">{detalle}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-8 py-4">
            <Button asChild variant="ghost">
              <Link to={INICIO_WEB}>Volver a Materias</Link>
            </Button>
            <Button asChild variant="primary">
              <a href={URL_DESCARGAS} target="_blank" rel="noopener noreferrer">
                <Download aria-hidden />
                Descargar la aplicación
              </a>
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
