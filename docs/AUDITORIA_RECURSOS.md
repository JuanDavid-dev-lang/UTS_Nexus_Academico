# Auditoría de consumo de recursos en los equipos

Compañera de `AUDITORIA_RENDIMIENTO.md`, que mira la carga sobre MongoDB Atlas.
Esta mira el otro lado: **lo que las aplicaciones gastan en el equipo donde se
instalan** — memoria, almacenamiento, procesador y batería.

Los dos costes se comportan al revés. La carga sobre la base se paga en factura
y crece con el número de docentes; esto se paga en el teléfono de una persona y
lo nota ella sola, en un dispositivo que no eligió y que a veces es de gama
baja con el wifi del campus a medias. Nadie abre una incidencia por «la app
gasta batería»: se desinstala.

## Resumen

| | Antes | Después |
|---|---|---|
| Recursos empaquetados en el móvil | 2,96 MB | 0,54 MB |
| Recursos empaquetados en el escritorio | 1,36 MB | 0,13 MB |
| `desktop/dist` completo | 3,6 MB | 2,4 MB |
| Mapa de bits residente por logo | 4,0 MiB | ~0,3 MiB |
| Intentos de conexión en segundo plano | cada 5 s, indefinidamente | ninguno |

Ninguno de los cinco arreglos tocó arquitectura. Cuatro son de empaquetado y
uno es de ciclo de vida.

---

## R1 · El socket seguía vivo en segundo plano, reintentando cada cinco segundos

`realtime_service.dart` construía el `OptionBuilder()` sin declarar nada sobre
la reconexión, así que quedaban los valores por defecto de
`socket_io_client`: **intentos infinitos** con la espera topada en 5 s. Y en
todo `flutter_app/lib` no había un solo `WidgetsBindingObserver` ni
`AppLifecycleState`.

Las dos cosas por separado son defendibles. Juntas significan que un teléfono
en el bolsillo, con la aplicación en segundo plano y el wifi del campus caído
—que no es un caso raro, es un martes—, intentaba abrir un socket **doce veces
por minuto para siempre**. Cada intento despierta la radio.

Y es coste sin ninguna contrapartida, porque el reparto ya estaba decidido en el
diseño: los recordatorios de clase son alarmas locales y las alertas del
servidor son push de FCM. **El socket solo sirve para refrescar lo que alguien
está mirando**, y en segundo plano no hay nadie mirando.

Ahora `AppLifecycleListener`, en la raíz de la aplicación, llama a
`RealtimeService.pausar()` al pasar a segundo plano y a `reanudar()` al volver.
Dos detalles que las pruebas fijan:

- **`reanudar()` solo reconecta lo que él mismo cerró.** Sin sesión iniciada no
  hay token, y conectar de todas formas abriría un handshake que el backend
  rechaza — en bucle, que es peor que el problema original.
- **Pausar guarda el token.** Cerrar sesión es `dispose()` y esto no lo es;
  volver a primer plano no puede depender de que la capa de sesión reaccione.

Además `reconnectionDelayMax` sube a 30 s. El escritorio ya lo tenía en 10 s y
además corre enchufado.

## R2 · Flutter no subconjunta fuentes de texto, y nadie lo hacía por él

`--tree-shake-icons` solo actúa sobre fuentes de iconos. Las de texto viajan
enteras.

Las Inter oficiales traen **2 852 glifos por peso**: 525 de latín básico y
extendido, 249 cirílicos, 105 griegos, 170 del alfabeto fonético y 784 de
símbolos. Esta aplicación **es solo en español** y escribe del orden de 120
caracteres distintos.

Cuatro pesos × ~410 KB = **1,63 MB del APK** para eso. El escritorio ya lo hacía
bien sin que nadie lo hubiera decidido: `@fontsource/inter` sirve subconjuntos
latinos de 32 KB, doce veces menos por el mismo tipo de letra.

`flutter_app/tool/subconjuntar_fuentes.py` recorta a latín, puntuación, moneda,
flechas, operadores matemáticos y figuras geométricas — más de lo que se usa
hoy a propósito, porque un nombre propio con una diéresis rara o un «≥ 3,0» en
una pantalla nueva no deben salir como un rectángulo vacío, y el margen cuesta
unos pocos KB. **1,63 MB → 424 KB.**

Tres cosas que hay que conservar:

- **Se conserva `tnum`.** `FontFeature.tabularFigures()` se usa en las horas de
  la agenda y en las columnas de notas; sin esa característica los dígitos
  cambian de ancho y una columna de promedios deja de estar alineada. Junto a
  ella van las que Flutter aplica por defecto (`ccmp, liga, calt, kern, mark,
  mkmk, rlig, locl`) y el kerning de `GPOS`.
