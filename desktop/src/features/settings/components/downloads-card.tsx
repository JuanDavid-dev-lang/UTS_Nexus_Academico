import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@/shared/ui';
import { descargaRepository } from '@/infrastructure/repositories/academic.repository';
import { enlaceDescarga, type EnlacesDescarga } from '@/domain/schemas/academic';
import { useUserRole } from '@/state/session.store';
import { toast } from '@/state/toast.store';

/** La página que lee estos enlaces. Se enseña para poder ir a comprobarlo. */
const PAGINA = 'https://juandavid-dev-lang.github.io/utsnexus.github.io/';

const CAMPOS = [
  {
    clave: 'windows' as const,
    etiqueta: 'Windows',
    ayuda: 'El instalador que termina en -setup.exe',
  },
  {
    clave: 'android' as const,
    etiqueta: 'Android',
    ayuda: 'El paquete que termina en .apk',
  },
  {
    clave: 'admin' as const,
    etiqueta: 'Panel de administración',
    ayuda: 'El paquete que termina en .msi',
  },
];

const VACIO: EnlacesDescarga = { windows: '', android: '', admin: '' };

/**
 * A dónde apuntan los botones de la página pública de descargas.
 *
 * Están aquí y no en el HTML del sitio para que publicar una versión no
 * obligue a editar y desplegar la página: se pega el enlace nuevo, se guarda, y
 * quien entre a partir de ese momento se baja la versión nueva.
 *
 * Solo se aceptan enlaces https de Dropbox o de GitHub. No es por comodidad:
 * el botón «Descargar» de una página pública es un sitio excelente para colar
 * un ejecutable, y una sesión de administrador robada no debería bastar para
 * hacerlo.
 */
export function DownloadsCard() {
  const role = useUserRole();
  const esAdmin = role === 'ADMIN';

  const [valores, setValores] = useState<EnlacesDescarga>(VACIO);
  const [tocado, setTocado] = useState(false);

  const enlaces = useQuery({
    queryKey: ['descargas'],
    queryFn: () => descargaRepository.get(),
    enabled: esAdmin,
  });

  // Se rellena una vez con lo que hay guardado; después manda lo que se escriba,
  // que si no un refetch de fondo borraría lo que estás editando.
  useEffect(() => {
    if (enlaces.data && !tocado) setValores(enlaces.data);
  }, [enlaces.data, tocado]);

  const guardar = useMutation({
    mutationFn: () => descargaRepository.save(valores),
    onSuccess: guardados => {
      setValores(guardados);
      setTocado(false);
      toast.success('Enlaces actualizados', 'La página ya está sirviendo estos.');
    },
    onError: causa => toast.fromError(causa, 'No se pudieron guardar'),
  });

  if (!esAdmin) return null;

  const errores = CAMPOS.map(campo => {
    const valor = valores[campo.clave];
    if (valor.trim() === '') return undefined;
    const revisado = enlaceDescarga.safeParse(valor);
    return revisado.success ? undefined : revisado.error.issues[0]?.message;
  });

  const hayError = errores.some(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-4 text-muted" aria-hidden />
          Enlaces de descarga
        </CardTitle>
        <CardDescription>
          A dónde llevan los botones de la página pública
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="rounded-lg bg-surface-alt p-3 text-caption text-muted">
          Cuando publiques una versión nueva, subí los archivos a Dropbox y pegá
          aquí sus enlaces. Acordate de cambiar el <code>dl=0</code> del final
          por <code>dl=1</code>: con <code>dl=0</code> se abre el visor de
          Dropbox en vez de descargarse. Dejá un campo vacío para que ese botón
          vuelva a la publicación de GitHub.
        </p>

        {CAMPOS.map((campo, indice) => (
          <Field
            key={campo.clave}
            label={campo.etiqueta}
            hint={campo.ayuda}
            error={errores[indice]}
          >
            {props => (
              <Input
                {...props}
                value={valores[campo.clave]}
                onChange={e => {
                  setTocado(true);
                  setValores(v => ({ ...v, [campo.clave]: e.target.value }));
                }}
                placeholder="https://www.dropbox.com/scl/fi/…?dl=1"
                spellCheck={false}
              />
            )}
          </Field>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            loading={guardar.isPending}
            disabled={guardar.isPending || hayError || enlaces.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="size-4" aria-hidden />
            Guardar enlaces
          </Button>

          <a
            className="ml-auto flex items-center gap-1.5 text-caption text-muted hover:text-text"
            href={PAGINA}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Ver la página
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
