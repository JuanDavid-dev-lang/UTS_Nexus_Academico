FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Los reportes y las imágenes subidas van a un volumen montado aquí. Sin crear
# el directorio con el dueño correcto, el proceso sin privilegios no puede
# escribir en él y la subida de una planilla falla en producción y no en local.
RUN mkdir -p uploads && chown -R node:node /app

# No se ejecuta como root: si alguien lograra ejecutar código dentro del
# contenedor, se encontraría con un usuario sin permisos sobre el sistema.
USER node

EXPOSE 4000

# La sonda mira /health, que informa también del estado de Atlas. Un contenedor
# vivo pero sin base de datos se marca enfermo en vez de parecer sano.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]

