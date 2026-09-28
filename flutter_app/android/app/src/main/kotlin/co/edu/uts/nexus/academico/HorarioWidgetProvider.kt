package co.edu.uts.nexus.academico

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetLaunchIntent
import es.antonborri.home_widget.HomeWidgetProvider
import java.util.Calendar
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

/**
 * Widget "Horario": las próximas clases del docente.
 *
 * Los datos llegan ya resueltos en hora del campus desde Flutter
 * (`lib/features/agenda/widget_horario.dart`): este proveedor no calcula
 * ninguna hora de clase. Lo único que decide en cada repintado es:
 *  - qué filas siguen siendo futuras, comparando `finMillis` contra el reloj
 *    del sistema (por eso `updatePeriodMillis` es de 30 minutos: sin
 *    repintados periódicos, una clase que ya terminó seguiría en pantalla
 *    hasta la próxima sincronización de la app), y
 *  - si la fecha de una fila es "Hoy" o "Mañana", comparando la fecha del
 *    campus guardada por Flutter contra la fecha de hoy en el campus — nunca
 *    contra la zona horaria del teléfono.
 */
class HorarioWidgetProvider : HomeWidgetProvider() {

    private data class FilaIds(
        val contenedor: Int,
        val dia: Int,
        val hora: Int,
        val titulo: Int,
        val detalle: Int,
    )

    companion object {
        private const val CLAVE_DATOS = "horario_datos"
        private const val OFFSET_CAMPUS_POR_DEFECTO = -300

        private val FILAS = listOf(
            FilaIds(R.id.fila1, R.id.fila1_dia, R.id.fila1_hora, R.id.fila1_titulo, R.id.fila1_detalle),
            FilaIds(R.id.fila2, R.id.fila2_dia, R.id.fila2_hora, R.id.fila2_titulo, R.id.fila2_detalle),
            FilaIds(R.id.fila3, R.id.fila3_dia, R.id.fila3_hora, R.id.fila3_titulo, R.id.fila3_detalle),
            FilaIds(R.id.fila4, R.id.fila4_dia, R.id.fila4_hora, R.id.fila4_titulo, R.id.fila4_detalle),
        )
        private val DIVISORES = listOf(R.id.divisor1, R.id.divisor2, R.id.divisor3)

        /** 'AAAA-MM-DD' en hora del campus, igual que `fechaCampus` en Dart. */
        private fun fechaCampus(instanteMillis: Long, offsetMinutos: Int): String {
            val calendario = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
            calendario.timeInMillis = instanteMillis + offsetMinutos * 60_000L
            val anio = calendario.get(Calendar.YEAR)
            val mes = calendario.get(Calendar.MONTH) + 1
            val dia = calendario.get(Calendar.DAY_OF_MONTH)
            return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", anio, mes, dia)
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_horario)

        // Tocar el widget en cualquier parte abre la agenda: es la pantalla
        // completa de la que esto es un resumen.
        views.setOnClickPendingIntent(
            R.id.widget_horario_root,
            HomeWidgetLaunchIntent.getActivity(
                context,
                MainActivity::class.java,
                Uri.parse("utsnexus://abrir/agenda"),
            ),
        )

        val crudo = widgetData.getString(CLAVE_DATOS, null)
        if (crudo == null) {
            mostrarMensaje(views, context.getString(R.string.horario_widget_sin_sesion))
        } else {
            pintarDatos(context, views, crudo)
        }

        appWidgetManager.updateAppWidget(appWidgetIds, views)
    }

    private fun pintarDatos(context: Context, views: RemoteViews, crudo: String) {
        val futuras: Triple<List<JSONObject>, Int, Long> = try {
            val json = JSONObject(crudo)
            val offset = json.optInt("offsetCampusMinutos", OFFSET_CAMPUS_POR_DEFECTO)
            val items = json.optJSONArray("items") ?: JSONArray()
            val ahoraMillis = System.currentTimeMillis()

            val resultado = mutableListOf<JSONObject>()
            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                if (item.optLong("finMillis") > ahoraMillis) resultado.add(item)
            }
            Triple(resultado, offset, ahoraMillis)
        } catch (error: Exception) {
            // Un dato guardado a medias (o de una versión anterior del
            // formato) no puede tumbar el widget: se trata igual que "no hay
            // ninguna clase próxima".
            Triple(emptyList(), OFFSET_CAMPUS_POR_DEFECTO, System.currentTimeMillis())
        }

        val (filasFuturas, offset, ahoraMillis) = futuras

        if (filasFuturas.isEmpty()) {
            mostrarMensaje(views, context.getString(R.string.horario_widget_sin_clases))
            return
        }

        views.setViewVisibility(R.id.widget_horario_mensaje, View.GONE)
        views.setViewVisibility(R.id.widget_horario_lista, View.VISIBLE)

        val fechaHoyCampus = fechaCampus(ahoraMillis, offset)
        val fechaMananaCampus = fechaCampus(ahoraMillis + 86_400_000L, offset)

        for ((indice, ids) in FILAS.withIndex()) {
            val hayFila = indice < filasFuturas.size
            views.setViewVisibility(ids.contenedor, if (hayFila) View.VISIBLE else View.GONE)
            if (indice < DIVISORES.size) {
                // El separador que sigue a esta fila solo tiene sentido si
                // hay otra fila visible debajo.
                val hayFilaSiguiente = indice + 1 < filasFuturas.size
                views.setViewVisibility(
                    DIVISORES[indice],
                    if (hayFilaSiguiente) View.VISIBLE else View.GONE,
                )
            }
            if (!hayFila) continue

            val item = filasFuturas[indice]
            val fecha = item.optString("fecha")
            val etiquetaDia = when (fecha) {
                fechaHoyCampus -> context.getString(R.string.horario_widget_hoy)
                fechaMananaCampus -> context.getString(R.string.horario_widget_manana)
                else -> item.optString("dia")
            }
            val detalle = item.optString("detalle")

            views.setTextViewText(ids.dia, etiquetaDia)
            views.setTextViewText(ids.hora, item.optString("hora"))
            views.setTextViewText(ids.titulo, item.optString("titulo"))
            views.setTextViewText(ids.detalle, detalle)
            views.setViewVisibility(ids.detalle, if (detalle.isEmpty()) View.GONE else View.VISIBLE)
        }
    }

    private fun mostrarMensaje(views: RemoteViews, mensaje: String) {
        views.setViewVisibility(R.id.widget_horario_lista, View.GONE)
        views.setViewVisibility(R.id.widget_horario_mensaje, View.VISIBLE)
        views.setTextViewText(R.id.widget_horario_mensaje, mensaje)
    }
}
