import {
  GroupRepository,
  SubjectInput,
  SubjectRepository,
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
};
