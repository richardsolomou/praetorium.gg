import ExpoModulesCore
import WidgetKit

public class PraetoriumHomeWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PraetoriumHomeWidget")
    Function("set") { (widget: String?) in
      HomeWidgetData.write(widget)
      WidgetCenter.shared.reloadTimelines(ofKind: HomeWidgetData.kind)
    }
  }
}
