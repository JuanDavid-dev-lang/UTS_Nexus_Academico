import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, type LucideIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
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
 *
 * Se maqueta como una página, no como un anuncio: título a la izquierda, la
 * lista de lo que trae la aplicación en filas con su filo, y las dos salidas
 * al pie. Antes era un bloque verde con degradado, una etiqueta en
 * versalitas sobre el título y una cuadrícula de iconos en cuadrados de
 * color: el molde de cualquier página de producto generada.
 */
export function SoloEnLaApp({ titulo, descripcion, ventajas, etiqueta = 'En la aplicación' }: Props) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-2xl"
      >
        <Card className="overflow-hidden p-0">
          <div className="flex items-start gap-5 border-b border-border px-8 pb-6 pt-7">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h1 className="text-h3 font-semibold leading-tight tracking-[-0.02em] text-text">
                {titulo}
              </h1>
              <p className="max-w-prose text-body text-muted">{descripcion}</p>
              <Badge tone="primary" size="sm" className="mt-1 self-start">
                {etiqueta}
              </Badge>
            </div>
            <Rubri emotion="happy" size="medium" animated={false} className="-my-2 hidden shrink-0 sm:block" />
          </div>

          <ul className="grid px-8 sm:grid-cols-2 sm:gap-x-8">
            {ventajas.map(({ Icono, titulo: nombre, detalle }) => (
              <li key={nombre} className="flex gap-3 border-b border-border py-4 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                <Icono className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className="text-body font-semibold text-text">{nombre}</span>
                  <span className="text-caption text-muted">{detalle}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-alt px-8 py-4">
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
