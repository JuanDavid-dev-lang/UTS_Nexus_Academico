import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { connectDbOrThrow } from '../shared/db.js';
import { UserModel } from '../models/user.model.js';
import { ProfessorModel } from '../models/professor.model.js';
import { StudentModel } from '../models/student.model.js';
import { SubjectModel } from '../models/subject.model.js';
import { GroupModel } from '../models/group.model.js';
import { GradeModel } from '../models/grade.model.js';
import { EnrollmentModel } from '../models/enrollment.model.js';
import { AttendanceModel } from '../models/attendance.model.js';
import { ActivityModel } from '../models/activity.model.js';
import { ScheduleModel } from '../models/schedule.model.js';
import { NotificationModel } from '../models/notification.model.js';

/**
 * Contraseña de las cuentas sembradas.
 *
 * Antes estaba escrita aquí, y eso la publicaba: este archivo vive en un
 * repositorio abierto, así que cualquier instalación del proyecto tenía las
 * mismas credenciales conocidas por todo el mundo. Mientras el servidor estaba
 * en la red del campus el riesgo era acotado; con el backend en internet
 * significaba que cualquiera podía entrar como docente.
 *
 * Ahora se toma de `SEED_PASSWORD` y, si no está, se genera una al azar y se
 * muestra UNA vez al terminar. Dos instalaciones distintas nunca comparten
 * contraseña, y la que sale por pantalla no queda escrita en ningún archivo.
 */
const password =
  process.env.SEED_PASSWORD ??
  `Uts-${randomBytes(9).toString('base64url')}`;

const generada = !process.env.SEED_PASSWORD;

async function upsertUser(input: {
  email: string;
  fullName: string;
  role: 'ADMIN' | 'PROFESSOR' | 'COORDINATOR' | 'STUDENT';
  photoUrl?: string | null;
  studentId?: string | null;
}) {
  const passwordHash = await bcrypt.hash(password, 12);
  return UserModel.findOneAndUpdate(
    { email: input.email },
    {
      // La contraseña va en $set, no en $setOnInsert. Con $setOnInsert solo se
      // escribía al CREAR la cuenta, así que volver a sembrar no la cambiaba: un
      // despliegue que ya existía conservaba para siempre la contraseña con la
      // que nació. Cuando esa contraseña resultó estar publicada en el
      // repositorio, ejecutar el seed parecía rotarla y no rotaba nada.
      $set: { passwordHash },
      $setOnInsert: {
        email: input.email,
        role: input.role,
        fullName: input.fullName,
        photoUrl: input.photoUrl ?? null,
        studentId: input.studentId ?? null,
      },
    },
    { upsert: true, new: true }
  );
}

