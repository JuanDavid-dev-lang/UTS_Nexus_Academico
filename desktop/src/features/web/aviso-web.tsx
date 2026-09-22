import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Globe, X } from 'lucide-react';
import { esWeb } from '@/core/platform/tauri';
import { URL_DESCARGAS } from '@/domain/platform/web-access';
import { useRecorteWeb } from '@/shared/hooks/use-recorte-web';

const CLAVE = 'uts.avisoWebCerrado';

function cerradoAntes(): boolean {
  try {
    return sessionStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

/**
 * Franja sobre el contenido en la versión web: dice dónde se está y lleva a
 * la descarga. Se cierra por pestaña —en `sessionStorage`, no para siempre—:
 * quien la cierra hoy no tiene por qué haberse enterado de la app mañana.
 */
export function AvisoWeb() {
  const recorte = useRecorteWeb();
  const [cerrado, setCerrado] = useState(cerradoAntes);

  function cerrar() {
    setCerrado(true);
    try {
      sessionStorage.setItem(CLAVE, '1');
    } catch {
      // Sin almacenamiento vuelve a salir al recargar; nada más.
    }
  }

  const mensaje = recorte
    ? 'Estás en la versión web: materias, estudiantes, notas, asistencia y riesgo. Agenda, reportes, el asistente completo y la sesión recordada están en la aplicación.'
    : 'Estás en la versión web con todas las funciones de administración. La aplicación añade la sesión recordada y las notificaciones del sistema.';

  return (
    <AnimatePresence initial={false}>
      {esWeb && !cerrado ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="shrink-0 overflow-hidden"
        >
          <div className="flex items-center gap-3 border-b border-border bg-primary-soft px-4 py-2 text-caption text-text xl:px-6">
            <Globe className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1">{mensaje}</p>
            <a
              href={URL_DESCARGAS}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Download className="size-3.5" aria-hidden />
              Descargar la app
            </a>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar aviso"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-text"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
