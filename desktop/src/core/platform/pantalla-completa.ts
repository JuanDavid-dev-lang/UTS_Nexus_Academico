/**
 * Pantalla completa: F11, el botón de la barra superior y el del inicio de
 * sesión pasan todos por aquí.
 *
 * En la aplicación empaquetada es la ventana de Tauri (`setFullscreen`); en el
 * navegador de desarrollo, la Fullscreen API del documento. La elección se
 * recuerda en este equipo y se vuelve a aplicar al arrancar: quien usa la
 * aplicación en pantalla completa en el proyector del aula no tiene que
 * pedirlo en cada clase.
 */
import { useSyncExternalStore } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktop } from './tauri';

const CLAVE = 'uts.pantallaCompleta';

let activa = false;
const oyentes = new Set<() => void>();

function publicar(valor: boolean): void {
  if (valor === activa) return;
  activa = valor;
  for (const oyente of oyentes) oyente();
}

function recordar(valor: boolean): void {
  try {
    localStorage.setItem(CLAVE, valor ? '1' : '0');
  } catch {
    // Sin almacenamiento solo se pierde recordarlo en el próximo arranque.
  }
}

function recordada(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

async function leer(): Promise<boolean> {
  if (isDesktop) return getCurrentWindow().isFullscreen();
  return Boolean(document.fullscreenElement);
}

async function aplicar(valor: boolean): Promise<void> {
  if (isDesktop) {
    await getCurrentWindow().setFullscreen(valor);
  } else if (valor && !document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else if (!valor && document.fullscreenElement) {
    await document.exitFullscreen();
  }
  publicar(await leer());
}

export async function fijarPantallaCompleta(valor: boolean): Promise<void> {
  try {
    await aplicar(valor);
    recordar(valor);
  } catch {
    // El navegador la rechaza sin un gesto del usuario; la ventana no cambia y
    // el botón sigue mostrando el estado real.
    publicar(await leer().catch(() => false));
  }
}

export function alternarPantallaCompleta(): Promise<void> {
  return fijarPantallaCompleta(!activa);
}

/**
 * Engancha F11, sincroniza el estado cuando la ventana cambia por otra vía y
 * aplica la preferencia guardada. Se llama una vez en `main.tsx`.
 */
export function iniciarPantallaCompleta(): () => void {
  function tecla(evento: KeyboardEvent): void {
    if (evento.key !== 'F11' || evento.repeat) return;
    evento.preventDefault();
    void alternarPantallaCompleta();
  }
  // Salir con Esc (navegador) o con el gestor de ventanas no pasa por
  // `aplicar`: sin volver a leer, el botón se quedaría diciendo lo contrario.
  const sincronizar = (): void => {
    void leer()
      .then(publicar)
      .catch(() => undefined);
  };

  window.addEventListener('keydown', tecla);
  window.addEventListener('resize', sincronizar);
  document.addEventListener('fullscreenchange', sincronizar);

  if (recordada()) void fijarPantallaCompleta(true);
  else sincronizar();

  return () => {
    window.removeEventListener('keydown', tecla);
    window.removeEventListener('resize', sincronizar);
    document.removeEventListener('fullscreenchange', sincronizar);
  };
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** ¿Está la ventana en pantalla completa? Se actualiza sola. */
export function usePantallaCompleta(): boolean {
  return useSyncExternalStore(suscribir, () => activa);
}
