import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tour, marcarTutorialVisto, tutorialVisto } from '@/features/tutorial/tour';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from '@/shared/layouts/sidebar';
import { TopBar } from '@/shared/layouts/topbar';
import { CommandPalette } from '@/shared/layouts/command-palette';
import { useHotkeys } from '@/shared/hooks/use-hotkeys';
import { LAYOUT_QUERIES, useMediaQuery } from '@/shared/hooks/use-media-query';
import { SkeletonStatGrid } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/cn';
import { Rubri } from '@/shared/ui';
import { useTheme } from '@/state/theme.store';
import { useSession } from '@/state/session.store';

/** Title and subtitle per route, so the top bar always says where the user is. */
const ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Panel académico', subtitle: 'Rendimiento, riesgo y asistencia de un vistazo' },
  '/estudiantes': { title: 'Estudiantes', subtitle: 'Consulta, crea y administra tus estudiantes' },
  '/materias': { title: 'Materias', subtitle: 'Gestiona materias y periodos académicos' },
  '/notas': { title: 'Notas', subtitle: 'Captura por corte y consulta el consolidado' },
  '/agenda': { title: 'Agenda', subtitle: 'Clases, evaluaciones y eventos de tu semana' },
  '/asistencia': { title: 'Asistencia', subtitle: 'Registra la asistencia por fecha y clase' },
  '/riesgo': { title: 'Riesgo académico', subtitle: 'Quién necesita intervención y por qué' },
  '/asistente': { title: 'Asistente IA', subtitle: 'Consulta tus datos académicos en lenguaje natural' },
  '/reportes': { title: 'Reportes', subtitle: 'Exporta consolidados en PDF y Excel' },
  '/notificaciones': { title: 'Notificaciones', subtitle: 'Alertas de riesgo y recordatorios' },
  '/configuracion': { title: 'Configuración', subtitle: 'Apariencia, servidor y sesión' },
};

const FALLBACK_META = { title: 'UTS Nexus Académico', subtitle: 'Espacio docente' };

export function AppShell() {
  // El tutorial se ofrece una sola vez por persona, la primera vez que entra.
  // Se guarda por usuario y no por instalación: en un equipo compartido, el
  // segundo docente también tiene derecho a que se lo expliquen.
  const usuarioTour = useSession((estado) => estado.user?.id);
  const [tourAbierto, setTourAbierto] = useState(false);

  useEffect(() => {
    if (usuarioTour && !tutorialVisto(usuarioTour)) setTourAbierto(true);
  }, [usuarioTour]);

  function cerrarTour() {
    if (usuarioTour) marcarTutorialVisto(usuarioTour);
    setTourAbierto(false);
  }

  // La disposición la decide el ancho disponible, no una preferencia guardada.
  // `override` es la excepción: si el docente contrae o expande a mano, esa
  // decisión manda mientras no cambie el tramo de ancho.
  const compact = useMediaQuery(LAYOUT_QUERIES.compact);
  const narrow = useMediaQuery(LAYOUT_QUERIES.narrow);
  const [override, setOverride] = useState<boolean | null>(null);

  // Al cruzar un umbral se descarta el override: lo que el usuario decidió para
  // una ventana ancha no tiene por qué valer en una estrecha.
  useEffect(() => setOverride(null), [compact, narrow]);

  const collapsed = override ?? compact;

  // Por debajo de `narrow` el menú no cabe al lado del contenido: se abre por
  // encima, como un cajón, y se cierra al navegar.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const cycleTheme = useTheme((state) => state.cycle);

  const meta = ROUTE_META[location.pathname] ?? FALLBACK_META;

  function toggleSidebar() {
    if (narrow) {
      setDrawerOpen((value) => !value);
      return;
    }
    setOverride(!collapsed);
  }

  useHotkeys({
    'mod+k': () => setPaletteOpen(true),
    'mod+b': () => toggleSidebar(),
    'mod+shift+l': () => cycleTheme(),
    'mod+1': () => navigate('/'),
    'mod+2': () => navigate('/estudiantes'),
    'mod+3': () => navigate('/materias'),
    'mod+4': () => navigate('/notas'),
    'mod+5': () => navigate('/asistencia'),
    'mod+6': () => navigate('/riesgo'),
    'mod+7': () => navigate('/asistente'),
    'mod+8': () => navigate('/agenda'),
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      {/* Ancho o compacto: el menú ocupa su sitio en la fila. */}
      {!narrow ? <Sidebar collapsed={collapsed} onToggle={toggleSidebar} /> : null}

      {/* Estrecho: el menú se superpone. El fondo oscurecido es lo que permite
          cerrarlo con un clic fuera, que es donde va la mano por costumbre. */}
      {narrow && drawerOpen ? (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div className="fixed inset-y-0 left-0 z-50 shadow-pop">
            <Sidebar collapsed={false} onToggle={() => setDrawerOpen(false)} />
          </div>
        </>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenNav={narrow ? () => setDrawerOpen(true) : undefined}
        />

        {/*
          `@container` es lo que hace que el contenido mida el hueco que le
          queda y no la ventana entera. Con los cortes de Tailwind por viewport,
          una ventana de 1280px pedía seis columnas aunque el menú se hubiera
          comido 264px y solo quedaran 1016.
        */}
        <main className="@container min-h-0 flex-1">
          {/*
            Page transitions are keyed on the pathname so React remounts the
            content. The fade is deliberately short: navigation should feel
            instant, and a long animation just makes the app feel slower.
          */}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
            >
              <Suspense
                fallback={
                  <div className="p-6">
                    <SkeletonStatGrid />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {location.pathname !== '/asistente' ? (
        <button
          type="button"
          aria-label="Abrir a Rubri, asistente de UTS Nexus"
          title="Pregúntale a Rubri"
          onClick={() => navigate('/asistente', { state: { rubriContext: { page: location.pathname } } })}
          className={cn(
            'fixed bottom-5 right-5 z-30 grid size-16 place-items-center overflow-hidden rounded-full',
            'border border-border bg-surface shadow-pop',
            'transition-transform duration-200 ease-out hover:-translate-y-1 active:translate-y-0',
            // `ring-focus` no existía: el token se llama `ring`, así que esta
            // clase no generaba ninguna regla y el botón se quedaba sin anillo
            // de foco. Con el teclado no había forma de saber que estaba
            // seleccionado.
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          <Rubri emotion="neutral" size="small" />
        </button>
      ) : null}
      {tourAbierto && <Tour onFinish={cerrarTour} />}
    </div>
  );
}
