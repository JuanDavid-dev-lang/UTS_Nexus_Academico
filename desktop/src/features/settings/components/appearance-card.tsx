import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  Monitor,
  Moon,
  RotateCcw,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Switch,
} from '@/shared/ui';
import { esHexValido, normalizarHex } from '@/domain/appearance/color';
import { tokensDeTono, type Tono } from '@/domain/appearance/palettes';
import { useTheme, type ThemePreference } from '@/state/theme.store';
import { cn } from '@/shared/lib/cn';
import {
  MUESTRAS_COLOR_PROPIO,
  OPCIONES_ESQUINAS,
  OPCIONES_MODO,
  OPCIONES_TEXTO,
  OPCIONES_TONO,
  OPCIONES_VISION,
} from './appearance-options';

const ICONO_MODO: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Configuración → Apariencia.
 *
 * Todo se aplica al pulsar, sin botón de guardar: el cambio se ve en la propia
 * pantalla (incluida la vista previa) y se recuerda entre sesiones. Por eso
 * «Restablecer» está a mano: probar un tono no debería costar recordar cuál
 * había antes.
 */
export function AppearanceCard() {
  const restablecer = useTheme((state) => state.restablecerApariencia);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Apariencia</CardTitle>
            <CardDescription>
              Modo, tono de color, visión del color y estilo. Se aplica al momento y solo en este
              equipo.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={restablecer}>
            <RotateCcw className="size-4" aria-hidden />
            Restablecer
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-7">
        <SeccionModo />
        <SeccionTono />
        <SeccionVision />
        <SeccionEstilo />
        <VistaPrevia />
      </CardContent>
    </Card>
  );
}

