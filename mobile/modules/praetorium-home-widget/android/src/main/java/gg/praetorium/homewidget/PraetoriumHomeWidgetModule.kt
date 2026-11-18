package gg.praetorium.homewidget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PraetoriumHomeWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PraetoriumHomeWidget")

    Function("set") { widget: String? ->
      val context = appContext.reactContext ?: return@Function
      HomeWidgetProvider.save(context, widget)
    }
  }
}
