import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Server, Wifi } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from '@/shared/ui';
import { useSession, useUserRole } from '@/state/session.store';
import { useSync } from '@/state/sync.store';
import { platform } from '@/core/platform/tauri';
import { normalizeServerUrl } from '@/core/config/env';
import { toast } from '@/state/toast.store';
import { cn } from '@/shared/lib/cn';

/**
 * Dirección del backend.
 *
 * Solo ADMIN. A un docente o a coordinación esta tarjeta no le sirve de nada
 * —el servidor lo fija la institución— y sí le puede costar caro: cambiarla
 * limpia la caché y deja la aplicación apuntando a ninguna parte, con un
 * «error de red» que no dice por qué. Quien necesite cambiarla antes de
 * entrar sigue teniéndola en la pantalla de inicio de sesión.
 */
export function ServerCard() {
  const role = useUserRole();
  const serverUrl = useSession((state) => state.serverUrl);
  const changeServerUrl = useSession((state) => state.changeServerUrl);
  const syncStatus = useSync((state) => state.status);
  const queryClient = useQueryClient();

  const [serverDraft, setServerDraft] = useState(serverUrl);
  const [checking, setChecking] = useState(false);

  // Si la dirección cambia por fuera (otra sesión, el arranque), el borrador
  // la sigue. Se ajusta durante el render, no en un efecto: React lo
  // documenta así y evita el render de más.
  const [urlVista, setUrlVista] = useState(serverUrl);
  if (urlVista !== serverUrl) {
    setUrlVista(serverUrl);
    setServerDraft(serverUrl);
  }

  if (role !== 'ADMIN') return null;

  async function handleSaveServer() {
    setChecking(true);
    try {
      const normalized = normalizeServerUrl(serverDraft);
      const online = await platform.backend.health(normalized);

      await changeServerUrl(normalized);
      queryClient.clear();

      if (online) {
        toast.success('Servidor actualizado', normalized);
      } else {
        toast.warning('Servidor guardado, pero sin respuesta', `No hay respuesta en ${normalized}.`);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="size-4 text-muted" aria-hidden />
          Servidor
        </CardTitle>
        <CardDescription>Dirección del backend académico. Cambiarla limpia la caché local.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <Field label="Dirección del servidor" className="flex-1">
            {(props) => (
              <Input
                {...props}
                value={serverDraft}
                onChange={(event) => setServerDraft(event.target.value)}
                placeholder="http://127.0.0.1:4000"
                className="font-mono text-caption"
              />
            )}
          </Field>
          <Button
            variant="primary"
            onClick={() => void handleSaveServer()}
            loading={checking}
            disabled={normalizeServerUrl(serverDraft) === serverUrl}
          >
            Guardar
          </Button>
        </div>

        <div className="flex items-center gap-2 text-caption text-muted">
          <Wifi className={cn('size-3.5', syncStatus === 'connected' ? 'text-success' : 'text-muted')} aria-hidden />
          Sincronización en tiempo real:{' '}
          <strong className="font-semibold text-text">
            {syncStatus === 'connected' ? 'activa' : syncStatus === 'connecting' ? 'conectando' : 'inactiva'}
          </strong>
        </div>
      </CardContent>
    </Card>
  );
}
