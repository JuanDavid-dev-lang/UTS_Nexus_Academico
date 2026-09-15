# Despliegue en Producción · UTS Nexus Académico

Documentación técnica del entorno de producción activo de UTS Nexus Académico.

---

## 1. Topología y Accesos Públicos

El sistema se encuentra desplegado en el **Nodo 1 del Clúster Central**, expuesto hacia internet mediante **Cloudflare Zero Trust Named Tunnels** bajo el dominio `victabares.com`.

| Componente | Dominio Público | Destino Local | Protocolo | Estado |
|---|---|---|---|---|
| **API Backend Nexus** | `https://nexus.victabares.com` | `127.0.0.1:4000` | HTTP ➔ HTTPS Cloudflare | **Activo** |
| **Documentación Swagger** | `https://nexus.victabares.com/docs` | `127.0.0.1:4000/docs` | HTTP ➔ HTTPS Cloudflare | **Activo** |
| **Sonda de Salud** | `https://nexus.victabares.com/health` | `127.0.0.1:4000/health` | HTTP ➔ HTTPS Cloudflare | **Activo** |
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
https://nexus.victabares.com
```

Las versiones previas guardadas en clientes existentes que apuntaban a `localhost` o a la IP anterior de AWS son migradas automáticamente en el arranque sin intervención del usuario.
