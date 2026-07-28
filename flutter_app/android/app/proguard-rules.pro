# Reglas de ofuscación para el build de release.
#
# R8 elimina código no alcanzable, pero no ve las clases que Flutter y sus
# plugins resuelven por reflexión en tiempo de ejecución. Sin estas reglas, la
# app compila y luego falla al arrancar, que es el peor momento para descubrirlo.

-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# El motor de Flutter registra los plugins por nombre de clase.
-keep class * extends io.flutter.embedding.engine.plugins.FlutterPlugin { *; }

# share_plus y path_provider usan el proveedor de archivos de AndroidX.
-keep class androidx.core.content.FileProvider { *; }
-keep class androidx.lifecycle.DefaultLifecycleObserver

# Silencia avisos por clases opcionales que no se empaquetan.
-dontwarn io.flutter.embedding.**
