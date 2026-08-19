import {
  EnrollmentRepository,
  RosterRow,
  Scope,
  enrollmentResponse,
  enrollmentsResponse,
  http,
  importResponse,
  okResponse,
  request,
  rosterScanResponse,
  scopeToQuery,
} from './academic-base';

export const enrollmentRepository: EnrollmentRepository = {
  async list(scope: Scope) {
    const data = await http.get('/enrollments', {
      schema: enrollmentsResponse,
      query: scopeToQuery(scope),
    });
    return data.items;
  },

  async enroll(input: { studentId: string; groupId: string }) {
    return (await http.post('/enrollments', input, { schema: enrollmentResponse })).item;
  },

  async importRoster(input: { groupId: string; students: RosterRow[] }) {
    const data = await http.post('/enrollments/bulk', input, { schema: importResponse });
    return data.count;
  },

  /**
   * Lee un listado desde un PDF o una foto. Solo PROPONE.
   *
   * La escritura sigue siendo `importRoster`, con lo que el docente revisó: una
   * cédula mal reconocida no da error, crea un estudiante que no existe y lo
   * matricula.
   */
  async scanRoster(groupId: string, file: File) {
    const body = new FormData();
    body.append('groupId', groupId);
    body.append('file', file);
    return request('/enrollments/import/scan', {
      method: 'POST',
      body,
      schema: rosterScanResponse,
      // El reconocimiento de una hoja tarda: el tiempo normal de petición se
      // queda corto y cortaría una lectura que iba bien.
      timeoutMs: 90_000,
    });
  },

  async remove(id: string) {
    await http.delete(`/enrollments/${id}`, { schema: okResponse });
  },
};
