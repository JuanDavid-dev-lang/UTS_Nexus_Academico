import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BellRing,
  BrainCircuit,
  CalendarDays,
  FileSpreadsheet,
  KeyRound,
  MessageSquareText,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import { INICIO_WEB, RUTA_ASISTENTE, rutaEnWeb } from '@/domain/platform/web-access';
import { esWeb } from '@/core/platform/tauri';
import { useUserRole } from '@/state/session.store';
import { SoloEnLaApp } from './solo-en-la-app';

/**
 * Puerta de las pantallas en la versión web.
 *
 * Una ruta de layout entre `AppShell` y las pantallas: el menú y la paleta de
 * comandos ya no ofrecen lo que falta, pero una URL escrita a mano o un enlace
 * guardado llegarían igual. En la aplicación y para ADMIN no hace nada.
 */
export function GuardaWeb() {
  const rol = useUserRole();
  const { pathname } = useLocation();

  if (rutaEnWeb(pathname, esWeb, rol)) {
    // El asistente está en el menú de la web, pero como invitación.
    if (esWeb && rol !== 'ADMIN' && pathname.startsWith(RUTA_ASISTENTE)) return <AsistenteEnLaApp />;
    return <Outlet />;
  }
  // El panel no está en la web: se entra por Materias.
  if (pathname === '/') return <Navigate to={INICIO_WEB} replace />;
  return <PantallaEnLaApp />;
}

function AsistenteEnLaApp() {
  return (
    <SoloEnLaApp
      etiqueta="Machine learning"
      titulo="Rubri, tu asistente académico"
      descripcion="Funciona con machine learning sobre los datos de tus grupos. Para usarlo completo, descarga la aplicación."
      ventajas={[
        {
          Icono: BrainCircuit,
          titulo: 'Modelo de riesgo entrenado',
          detalle: 'Aprende de las notas y la asistencia reales, y mejora con cada semestre.',
        },
        {
          Icono: Sparkles,
          titulo: 'Explica cada alerta',
          detalle: 'Dice qué pesó en que un estudiante salga en riesgo, no solo que salió.',
        },
        {
          Icono: MessageSquareText,
          titulo: 'Pregúntale en tus palabras',
          detalle: '«¿Quién va perdiendo el segundo corte?» y te responde con tus datos.',
        },
        {
          Icono: FileSpreadsheet,
          titulo: 'Resúmenes listos',
          detalle: 'Borradores de informes y seguimientos para tus grupos.',
        },
      ]}
    />
  );
}

function PantallaEnLaApp() {
  return (
    <SoloEnLaApp
      titulo="Esta función está en la aplicación"
      descripcion="La versión web cubre el día a día del aula. Agenda, reportes y el resto de herramientas vienen con la aplicación."
      ventajas={[
        {
          Icono: CalendarDays,
          titulo: 'Agenda y actividades',
          detalle: 'Tus clases de la semana, entregas y recordatorios.',
        },
        {
          Icono: FileSpreadsheet,
          titulo: 'Reportes y actas',
          detalle: 'Consolidados en PDF y Excel con la plantilla institucional.',
        },
        {
          Icono: ScanLine,
          titulo: 'Importar desde foto o PDF',
          detalle: 'Listas de clase y planillas de notas leídas automáticamente.',
        },
        {
          Icono: BellRing,
          titulo: 'Avisos del sistema',
          detalle: 'Notificaciones en el escritorio, también con la app en la bandeja.',
        },
        {
          Icono: KeyRound,
          titulo: 'Sesión recordada',
          detalle: 'Quince días sin volver a entrar, solo en tu equipo.',
        },
      ]}
    />
  );
}
