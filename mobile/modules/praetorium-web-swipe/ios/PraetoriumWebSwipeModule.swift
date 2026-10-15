import ExpoModulesCore
import WebKit

/// WebKit records the page snapshots a back swipe reveals only while its swipe is allowed,
/// so the shell leaves it allowed and gates the edge recognizers WebKit installs instead.
public class PraetoriumWebSwipeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PraetoriumWebSwipe")
    AsyncFunction("setBackSwipe") { (enabled: Bool) -> Bool in
      gateBackSwipe(enabled)
    }.runOnQueue(.main)
  }
}

/// Returns false when a swiping web view has no back-edge recognizer to gate.
private func gateBackSwipe(_ enabled: Bool) -> Bool {
  let webViews = UIApplication.shared.connectedScenes
    .compactMap { $0 as? UIWindowScene }
    .flatMap(\.windows)
    .flatMap { swipingWebViews(in: $0) }
  var gated = true
  for webView in webViews {
    let recognizers = webView.gestureRecognizers?.compactMap { $0 as? UIScreenEdgePanGestureRecognizer } ?? []
    let back = recognizers.filter { $0.edges == .left }
    if back.isEmpty {
      gated = false
      continue
    }
    back.forEach { $0.isEnabled = enabled }
    recognizers.filter { $0.edges == .right }.forEach { $0.isEnabled = false }
  }
  return gated
}

private func swipingWebViews(in view: UIView) -> [WKWebView] {
  if let webView = view as? WKWebView {
    return webView.allowsBackForwardNavigationGestures ? [webView] : []
  }
  return view.subviews.flatMap { swipingWebViews(in: $0) }
}
