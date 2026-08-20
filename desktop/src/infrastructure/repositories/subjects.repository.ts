import {
  GroupRepository,
  SubjectInput,
  SubjectRepository,
  groupResponse,
  groupsResponse,
  http,
  okResponse,
  subjectResponse,
  subjectsResponse,
} from './academic-base';

export const subjectRepository: SubjectRepository = {
  async list() {
    return (await http.get('/subjects', { schema: subjectsResponse })).items;
  },

  async create(input: SubjectInput & { professorId: string }) {
    return (await http.post('/subjects', input, { schema: subjectResponse })).item;
  },

  async update(id: string, input: Partial<SubjectInput>) {
    return (await http.patch(`/subjects/${id}`, input, { schema: subjectResponse })).item;
  },

  async remove(id: string) {
    await http.delete(`/subjects/${id}`, { schema: okResponse });
  },
};

export const groupRepository: GroupRepository = {
  async list() {
    return (await http.get('/groups', { schema: groupsResponse })).items;
  },

  async create(input) {
    // Sin professorId: el backend se lo pone — el del docente que llama o el
    // dueño de la materia.
    return (await http.post('/groups', input, { schema: groupResponse })).item;
  },
};
