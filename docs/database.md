# Base de Datos

## Colecciones

- `usuarios`
- `profesores`
- `estudiantes`
- `materias`
- `grupos`
- `notas`
- `asistencias`
- `actividades`
- `horarios`
- `notificaciones`
- `predicciones`
- `configuraciones`

## Campos base

- `_id`
- `createdAt`
- `updatedAt`
- `deletedAt`
- `createdBy`
- `updatedBy`
- `tenantId`
- `status`

## Índices

- `usuarios.email` unique
- `estudiantes.codigo` unique
- `materias.profesorId + periodo`
- `grupos.materiaId + periodo`
- `notas.estudianteId + materiaId`
- `asistencias.estudianteId + fecha`
- `predicciones.estudianteId + materiaId`

## Relaciones

- `ObjectId` entre entidades
- agregaciones para analítica
- auditoría por evento

