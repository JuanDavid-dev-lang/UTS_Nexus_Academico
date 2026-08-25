/**
 * Mapa de invalidación en tiempo real.
 *
 * El fallo que estas pruebas evitan no rompe nada visiblemente: el backend
 * emite el evento, el cliente lo recibe, no encuentra la entidad en el mapa y
 * sale por `if (!keys) return`. La pantalla se queda con datos viejos y el
 * docente solo lo nota si recarga a mano. Ya pasó tres veces en este proyecto
 * —`announcement`, `registration`, `schedule`—, así que aquí queda fijado.
 */
import { describe, expect, it } from 'vitest';
import { INVALIDATION_MAP, type SyncEntity } from '@/core/realtime/socket';
import { queryKeys } from '@/core/api/query-keys';

/**
 * Entidades que el backend emite hoy. Añadir una aquí y no en el mapa hace
 * fallar la prueba, que es exactamente el aviso que faltaba.
 */
const ENTIDADES_DEL_BACKEND: SyncEntity[] = [
  'student',
  'subject',
  'group',
  'grade',
  'attendance',
  'notification',
  'announcement',
  'enrollment',
  'registration',
  'professor',
  'schedule',
  'calendar',
  'activity',
  'preferences',
  'reportTemplate',
  'feedback',
  'thesisFormat',
  'period',
  'attendanceCase',
  'clientError',
  'user',
];

describe('mapa de invalidación', () => {
  it('cubre todas las entidades que emite el backend', () => {
    for (const entidad of ENTIDADES_DEL_BACKEND) {
      expect(INVALIDATION_MAP[entidad], `falta la entidad "${entidad}"`).toBeDefined();
    }
  });

  it('ninguna entidad invalida una lista vacía', () => {
    for (const [entidad, claves] of Object.entries(INVALIDATION_MAP)) {
      expect(claves.length, `"${entidad}" no invalida nada`).toBeGreaterThan(0);
    }
  });

  it('las claves son prefijos raíz, no consultas concretas', () => {
    // Invalidar `['agenda','range','2026-08-10',…]` solo tiraría esa semana; el
    // prefijo raíz tira todas las vistas de la agenda, que es lo que cambia
    // cuando se mueve una clase.
    for (const [entidad, claves] of Object.entries(INVALIDATION_MAP)) {
      for (const clave of claves) {
        expect(clave.length, `"${entidad}" usa una clave demasiado específica`).toBe(1);
      }
    }
  });

  it('un cambio de horario tira también la agenda', () => {
    // Las clases del calendario salen del horario expandido: invalidar solo
    // `schedules` dejaría el calendario mostrando la hora vieja.
    expect(INVALIDATION_MAP.schedule).toContain(queryKeys.agenda.all);
    expect(INVALIDATION_MAP.schedule).toContain(queryKeys.schedules.all);
  });

  it('un evento del calendario tira la agenda', () => {
    expect(INVALIDATION_MAP.calendar).toContain(queryKeys.agenda.all);
    expect(INVALIDATION_MAP.activity).toContain(queryKeys.agenda.all);
  });

  it('cerrar un periodo tira las cachés que el cierre bloquea', () => {
    // Con el semestre cerrado, notas, asistencia y matrículas dejan de admitir
    // escrituras. Un formulario abierto que no se entere manda el cambio y
    // recibe un 409 que no espera.
    expect(INVALIDATION_MAP.period).toContain(queryKeys.grades.all);
    expect(INVALIDATION_MAP.period).toContain(queryKeys.attendance.all);
    expect(INVALIDATION_MAP.period).toContain(queryKeys.enrollments.all);
  });

  it('una actividad tira su propia pantalla, no solo la agenda', () => {
    // Antes solo caía la agenda: crear una actividad desde otro equipo no la
    // hacía aparecer en el listado hasta recargar.
    expect(INVALIDATION_MAP.activity).toContain(queryKeys.activities.all);
  });

  it('un caso de inasistencia tira riesgo e historial', () => {
    expect(INVALIDATION_MAP.attendanceCase).toContain(queryKeys.attendanceCases.all);
    expect(INVALIDATION_MAP.attendanceCase).toContain(queryKeys.timeline.all);
  });

  it('las preferencias tiran la caché de notificaciones', () => {
    // Es donde vive la antelación de los recordatorios: cambiarla en el
    // teléfono tiene que reflejarse aquí.
    expect(INVALIDATION_MAP.preferences).toContain(queryKeys.notifications.all);
  });
});