function Seccion({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-semibold text-text">{titulo}</h3>
        {ayuda ? <p className="text-caption text-muted">{ayuda}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Tarjeta seleccionable. Botón con `aria-pressed` y no `role="radio"`: un grupo
 * de radios exige una sola parada de tabulador y flechas, y botones sueltos con
 * ese rol anunciarían un grupo que el teclado no recorre como tal.
 */
function Opcion({
  activa,
  onSelect,
  children,
  className,
}: {
  activa: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        activa
          ? 'border-primary bg-primary-soft shadow-sm'
          : 'border-border bg-surface hover:border-border-strong',
        className,
      )}
    >
      {activa ? <Check className="absolute right-3 top-3 size-4 text-primary" aria-hidden /> : null}
      {children}
    </button>
  );
}

function SeccionModo() {
  const preference = useTheme((state) => state.preference);
  const setPreference = useTheme((state) => state.setPreference);

  return (
    <Seccion titulo="Modo">
      <div role="group" aria-label="Modo" className="grid gap-3 @xl:grid-cols-3">
        {OPCIONES_MODO.map((opcion) => {
          const Icono = ICONO_MODO[opcion.value];
          const activa = preference === opcion.value;
          return (
            <Opcion key={opcion.value} activa={activa} onSelect={() => setPreference(opcion.value)}>
              <Icono className={cn('size-5', activa ? 'text-primary' : 'text-muted')} aria-hidden />
              <span className="text-body font-semibold text-text">{opcion.label}</span>
              <span className="text-caption text-muted">{opcion.description}</span>
            </Opcion>
          );
        })}
      </div>
    </Seccion>
  );
}

function SeccionTono() {
  const resolved = useTheme((state) => state.resolved);
  const tono = useTheme((state) => state.apariencia.tono);
  const colorPropio = useTheme((state) => state.apariencia.colorPropio);
  const setApariencia = useTheme((state) => state.setApariencia);

  return (
    <Seccion
      titulo="Tono de la interfaz"
      ayuda="Cambia botones, selección y acentos. Los contrastes se ajustan solos para que el texto se lea."
    >
      <div role="group" aria-label="Tono" className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
        {OPCIONES_TONO.map((opcion) => (
          <Opcion
            key={opcion.value}
            activa={tono === opcion.value}
            onSelect={() => setApariencia({ tono: opcion.value })}
          >
            <MuestraDeTono tono={opcion.value} modo={resolved} colorPropio={colorPropio} />
            <span className="text-body font-semibold text-text">{opcion.label}</span>
            <span className="text-caption text-muted">{opcion.description}</span>
          </Opcion>
        ))}
      </div>
      {tono === 'personalizado' ? <EditorColorPropio /> : null}
    </Seccion>
  );
}

/** Tres franjas con los colores reales del tono en el modo activo. */
function MuestraDeTono({
  tono,
  modo,
  colorPropio,
}: {
  tono: Tono;
  modo: 'light' | 'dark';
  colorPropio: string;
}) {
  const t = tokensDeTono(tono, modo, colorPropio);
  return (
    <span
      className="mb-1 flex h-9 w-full overflow-hidden rounded-lg border border-border"
      aria-hidden
    >
      <span
        className="flex-[3]"
        style={{
          background: `linear-gradient(135deg, ${t['brand-start']}, ${t['brand-end']})`,
        }}
      />
      <span className="flex-1" style={{ backgroundColor: t.primary }} />
      <span className="flex-1" style={{ backgroundColor: t.accent }} />
    </span>
  );
}

function EditorColorPropio() {
  const colorPropio = useTheme((state) => state.apariencia.colorPropio);
  const resolved = useTheme((state) => state.resolved);
  const primario = useMemo(
    () => tokensDeTono('personalizado', resolved, colorPropio).primary,
    [resolved, colorPropio],
  );
  const setApariencia = useTheme((state) => state.setApariencia);
  // Solo hay borrador mientras lo escrito no es un color: en cuanto lo es, se
  // aplica y el campo vuelve a leer el guardado.
  const [pendiente, setPendiente] = useState<string | null>(null);
  const borrador = pendiente ?? colorPropio;

  const valido = esHexValido(borrador);
  const aplicar = (valor: string) => {
    if (!esHexValido(valor)) {
      setPendiente(valor);
      return;
    }
    setPendiente(null);
    setApariencia({ colorPropio: normalizarHex(valor) });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-muted">Selector</span>
          <input
            type="color"
            value={valido ? normalizarHex(borrador).toLowerCase() : colorPropio.toLowerCase()}
            onChange={(event) => aplicar(event.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-border bg-surface p-1"
            aria-label="Elegir color propio"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-muted">Código hexadecimal</span>
          <Input
            value={borrador}
            onChange={(event) => aplicar(event.target.value)}
            maxLength={7}
            spellCheck={false}
            aria-invalid={!valido}
            className="w-32 font-mono uppercase"
          />
        </label>
      </div>
      {!valido ? (
        <p role="alert" className="text-caption font-medium text-danger">
          Escribe un color de seis cifras, por ejemplo #1D4ED8.
        </p>
      ) : primario !== normalizarHex(borrador) ? (
        <p className="text-caption text-muted">
          Para que el texto se lea, los botones usan <span className="font-mono">{primario}</span>,
          una variante del color elegido.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2" aria-label="Muestras rápidas">
        {MUESTRAS_COLOR_PROPIO.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => aplicar(hex)}
            aria-label={`Usar ${hex}`}
            aria-pressed={colorPropio === hex}
            className={cn(
              'size-8 rounded-full border-2 transition-transform hover:scale-110',
              colorPropio === hex ? 'border-text' : 'border-surface',
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  );
}

function SeccionVision() {
  const vision = useTheme((state) => state.apariencia.vision);
  const setApariencia = useTheme((state) => state.setApariencia);

  return (
    <Seccion
      titulo="Visión del color"
      ayuda="Adapta los colores de estado —aprobado, advertencia, riesgo— para que se distingan con daltonismo."
    >
      <div role="group" aria-label="Visión del color" className="grid gap-3 @xl:grid-cols-2">
        {OPCIONES_VISION.map((opcion) => (
          <Opcion
            key={opcion.value}
            activa={vision === opcion.value}
            onSelect={() => setApariencia({ vision: opcion.value })}
            className="pr-9"
          >
            <span className="text-body font-semibold text-text">{opcion.label}</span>
            <span className="text-caption text-muted">{opcion.description}</span>
          </Opcion>
        ))}
      </div>
    </Seccion>
  );
}

function SeccionEstilo() {
  const esquinas = useTheme((state) => state.apariencia.esquinas);
  const tamanoTexto = useTheme((state) => state.apariencia.tamanoTexto);
  const reducirMovimiento = useTheme((state) => state.apariencia.reducirMovimiento);
  const setApariencia = useTheme((state) => state.setApariencia);

  return (
    <Seccion titulo="Estilo">
      <GrupoCompacto
        etiqueta="Esquinas"
        opciones={OPCIONES_ESQUINAS}
        valor={esquinas}
        onChange={(valor) => setApariencia({ esquinas: valor })}
      />
      <GrupoCompacto
        etiqueta="Tamaño del texto"
        opciones={OPCIONES_TEXTO}
        valor={tamanoTexto}
        onChange={(valor) => setApariencia({ tamanoTexto: valor })}
      />
      <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5">
        <span>
          <span className="block text-body font-semibold text-text">Reducir movimiento</span>
          <span className="block text-caption text-muted">
            Quita animaciones y transiciones aunque el sistema no lo pida.
          </span>
        </span>
        <Switch
          checked={reducirMovimiento}
          onCheckedChange={(valor) => setApariencia({ reducirMovimiento: valor })}
          aria-label="Reducir movimiento"
        />
      </label>
    </Seccion>
  );
}

function GrupoCompacto<T extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
}: {
  etiqueta: string;
  opciones: { value: T; label: string; description: string }[];
  valor: T;
  onChange: (valor: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption font-medium text-muted">{etiqueta}</span>
      <div role="group" aria-label={etiqueta} className="grid grid-cols-3 gap-2">
        {opciones.map((opcion) => (
          <Opcion
            key={opcion.value}
            activa={valor === opcion.value}
            onSelect={() => onChange(opcion.value)}
            className="p-3"
          >
            <span className="text-body font-semibold text-text">{opcion.label}</span>
            <span className="text-caption text-muted">{opcion.description}</span>
          </Opcion>
        ))}
      </div>
    </div>
  );
}

/** Piezas reales de la interfaz con los tokens activos: lo que se ve es lo que hay. */
function VistaPrevia() {
  return (
    <Seccion titulo="Vista previa">
      <div className="flex flex-col gap-4 rounded-card border border-border bg-bg p-4">
        <div className="surface-brand rounded-xl p-4">
          <p className="text-caption opacity-80">Clase en curso</p>
          <p className="text-h3 font-semibold">Ingeniería del Software · A194</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Guardar notas</Button>
          <Button size="sm" variant="outline">
            Cancelar
          </Button>
          <Badge tone="accent">Nuevo</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">
            <CheckCircle2 className="size-3.5" aria-hidden /> Aprobado
          </Badge>
          <Badge tone="warning">
            <AlertTriangle className="size-3.5" aria-hidden /> Riesgo medio
          </Badge>
          <Badge tone="danger">
            <ShieldAlert className="size-3.5" aria-hidden /> Riesgo alto
          </Badge>
          <Badge tone="info">
            <Info className="size-3.5" aria-hidden /> Información
          </Badge>
        </div>
        <p className="text-body text-text">
          Promedio parcial <span className="font-semibold text-accent-strong">3.8</span>{' '}
          <span className="text-caption text-muted">· asistencia 92 %</span>
        </p>
      </div>
    </Seccion>
  );
}
