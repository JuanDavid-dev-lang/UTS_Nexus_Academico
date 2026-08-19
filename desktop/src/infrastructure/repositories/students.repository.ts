import {
  Scope,
  StudentInput,
  StudentRepository,
  directoryResponse,
  http,
  okResponse,
  scopeToQuery,
  studentResponse,
  studentsResponse,
} from './academic-base';

export const studentRepository: StudentRepository = {
  async list(scope?: Scope & { q?: string }) {
    const data = await http.get('/students', {
      schema: studentsResponse,
      query: scope ? { ...scopeToQuery(scope), q: scope.q } : undefined,
    });
    return data.items;
  },

  async search(q: string) {
    // El backend exige tres caracteres; cortar aquí evita el viaje y el 400.
    if (q.trim().length < 3) return [];
    const data = await http.get('/students/search', {
      schema: directoryResponse,
      query: { q: q.trim() },
    });
    return data.items;
  },

  async create(input: StudentInput) {
    return (await http.post('/students', input, { schema: studentResponse })).item;
  },

  async update(id: string, input: Partial<StudentInput>) {
    return (await http.patch(`/students/${id}`, input, { schema: studentResponse })).item;
  },

  async remove(id: string) {
    await http.delete(`/students/${id}`, { schema: okResponse });
  },

  async createMany(input: StudentInput[]) {
    const data = await http.post('/students/bulk', input, { schema: studentsResponse });
    return data.items.length;
  },
};
