import { useEnLinea } from '@/state/connectivity.store';
import { RequiereConexion } from './requiere-conexion';

/**
 * Envuelve una pantalla que solo funciona con servidor.
 *
 * Sin conexión enseña el aviso EN VEZ de la pantalla, pero no la desmonta: un
 * corte de red de diez segundos en mitad de una conversación con el asistente
 * no debe borrar la conversación.
 */
export function ConConexion({
  funcion,
  children,
}: {
  funcion: string;
  children: React.ReactNode;
}) {
  const enLinea = useEnLinea();
  return (
    <>
      {enLinea ? null : <RequiereConexion funcion={funcion} />}
      <div hidden={!enLinea} className="contents">
        {children}
      </div>
    </>
  );
}
