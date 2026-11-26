import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogFooter } from '@/shared/ui';
import { useCurrentUser } from '@/state/session.store';
import { useEnLinea } from '@/state/connectivity.store';
import { usageRepository } from '@/infrastructure/repositories/usage.repository';
import {
  AVISO_USO_PARRAFOS,
  AVISO_USO_TITULO,
  debeMostrarAvisoUso,
} from '@/domain/usage/aviso-uso';

/**
 * Aviso de uso y privacidad para quien ya tenía cuenta.
 *
 * Una vez: al pulsar «Entendido» se marca en el servidor y `/auth/me` deja de
 * pedirlo. Si la marca no llega (sin red, servidor caído) el diálogo se cierra
 * igual y vuelve en el siguiente inicio: un aviso no puede bloquear el trabajo.
 * Sin conexión no se enseña, por lo mismo.
 */
export function AvisoUsoDialog() {
  const usuario = useCurrentUser();
  const enLinea = useEnLinea();
  const [descartado, setDescartado] = useState(false);

  const abierto = debeMostrarAvisoUso(usuario, enLinea, descartado);

  function entendido() {
    setDescartado(true);
    void usageRepository.marcarAvisoVisto().catch(() => undefined);
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? null : entendido())}>
      <DialogContent title={AVISO_USO_TITULO}>
        <div className="flex flex-col gap-3 text-body text-text">
          {AVISO_USO_PARRAFOS.map((parrafo) => (
            <p key={parrafo}>{parrafo}</p>
          ))}
        </div>
        <DialogFooter>
          <Button variant="primary" onClick={entendido}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
