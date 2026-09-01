## UTS Nexus Académico — Pre-release 2.16.0

La puerta de entrada para los nuevos docentes se renueva por completo. La pantalla de **Registro de docentes** estrena diseño en el computador y en el teléfono: adscripción académica guiada por facultad y nivel, buscador de carreras en tiempo real, selector de contraseñas con visibilidad y requisitos en vivo, y un panel institucional que acompaña cada paso de la solicitud.

Si ya tienes cuenta y vienes de la 2.15.0, la actualización es automática y segura: no toca notas, ni asistencia, ni ningún dato guardado.

---

### ✨ Nueva experiencia de registro en el computador

El autorregistro de docentes en escritorio adoptó la misma línea de diseño de la pantalla de acceso:

- **Panel lateral institucional:** En pantallas de computador, un lateral de marca con degradados y la identidad UTS recibe al docente, recordándole las garantías institucionales: validación oficial de adscripción, revisión administrativa de la cuenta y protección de credenciales.
- **Estructura en tres momentos lógicos:** El formulario abandona la columna plana y se organiza en tres tarjetas con iconografía y jerarquía clara: *Datos personales*, *Dónde enseñas* y *Tu cuenta*.
- **Niveles interactivos:** En lugar de casillas de verificación planas, los niveles (`Tecnológico` y `Profesional`) son botones seleccionables tipo credencial con respuesta visual inmediata.
- **Buscador y acciones por lote en programas:** Cuando una facultad ofrece múltiples carreras, un buscador en vivo permite encontrar la titulación en segundos, acompañado de botones para marcar o desmarcar todo el bloque con un clic.
- **Contraseña asistida y en vivo:** Cuatro insignias dinámicas evalúan los requisitos de seguridad institucionales (10+ caracteres, mayúscula, minúscula y número) mientras se escribe, junto a un botón para alternar entre ver u ocultar la clave.
- **Radicación clara:** Al enviar, la pantalla de éxito explica exactamente qué ocurre a continuación: la solicitud queda radicada y la cuenta se habilitará tras la revisión de coordinación o administración.

### 📱 Registro móvil rediseñado en el teléfono

La app de Android traslada esta misma claridad a la pantalla del móvil, cuidando la ergonomía de uso con una sola mano:

- **Cabecera de marca:** Apertura con la superficie de marca UTS (`BrandSurface`), contextualizando la convocatoria docente.
- **Tarjetas elevadas (`AppCard`):** Cada sección se agrupa en una superficie elevada con encabezados numerados e iconos contextuales en cada campo (cédula, nombres, sede, facultad, credenciales).
- **Selector táctil de niveles y carreras:** Botones táctiles optimizados para alternar el nivel académico y lista delimitada con contador en tiempo real (`X de Y marcados`).
- **Verificación de clave antes de enviar:** Botón de visibilidad para confirmar lo escrito y badges de requisitos que pasan a verde en tiempo real, evitando errores de validación tras el envío.
- **Confirmación con estado institucional:** Tarjeta de confirmación con distintivo de estado y botón directo para regresar al inicio de sesión.

---

### 🛠️ Debajo del capó

- **Depuración automática de adscripción:** Cambiar de facultad o desmarcar un nivel descarta automáticamente los programas que dejan de ser válidos en segundo plano, impidiendo enviar combinaciones que el servidor rechazaría.
- **Cobertura de pruebas automatizadas:**
  - Escritorio: nueva suite unitaria en `register-page.test.tsx` (131 pruebas totales en verde).
  - Móvil: nueva suite de widgets en `register_page_test.dart` (91 pruebas totales en verde).
- **Rendimiento y arquitectura:** El constructor de la pantalla de registro en Flutter mantiene compatibilidad `const` con el enrutador de la aplicación, evitando reconstrucciones innecesarias en el árbol de widgets.
- **Actualización transparente:** El `versionCode` de Android sube a 37 para asegurar que el APK se instale encima del instalado en un toque.
