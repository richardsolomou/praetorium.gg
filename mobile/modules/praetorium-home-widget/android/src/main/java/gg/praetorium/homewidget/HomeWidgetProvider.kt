package gg.praetorium.homewidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.text.format.DateUtils
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/** Draws the things waiting on the player, as the app last saved them, with each line opening its page. */
class HomeWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = render(context)
    for (id in ids) manager.updateAppWidget(id, views)
  }

  companion object {
    private const val PREFERENCES = "praetorium_home_widget"
    private const val KEY = "widget"
    private val ROWS = listOf(
      Triple(R.id.praetorium_row_0, R.id.praetorium_row_0_title, R.id.praetorium_row_0_detail),
      Triple(R.id.praetorium_row_1, R.id.praetorium_row_1_title, R.id.praetorium_row_1_detail),
      Triple(R.id.praetorium_row_2, R.id.praetorium_row_2_title, R.id.praetorium_row_2_detail),
    )

    fun save(context: Context, widget: String?) {
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString(KEY, widget).apply()
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, HomeWidgetProvider::class.java))
      if (ids.isNotEmpty()) manager.updateAppWidget(ids, render(context))
    }

    private fun open(context: Context, url: String?, request: Int): PendingIntent {
      // Explicit, so a link to a development server with no matching intent filter still reaches the app.
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)!!.apply {
        if (url != null) {
          action = Intent.ACTION_VIEW
          data = Uri.parse(url)
        }
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      }
      return PendingIntent.getActivity(context, request, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun render(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.praetorium_home_widget)
      val saved = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(KEY, null)
      val items = saved?.let { runCatching { JSONObject(it).getJSONArray("items") }.getOrNull() }
      views.setOnClickPendingIntent(R.id.praetorium_widget_root, open(context, null, 0))
      ROWS.forEachIndexed { index, (row, title, detail) ->
        val item = items?.optJSONObject(index)
        views.setViewVisibility(row, if (item == null) View.GONE else View.VISIBLE)
        if (item == null) return@forEachIndexed
        val due = if (item.isNull("due")) null else item.getLong("due")
        val when_ = due?.let { DateUtils.getRelativeTimeSpanString(it, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS) }
        views.setTextViewText(title, item.getString("title"))
        views.setTextViewText(detail, listOfNotNull(item.getString("detail"), when_).joinToString(" · "))
        views.setTextColor(detail, if (item.getBoolean("urgent")) Color.parseColor("#F2A65A") else Color.parseColor("#8C969C"))
        views.setOnClickPendingIntent(row, open(context, item.getString("url"), index + 1))
      }
      val empty = when {
        saved == null -> "Sign in to Praetorium to see your games here."
        items == null || items.length() == 0 -> "Nothing is waiting on you."
        else -> null
      }
      views.setViewVisibility(R.id.praetorium_empty, if (empty == null) View.GONE else View.VISIBLE)
      views.setTextViewText(R.id.praetorium_empty, empty ?: "")
      return views
    }
  }
}
