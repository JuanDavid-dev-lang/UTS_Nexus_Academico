package co.edu.uts.nexus.academico

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetLaunchIntent
import es.antonborri.home_widget.HomeWidgetProvider

/**
 * Widget "Acceso rápido": cuatro botones que abren Notas, Asistencia, Agenda y
 * Materias directamente, sin pasar por el panel.
 *
 * No depende de ningún dato que Flutter tenga que sincronizar —el destino de
 * cada botón es fijo—, así que no necesita refrescarse solo
 * (`updatePeriodMillis="0"` en `acceso_rapido_widget_info.xml`) ni leer nada
 * de [widgetData].
 *
 * Si no hay sesión iniciada, la app muestra el login de siempre: no hace falta
 * ninguna comprobación aquí, porque la ruta pedida solo se aplica una vez
 * dentro (ver `HomeWidgetService`/`home_widget_links.dart` en Flutter).
 */
class AccesoRapidoWidgetProvider : HomeWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_acceso_rapido)

        fun enlazar(botonId: Int, ruta: String) {
            views.setOnClickPendingIntent(
                botonId,
                HomeWidgetLaunchIntent.getActivity(
                    context,
                    MainActivity::class.java,
                    Uri.parse("utsnexus://abrir/$ruta"),
                ),
            )
        }

        enlazar(R.id.boton_notas, "grades")
        enlazar(R.id.boton_asistencia, "attendance")
        enlazar(R.id.boton_agenda, "agenda")
        enlazar(R.id.boton_materias, "subjects")

        appWidgetManager.updateAppWidget(appWidgetIds, views)
    }
}
