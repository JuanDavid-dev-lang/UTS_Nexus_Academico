import { esWeb } from '@/core/platform/tauri';
import { hayRecorteWeb } from '@/domain/platform/web-access';
import { useUserRole } from '@/state/session.store';

/** ¿Esta sesión ve la versión web recortada? En la app y para ADMIN, no. */
export function useRecorteWeb(): boolean {
  return hayRecorteWeb(esWeb, useUserRole());
}
