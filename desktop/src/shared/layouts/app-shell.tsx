import { Suspense, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from '@/shared/layouts/sidebar';
import { TopBar } from '@/shared/layouts/topbar';
import { CommandPalette } from '@/shared/layouts/command-palette';
import { useHotkeys } from '@/shared/hooks/use-hotkeys';
import { SkeletonStatGrid } from '@/shared/ui/skeleton';
import { useTheme } from '@/state/theme.store';

/** Title and subtitle per route, so the top bar always says where the user is. */
const ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Panel académico', subtitle: 'Rendimiento, riesgo y asistencia de un vistazo' },
  '/estudiantes': { title: 'Estudiantes', subtitle: 'Consulta, crea y administra tus estudiantes' },
  '/materias': { title: 'Materias', subtitle: 'Gestiona materias y periodos académicos' },
  '/notas': { title: 'Notas', subtitle: 'Captura por corte y consulta el consolidado' },
  '/asistencia': { title: 'Asistencia', subtitle: 'Registra la asistencia por fecha y clase' },
  '/riesgo': { title: 'Riesgo académico', subtitle: 'Quién necesita intervención y por qué' },
  '/asistente': { title: 'Asistente IA', subtitle: 'Consulta tus datos académicos en lenguaje natural' },
  '/reportes': { title: 'Reportes', subtitle: 'Exporta consolidados en PDF y Excel' },
  '/notificaciones': { title: 'Notificaciones', subtitle: 'Alertas de riesgo y recordatorios' },
  '/configuracion': { title: 'Configuración', subtitle: 'Apariencia, servidor y sesión' },
};

const FALLBACK_META = { title: 'UTS Nexus Académico', subtitle: 'Espacio docente' };

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const cycleTheme = useTheme((state) => state.cycle);

  const meta = ROUTE_META[location.pathname] ?? FALLBACK_META;

  useHotkeys({
    'mod+k': () => setPaletteOpen(true),
    'mod+b': () => setCollapsed((value) => !value),
    'mod+shift+l': () => cycleTheme(),
    'mod+1': () => navigate('/'),
    'mod+2': () => navigate('/estudiantes'),
    'mod+3': () => navigate('/materias'),
    'mod+4': () => navigate('/notas'),
    'mod+5': () => navigate('/asistencia'),
    'mod+6': () => navigate('/riesgo'),
    'mod+7': () => navigate('/asistente'),
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          onOpenSearch={() => setPaletteOpen(true)}
        />

        <main className="min-h-0 flex-1">
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
    </div>
  );
}
