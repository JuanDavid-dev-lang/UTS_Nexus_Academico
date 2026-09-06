# Regla de las hojas modales (móvil)

Una hoja inferior nueva pasa por `showCompactSheet`
(`flutter_app/lib/core/widgets/compact.dart`), que ya resuelve los tres
defectos. Si de verdad necesitas `showModalBottomSheet` a pelo, revísalos:

1. **`useSafeArea: true` en la ruta.** Sin la bandera, la hoja se envuelve en
   `MediaQuery.removePadding`, que depende del `MediaQueryData` entero: cada
   fotograma de la animación del teclado rehace el subárbol completo.
2. **Nunca leas `MediaQuery.viewInsetsOf` en el `build` de un formulario.** Usa
   `KeyboardInset` (`core/widgets/keyboard_inset.dart`), que lo lee en su propio
   `build` y recibe el contenido ya construido. Para un pie fijo, envuelve el
   pie, no la pantalla.
3. **Una hoja alta tiene que poder encoger.** La parte que crece va en
   `Flexible`, no solo con un `maxHeight`: `useSafeArea` le cuesta a la hoja el
   alto de la barra de estado.

`test/keyboard_inset_test.dart` fija el punto 2 contando reconstrucciones.

Ver `CLAUDE.md` § «Regla de las hojas modales».
