# Desplegar el servidor en AWS

El backend deja de vivir en la red del campus y pasa a una instancia EC2 con
HTTPS. La base de datos **no se mueve**: sigue en MongoDB Atlas, que ya hace
réplicas y copias de seguridad mejor de lo que las haría una instancia sola.

```
   Escritorio ─┐
               ├──HTTPS──▶  EC2 ──▶ Caddy ──▶ backend ──▶ MongoDB Atlas
   Móvil ──────┘            :443            └▶ servicio de visión/riesgo
```

Solo el 443 está abierto. El backend (4000) y el servicio de Python (8100) viven
en la red interna de Docker y no existen desde fuera.

---

## 1. Crear la instancia

En la consola de AWS → **EC2 → Lanzar instancia**:

| Opción | Valor | Por qué |
|---|---|---|
| Imagen | Amazon Linux 2023 | Es la que corre hoy en producción |
| Tipo | `t3.small` | Ver la nota de memoria más abajo |
| Almacenamiento | 20 GB gp3 | Las imágenes de Docker con OpenCV ocupan |
| Par de claves | crear uno nuevo | Es la única forma de entrar por SSH |

**Grupo de seguridad** — solo tres reglas de entrada:

| Puerto | Origen |
|---|---|
| 22 (SSH) | **solo tu IP**, nunca `0.0.0.0/0` |
| 80 (HTTP) | `0.0.0.0/0` — Let's Encrypt lo necesita para emitir el certificado |
| 443 (HTTPS) | `0.0.0.0/0` |

> **Sobre el tamaño.** `t2.micro` es la que entra en la capa gratuita, pero tiene
> 1 GB de RAM y el servicio de visión carga OpenCV y el modelo de OCR. Con esa
> memoria, construir las imágenes falla o el contenedor muere al arrancar. Con
> `t3.small` (2 GB) funciona, y cuesta del orden de 15 USD al mes. Si el
> presupuesto es cero, se puede desplegar solo el backend con `ML_ENABLED=0`:
> se pierde el escaneo de planillas y el riesgo cae al motor de reglas, pero
> todo lo demás funciona en `t2.micro`.

## 2. Permitir la instancia en Atlas

MongoDB Atlas rechaza conexiones de IPs desconocidas. En **Network Access**,
añadir la **IP elástica** de la instancia.

Antes conviene asignarle una **IP elástica** (EC2 → Elastic IPs → asignar y
asociar). Sin ella, la IP cambia cada vez que se apaga la instancia, y con la IP
cambian el dominio, el certificado y la configuración de los clientes.

## 3. Instalar

```bash
ssh -i tu-clave.pem ec2-user@LA_IP
git clone https://github.com/JuanDavid-dev-lang/UTS_Nexus_Academico.git
cd UTS_Nexus_Academico/deploy
./instalar.sh
```

> **El usuario depende de la imagen.** Amazon Linux entra como `ec2-user`;
> Ubuntu, como `ubuntu`. Equivocarse no da un error que lo diga: responde
> `Permission denied (publickey)`, igual que si la clave estuviera mal, y se
> pierde el rato buscando en el sitio equivocado. La instancia que está en
> producción es Amazon Linux 2023.

El script instala Docker, averigua la IP pública, deriva un dominio
`52-1-2-3.sslip.io`, **genera los secretos JWT por su cuenta** —no los imprime
ni hay que copiarlos a ningún sitio—, pide la cadena de Atlas, levanta los tres
contenedores y espera a que HTTPS responda.

Al terminar muestra la dirección. Compruébala:

```bash
curl https://52-1-2-3.sslip.io/health
```

## 4. Sembrar y cambiar las contraseñas

```bash
docker compose exec backend node dist/scripts/seed.js
```

**Cambiá inmediatamente las contraseñas de demo.** Están escritas en el README
de un repositorio público (`docente@uts.edu.co / (la que genere el seed)`). En la red del
campus era discutible; en internet significa que cualquiera entra.

## 5. Apuntar los clientes

**Escritorio** → Configuración → Servidor → `https://52-1-2-3.sslip.io`

**Móvil** → Ajustes → Servidor → la misma dirección. El barrido automático de la
red local ya no sirve para nada fuera del campus; hay que escribirla una vez.

---

## Lo que cambió en el código para poder hacer esto

No fue solo mover el proceso. Cuatro cosas impedían salir a internet:

**El escritorio no podía conectarse a un servidor remoto.** El CSP de Tauri solo
permitía `127.0.0.1` y `localhost`. Ahora admite `https:` y `wss:` para cualquier
host, pero **sigue prohibiendo `http://` remoto**: el propio CSP impide
configurar por descuido un servidor sin cifrar por el que viajarían las
contraseñas.

**El backend arrancaba con secretos de juguete.** `JWT_ACCESS_SECRET` caía a
`'dev-access'`, que está escrito en el repositorio público: con él cualquiera se
fabrica un token de administrador. Ahora `validarProduccion()` detiene el
arranque si el secreto falta, es el de desarrollo, mide menos de 32 caracteres o
coincide con el de refresco. Falla ruidosamente en vez de avisar y seguir,
porque un servidor que arranca «con advertencias» se queda meses así.

**CORS estaba abierto a cualquier origen.** `CLIENT_ORIGIN=*` deja de estar
permitido en producción.

**El móvil hablaba en claro.** `usesCleartextTraffic="true"` permitía HTTP contra
cualquier servidor. Se sustituyó por una política de red que exige TLS y solo
admite texto plano contra `localhost` y `10.0.2.2`, para que el emulador siga
funcionando en desarrollo.

Además, el login tiene ahora su propio límite de 10 intentos cada 15 minutos. El
cupo general de 250 peticiones dejaba sitio de sobra para probar contraseñas, y
en internet eso se intenta constantemente.

---

## Operación

```bash
cd ~/UTS_Nexus_Academico/deploy

docker compose logs -f backend        # registros en vivo
docker compose ps                     # estado y salud de los contenedores
docker compose restart backend        # reiniciar uno
git pull && docker compose up -d --build   # desplegar una versión nueva
```

El certificado se renueva solo. El volumen `caddy_data` guarda los certificados
emitidos: **no lo borres** sin motivo, porque Let's Encrypt limita cuántas veces
se puede pedir uno nuevo para el mismo nombre en una semana.

## Si algún día hay dominio propio

Crear un registro `A` apuntando a la IP elástica, cambiar `DOMINIO` en
`deploy/.env`, añadirlo a `CLIENT_ORIGIN` y `docker compose up -d`. Caddy pide el
certificado nuevo solo. No hay que tocar el código ni recompilar los clientes.

## Datos personales

Esto va a guardar cédulas, nombres y notas de estudiantes en una instancia a
nombre de una persona. En Colombia eso son datos personales cubiertos por la Ley
1581 de 2012. Antes de cargar datos reales —no de demostración— conviene
confirmarlo con la coordinación o con la oficina jurídica de las UTS: quién es
el responsable del tratamiento y bajo qué autorización. Con datos de prueba no
aplica.