async function main() {
  // connectDbOrThrow ya valida MONGODB_URI y fija strictQuery.
  await connectDbOrThrow();

  // Se crean por su efecto: la demo necesita las tres cuentas, pero solo la del
  // docente se referencia más abajo.
  await upsertUser({ email: 'admin@uts.edu.co', fullName: 'Administrador UTS', role: 'ADMIN' });
  await upsertUser({ email: 'coordinador@uts.edu.co', fullName: 'Coordinador UTS', role: 'COORDINATOR' });
  const professor = await upsertUser({ email: 'docente@uts.edu.co', fullName: 'Docente Demo UTS', role: 'PROFESSOR' });

  await ProfessorModel.findOneAndUpdate(
    { userId: professor!.id },
    {
      $setOnInsert: {
        userId: professor!.id,
        employeeCode: 'DOC-001',
        department: 'Ingenierías',
        title: 'Docente',
        photoUrl: null,
      },
    },
    { upsert: true, new: true }
  );

  const students = await Promise.all([
    StudentModel.findOneAndUpdate(
      { code: '20241001' },
      {
        $setOnInsert: {
          code: '20241001',
          fullName: 'Juan Pérez',
          email: 'juan.perez@uts.edu.co',
          program: 'Ingeniería de Sistemas',
          attendanceRate: 88,
          academicPerformance: 3.6,
        },
      },
      { upsert: true, new: true }
    ),
    StudentModel.findOneAndUpdate(
      { code: '20241002' },
      {
        $setOnInsert: {
          code: '20241002',
          fullName: 'Ana Ruiz',
          email: 'ana.ruiz@uts.edu.co',
          program: 'Ingeniería Industrial',
          attendanceRate: 72,
          academicPerformance: 2.8,
        },
      },
      { upsert: true, new: true }
    ),
    StudentModel.findOneAndUpdate(
      { code: '20241003' },
      {
        $setOnInsert: {
          code: '20241003',
          fullName: 'Carlos Gómez',
          email: 'carlos.gomez@uts.edu.co',
          program: 'Ingeniería de Sistemas',
          attendanceRate: 94,
          academicPerformance: 4.4,
        },
      },
      { upsert: true, new: true }
    ),
  ]);

  const subject = await SubjectModel.findOneAndUpdate(
    { code: 'SIS-301' },
    {
      $setOnInsert: {
        name: 'Arquitectura de Software',
        code: 'SIS-301',
        professorId: professor!.id,
        period: '2026-1',
        credits: 3,
        studentIds: students.filter(Boolean).map(s => s!.id),
      },
    },
    { upsert: true, new: true }
  );

  const group = await GroupModel.findOneAndUpdate(
    { subjectId: subject!.id, name: 'Grupo A', period: '2026-1' },
    {
      $setOnInsert: {
        name: 'Grupo A',
        subjectId: subject!.id,
        professorId: professor!.id,
        period: '2026-1',
        studentIds: students.filter(Boolean).map(s => s!.id),
      },
    },
    { upsert: true, new: true }
  );

  await ScheduleModel.findOneAndUpdate(
    { subjectId: subject!.id, dayOfWeek: 2, startTime: '08:00', teacherId: professor!.id },
    {
      $setOnInsert: {
        subjectId: subject!.id,
        groupId: group!.id,
        teacherId: professor!.id,
        dayOfWeek: 2,
        startTime: '08:00',
        endTime: '10:00',
        classroom: 'Bloque B-201',
        modality: 'PRESENTIAL',
      },
    },
    { upsert: true, new: true }
  );

  // Matrículas (relación real estudiante ↔ grupo).
  await Promise.all(
    students.filter(Boolean).map(student =>
      EnrollmentModel.findOneAndUpdate(
        { studentId: student!.id, groupId: group!.id, period: '2026-1' },
        {
          $setOnInsert: {
            studentId: student!.id,
            groupId: group!.id,
            subjectId: subject!.id,
            professorId: professor!.id,
            period: '2026-1',
            enrollmentStatus: 'ACTIVE',
          },
        },
        { upsert: true, new: true }
      )
    )
  );

  // Usuario estudiante de demo (login self-service en Android).
  await upsertUser({
    email: 'estudiante@uts.edu.co',
    fullName: 'Ana Ruiz',
    role: 'STUDENT',
    studentId: students[1]!.id,
  });

  // Notas completas: 3 cortes × 3 componentes (trabajos/parciales/autoevaluación).
  const componentes: Array<'TRABAJOS' | 'PARCIALES' | 'AUTOEVALUACION'> = ['TRABAJOS', 'PARCIALES', 'AUTOEVALUACION'];
  const notasDemo: Record<string, number> = { '20241001': 4.1, '20241002': 2.6, '20241003': 4.5 };
  await Promise.all(
    students.filter(Boolean).flatMap(student =>
      ([1, 2, 3] as const).flatMap(corte =>
        componentes.map(componentType =>
          GradeModel.findOneAndUpdate(
            { studentId: student!.id, subjectId: subject!.id, period: '2026-1', corte, componentType, label: 'Nota' },
            {
              $setOnInsert: {
                studentId: student!.id,
                subjectId: subject!.id,
                groupId: group!.id,
                teacherId: professor!.id,
                corte,
                componentType,
                label: 'Nota',
                score: notasDemo[student!.code] ?? 3.5,
                maxScore: 5,
                period: '2026-1',
              },
            },
            { upsert: true, new: true }
          )
        )
      )
    )
  );

  await Promise.all(
    students
      .filter(Boolean)
      .map(student =>
        AttendanceModel.findOneAndUpdate(
          { studentId: student!.id, subjectId: subject!.id, date: new Date('2026-06-24') },
          {
            $setOnInsert: {
              studentId: student!.id,
              subjectId: subject!.id,
              groupId: group!.id,
              teacherId: professor!.id,
              date: new Date('2026-06-24'),
              present: student!.code !== '20241002',
              notes: student!.code === '20241002' ? 'Inasistencia repetida' : '',
            },
          },
          { upsert: true, new: true }
        )
      )
  );

  await ActivityModel.findOneAndUpdate(
    { subjectId: subject!.id, title: 'Entrega 1', dueAt: new Date('2026-06-30T23:59:59Z') },
    {
      $setOnInsert: {
        title: 'Entrega 1',
        description: 'Actividad inicial de arquitectura de software.',
        subjectId: subject!.id,
        groupId: group!.id,
        teacherId: professor!.id,
        dueAt: new Date('2026-06-30T23:59:59Z'),
        weight: 0.2,
        status: 'OPEN',
      },
    },
    { upsert: true, new: true }
  );

  await Promise.all([
    NotificationModel.findOneAndUpdate(
      { userId: professor!.id, title: 'Clase próxima' },
      {
        $setOnInsert: {
          userId: professor!.id,
          title: 'Clase próxima',
          message: 'Tienes clase de Arquitectura de Software el martes 8:00 AM.',
          type: 'CLASS',
          channel: 'IN_APP',
          metadata: { subjectCode: 'SIS-301' },
        },
      },
      { upsert: true, new: true }
    ),
    NotificationModel.findOneAndUpdate(
      { userId: professor!.id, title: 'Estudiante en riesgo' },
      {
        $setOnInsert: {
          userId: professor!.id,
          title: 'Estudiante en riesgo',
          message: 'Ana Ruiz presenta bajo rendimiento y asistencia.',
          type: 'RISK',
          channel: 'IN_APP',
          metadata: { studentCode: '20241002' },
        },
      },
      { upsert: true, new: true }
    ),
  ]);

  console.log('Seed completado. Cuentas creadas o ACTUALIZADAS:');
  console.log('  (ejecutar el seed restablece la contraseña de las cuatro cuentas)');
  console.log('  admin@uts.edu.co · coordinador@uts.edu.co · docente@uts.edu.co · estudiante@uts.edu.co');

  if (generada) {
    // Se imprime una sola vez y no se guarda en ningún sitio. Si se pierde, se
    // vuelve a sembrar con SEED_PASSWORD o se cambia desde la aplicación.
    console.log('\n  ┌─────────────────────────────────────────────────────────┐');
    console.log(`  │  Contraseña generada:  ${password.padEnd(32)} │`);
    console.log('  └─────────────────────────────────────────────────────────┘');
    console.log('  Anótala ahora: no vuelve a mostrarse ni queda escrita en disco.');
    console.log('  Para fijarla tú:  SEED_PASSWORD="…" npm run seed\n');
  } else {
    console.log('  Contraseña: la indicada en SEED_PASSWORD.\n');
  }

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

