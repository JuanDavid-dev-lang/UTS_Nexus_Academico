package co.edu.uts.nexus.academico

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Al actualizar, el instalador del sistema abre en su propia tarea y
        // el sistema detiene esta app; su tarjeta se quedaba en recientes como
        // una tarea muerta, y «Abrir» en el instalador creaba otra: dos «UTS
        // Nexus» lado a lado, una con la versión vieja. Quitar la tarea propia
        // al entregar el APK deja una sola.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "uts.nexus/tarea")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "cerrarTarea" -> {
                        finishAndRemoveTask()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
