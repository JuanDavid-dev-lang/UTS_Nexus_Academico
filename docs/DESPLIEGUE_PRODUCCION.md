# Despliegue en Producción · UTS Nexus Académico

Documentación técnica del entorno de producción activo de UTS Nexus Académico.

---

## 1. Topología y Accesos Públicos

El sistema se encuentra desplegado en el **Nodo 1 del Clúster Central**, expuesto hacia internet mediante **Cloudflare Zero Trust Named Tunnels**. El API de Nexus vive bajo el dominio institucional `ciaiuts.com`; el resto de servicios del clúster siguen bajo `victabares.com`.

| Componente | Dominio Público | Destino Local | Protocolo | Estado |
|---|---|---|---|---|
| **API Backend Nexus** | `https://nexusback.ciaiuts.com` | `127.0.0.1:4000` | HTTP ➔ HTTPS Cloudflare | **Activo** |
| **Documentación Swagger** | `https://nexusback.ciaiuts.com/docs` | `127.0.0.1:4000/docs` | HTTP ➔ HTTPS Cloudflare | **Activo** |
| **Sonda de Salud** | `https://nexusback.ciaiuts.com/health` | `127.0.0.1:4000/health` | HTTP ➔ HTTPS Cloudflare | **Activo** |
| **Panel de Servidores** | `https://servidores.victabares.com` | `127.0.0.1:9090` | HTTPS (No TLS Verify) | **Activo** |
| **Pasarela IA (Ollama)** | `https://ia.victabares.com` | `127.0.0.1:11435` | HTTP ➔ HTTPS Cloudflare | **Activo** |

---

## 2. Configuración del Servidor Backend

* **Ubicación en el servidor:** `/srv/proyectos/nexus-backend/`
* **Gestor de procesos:** Systemd (`nexus-backend.service`)
  * Inicio automático con el sistema operativo (`enabled`).
  * Política de reinicio: `Restart=always` con intervalo de `5s`.
* **Usuario de ejecución:** `nexus` (cuenta de sistema dedicada sin acceso a proyectos de radio ni directorios privados de otros usuarios).
* **Base de datos:** MongoDB Atlas (clúster de producción, base de datos `nexus_academico`).
* **IA Local:** Conectado directamente al daemon de Ollama en `http://127.0.0.1:11434` utilizando `llama3.2:latest`.

### 2.1 Variables de entorno

El servicio lee `/srv/proyectos/nexus-backend/.env` (`EnvironmentFile=`).
**`deploy/actualizar.sh` lo excluye del rsync**: se edita a mano en el servidor
y nunca se versiona con valores reales. La plantilla es
`deploy/.env.produccion.example`; `instalar.sh` la copia si el archivo no existe.

Lo que cambia respecto a un `.env` local, y por qué:

| Variable | Valor | Motivo |
|---|---|---|
| `NODE_ENV` | `production` | Activa CORS acotado, formato de log y exige SMTP. |
| `HOST` | `127.0.0.1` | Solo el túnel de Cloudflare llega al backend; nada escucha hacia la red del clúster. |
| `TRUST_PROXY` | `1` | Hay proxy delante (`cloudflared`). Sin él, el límite de login vería la IP del túnel y contaría a toda la institución como un visitante. |
| `CLIENT_ORIGIN` | `https://nexusback.ciaiuts.com` | `*` está prohibido en producción. Los orígenes de la app de escritorio los añade el backend solo. |
| `SMTP_*` | los del correo institucional | Obligatorio: sin `SMTP_HOST` el servidor no arranca en producción (recuperación de contraseña). |
| `AI_BASE_URL` / `AI_MODEL` | `http://127.0.0.1:11434` / `llama3.2:latest` | El daemon de Ollama del Nodo 1. |
| `ALLOW_DEV_RECOVERY_CODE` | `0` | Nunca en un servidor al que llegue alguien más. |
| `SEED_PASSWORD` | ausente | Las cuentas de demo son cuentas conocidas. |

Tras editarlo: `sudo systemctl restart nexus-backend` y `node check-env.mjs`
desde `/srv/proyectos/nexus-backend` para verificar sin imprimir secretos.

---

## 3. Comandos de Operación y Monitoreo

Para tareas de mantenimiento desde SSH (`ssh nexus@10.11.9.36`):

```bash
# Ver estado del backend
sudo systemctl status nexus-backend

# Reiniciar el backend tras una actualización
sudo systemctl restart nexus-backend

# Ver logs en tiempo real
sudo journalctl -u nexus-backend -f

# Probar sonda de salud en local
curl -s http://127.0.0.1:4000/health
```

---

## 4. Configuración de Clientes (Escritorio y Móvil)

Los clientes de escritorio (`desktop/`) y móvil (`flutter_app/`) vienen preconfigurados por defecto apuntando a:

```text
https://nexusback.ciaiuts.com
```

Las versiones previas guardadas en clientes existentes que apuntaban a `localhost`, a la IP anterior de AWS o al anterior `nexus.victabares.com` se migran solas al arrancar (`DEFAULTS_SUPERADOS` en `desktop/src/core/config/env.ts`). Quien haya escrito la dirección a mano en Configuración → Servidor conserva la suya: solo se migra lo que era un valor por defecto.
