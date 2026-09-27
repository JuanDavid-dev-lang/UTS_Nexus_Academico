# 24, no 22: el lockfile lo mantiene npm 11 y el npm 10 de node:22 resuelve
# distinto los peer opcionales (`yaml` de vite) — `npm ci` fallaba con
# "Missing: yaml@2.9.0 from lock file" sobre un árbol que instala limpio.
# Mismo motivo por el que verificar.yml y release.yml usan Node 24.
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# Recursos empaquetados (logo institucional de los reportes).
COPY assets ./assets

# Los reportes y las imágenes subidas van a un volumen montado aquí. Sin crear
# el directorio con el dueño correcto, el proceso sin privilegios no puede
# escribir en él y la subida de una planilla falla en producción y no en local.
# `formatos` es el almacén de los formatos de trabajo de grado: va aparte de
# `uploads` porque uploads se sirve estático sin autenticación.
# Solo esas dos son del usuario del proceso: el código y `node_modules` se quedan
# de root, así que nadie dentro del contenedor puede reescribirlos. Un
# `chown -R /app` además duplicaba `node_modules` en una capa nueva.
RUN mkdir -p uploads formatos && chown node:node uploads formatos

# No se ejecuta como root: si alguien lograra ejecutar código dentro del
# contenedor, se encontraría con un usuario sin permisos sobre el sistema.
USER node

EXPOSE 4000

# La sonda mira /health, que informa también del estado de la base. /health
# responde 200 aunque MongoDB no conecte, así que la sonda lee `db`: un
# contenedor vivo pero sin base de datos se marca enfermo en vez de parecer sano.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>r.json()).then(j=>process.exit(j.db==='connected'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]