- **No se conservan las demás.** `--layout-features='*'` arrastra los sets
  estilísticos y las variantes de carácter de Inter: 370 glifos más por peso
  que la aplicación no pide nunca. Con ellas el recorte daba 145 KB por peso en
  vez de 104 KB.
- **El script es idempotente**, así que se pasa sin comprobar nada antes;
  `--check` avisa si alguien dejó caer una fuente completa al actualizarlas.

## R3 · El logo era de 1024×1024 para dibujarse a 96 dp

628 KB en el paquete de los dos clientes. Descodificado son 1024 × 1024 × 4 =
**4,0 MiB de mapa de bits**, para pintar el logotipo a 96 dp de alto en el login
del móvil y a 36 px en la barra lateral del escritorio. En el escritorio, además,
está en la pantalla de arranque: se descodificaba en el primer fotograma, antes
que nada.

Los cuatro sprites de Rubri no estaban sobredimensionados en píxeles
(400×356) sino **en formato**: ~190 KB cada uno para una ilustración con
degradados es el formato equivocado, y se nota en que el PNG *optimizado* sale
más grande que el original.

Los cinco archivos pasan a **WebP con calidad 92**, dimensionados a 2,5-3× del
mayor tamaño al que se dibujan (320 px el logo, 384 los sprites). Medido
componiendo sobre blanco y sobre negro, el error de color es de ~2 sobre 255 y
**el canal alfa se conserva exacto**. De 1,39 MB a 109 KB en cada cliente.

Y en el móvil se pasa `cacheWidth`/`cacheHeight` con
`MediaQuery.devicePixelRatioOf(context)`: sin eso, la caché de imágenes de
Flutter guarda el mapa de bits del **archivo**, no el del tamaño al que se
dibuja, así que el sprite de 384 px pintado a 40 dp seguía ocupando 512 KB.

## R3b · Tres de los cuatro sprites tenían el fondo pegado

Salió al convertirlos a WebP y no es de rendimiento, pero se arregló con las
mismas herramientas y en el mismo sitio, así que queda aquí.

`happy`, `sad` y `offline` eran PNG **opacos**: fondo pastel claro y sombra
bajo los pies. Solo `neutral` venía recortado. Sobre blanco no se nota; sobre
el `#1A1A16` del tema oscuro, tres de los cuatro estados de Rubri eran un
rectángulo pálido y el cuarto no — y el estado lo elige el backend, así que la
incoherencia aparecía sola al cambiar de emoción.

`tools/recortar_sprites.py` lo resuelve en tres pasos, y cada uno hace falta:

- **Inundación comparando con el vecino, no con un color fijo.** El fondo es un
  degradado: un umbral global se queda corto en una esquina o se come al
  personaje en la otra. Píxel a píxel el degradado avanza de uno en uno y el
  salto al contorno negro es de más de cien. Se siembra solo desde las cuatro
  esquinas porque en `happy` y en `sad` el dibujo toca el borde inferior.
- **Un modelo del degradado para retirar la sombra.** La sombra no tiene
  contorno: la inundación entra en ella pero deja un anillo donde la pendiente
  se acentúa. Un ajuste polinómico robusto —descartando lo que se aparta más de
  2,5 sigma, porque la inundación ya se tragó parte de la sombra y esos píxeles
  tirarían del ajuste— predice el fondo con un residuo medio de 1 sobre 255, y
  con eso el anillo se retira comparando contra el fondo predicho.
- **Despejar el alfa y el color en el borde.** El contorno está suavizado contra
  el fondo. Sin resolver `observado = alfa*trazo + (1-alfa)*fondo`, el recorte
  deja una aureola clara — que es precisamente lo que más se ve sobre oscuro,
  o sea lo contrario de lo que se venía a arreglar.

Dos números que fijan los umbrales, por si hay que retocarlos:

| | Medida |
|---|---|
| Tolerancia a la que la inundación se lleva al personaje entero | 32 (el fondo salta del 54 % al 95 %) |
| Tolerancia a la que atraviesa los arcos translúcidos del wifi | 24 |
| Residuo de la sombra frente al fondo predicho | mediana 16, p90 34 |
| Residuo de los arcos del wifi | p10 48 |

De ahí salen los dos valores: inundación a **10** y crecimiento contra el
modelo a **40**, que separa sombra de arcos con margen por los dos lados.

**Lo que no se toca son los rellenos claros que son dibujo.** El velo del
sombrero es una malla blanca, el icono de wifi es gris translúcido y el brillo
de los ojos es blanco. Los tres se ven bien sobre cualquier fondo, y el
recorte los conserva opacos: lo que estaba mal era el rectángulo, no que el
dibujo tenga partes claras. Un intento anterior de vaciar además las bolsas de
fondo encerradas —las celdas de la malla— no tenía un umbral que las separara
del blanco de los ojos, y se descartó: media malla transparente y media opaca
se ve peor que la malla entera.

## R4 · El chat se rompía en la pregunta 11

Salió buscando ancho de banda y resultó ser un defecto de funcionamiento.

`ai.routes.ts` acota el historial a `.max(20)` mensajes. Los dos clientes lo
mandaban **entero, sin recortar**. Tras diez intercambios hay 20 mensajes y aún
pasa; en la undécima pregunta van 22 y el servidor responde 400 con un error de
validación que no menciona el historial.

`historialParaEnviar()` —puro y con pruebas en los dos clientes— se queda con
los últimos 20. Con el final y no con el principio, porque lo que da contexto a
la pregunta que se está haciendo es lo último que se dijo. El servicio solo usa
los últimos seis turnos de todas formas.

Es el fallo que vuelve solo: quitar el recorte no rompe nada visible hasta la
undécima pregunta, y ninguna prueba manual llega a hacerla.

## R5 · Archivos que se quedaban ocupando el teléfono

- **El APK de la actualización.** Se borraba el de la misma versión justo antes
  de descargarlo, así que uno de unos cincuenta megas se quedaba en el
  directorio temporal hasta la actualización siguiente, que pueden ser meses.
  Ahora se purgan todos los `uts-nexus-*.apk` antes de descargar y también
  cuando la comprobación dice que ya estamos al día. **No se borra tras abrir el
  instalador**: `OpenFilex.open` vuelve cuando lanza el intent, no cuando la
  instalación termina, y borrarlo ahí la cancelaría.
- **Los reportes y los formatos de trabajo de grado** se escribían en
  `getApplicationDocumentsDirectory()`, que ni el sistema ni «Borrar caché»
  liberan nunca. Van al directorio temporal: `share_plus` copia el archivo a su
  propia carpeta de caché antes de compartirlo, así que esta copia solo tiene
  que sobrevivir a la llamada.

## R6 · Dos listas construían todas sus filas

El consolidado de notas y los avisos usaban `ListView(children: [...])` con un
`for` sobre los datos, que construye una fila por elemento aunque en pantalla
quepan ocho. Un grupo grande son cien estudiantes. Pasan a `ListView.builder`
con el encabezado y la leyenda como primer y último elemento.

Los otros veinte usos de `ListView(children:)` que salieron en el rastreo son
estados vacíos o filas horizontales de chips, y están bien como están.

---

## Lo que ya estaba bien

Conviene dejarlo escrito para que nadie lo «arregle»:

- **El escritorio separa el código por ruta.** Veinte páginas en `lazy()`, un
  chunk por repositorio y `manualChunks` para las librerías estables. El
  arranque son ~770 KB de JS, no los 2,4 MB de `dist`.
- **ECharts (559 KB, la dependencia más pesada con diferencia) va diferida**
  tras un `lazy()` con un esqueleto del alto exacto, así que no entra en las
  pantallas sin gráficos — que son casi todas. Cada instancia se limpia con
  `chart.dispose()` y observa su tamaño con `ResizeObserver`, no con un oyente
  de `window`.
- **El perfil de release de Rust** ya trae `lto`, `opt-level = "s"`,
  `codegen-units = 1`, `strip` y `panic = "abort"`.
- **Los reintentos están acotados en los dos clientes**: solo errores
  transitorios, dos intentos y retroceso exponencial con techo. Las mutaciones
  no se reintentan.
- **No hay sondeo periódico salvo tres casos acotados a su pantalla**: salud
  cada 60 s, agenda cada 5 min, y el cierre de periodo cada 3 s **solo mientras
  hay uno en `CLOSING`**.
- **Los ocho temporizadores del móvil se cancelan en su `dispose`.** Sin fugas.
- **Las fotos se acotan antes de subirlas** (`maxWidth: 2000` en el escáner de
  planillas, 512 en el avatar), así que no hay ningún caso en que se descodifique
  una imagen de 12 MP en memoria.

## Qué vigilar de aquí en adelante

1. **Una fuente nueva o actualizada pasa por `subconjuntar_fuentes.py`.** Bajar
   las Inter oficiales y copiarlas encima devuelve el megabyte sin que nada
   falle.
2. **Una imagen nueva va en WebP y dimensionada a lo que se dibuja.** Un PNG de
   cámara o de exportación de diseño ronda el megabyte.
3. **`Image.asset` sin `cacheWidth` es un descuido**, no una variante.
4. **Un sprite nuevo se mira sobre el fondo oscuro del tema antes de
   commitearlo**, no solo sobre blanco. Es la comprobación que faltó la primera
   vez y por eso tres de los cuatro estados de Rubri llegaron con el fondo
   pegado.
5. **Una hoja o una pantalla nueva no abre su propia conexión de tiempo real.**
   Hay una y la gestiona el ciclo de vida de la aplicación.
6. **Una lista de datos va con `.builder`.** Con `children` no falla nada
   visible: solo se construye diez veces más de lo que se ve.
