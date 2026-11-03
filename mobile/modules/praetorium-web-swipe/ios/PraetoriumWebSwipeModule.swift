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
    AsyncFunction("setCover") { (covered: Bool) in
      setCover(covered)
    }.runOnQueue(.main)
  }
}

/// Returns false when a swiping web view has no back-edge recognizer to gate.
private func gateBackSwipe(_ enabled: Bool) -> Bool {
  let webViews = allWebViews()
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

private var covers: [UIView] = []
private var coverGeneration = 0

/// Freezes what the web views show under a still picture of it, so a page can draw screens it passes through
/// without them showing. WebKit snapshots only the web view's own layers, so its swipe previews still see them.
private func setCover(_ covered: Bool) {
  covers.forEach { $0.removeFromSuperview() }
  covers = []
  coverGeneration += 1
  guard covered else { return }
  for webView in allWebViews() {
    guard let superview = webView.superview, let cover = webView.snapshotView(afterScreenUpdates: false) else { continue }
    cover.frame = webView.frame
    superview.insertSubview(cover, aboveSubview: webView)
    covers.append(cover)
  }
  // A page that never lifts the cover must not freeze the app.
  let generation = coverGeneration
  DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
    if generation == coverGeneration { setCover(false) }
  }
}

private func allWebViews() -> [WKWebView] {
  UIApplication.shared.connectedScenes
    .compactMap { $0 as? UIWindowScene }
    .flatMap(\.windows)
    .flatMap { swipingWebViews(in: $0) }
}

private func swipingWebViews(in view: UIView) -> [WKWebView] {
  if let webView = view as? WKWebView {
    return webView.allowsBackForwardNavigationGestures ? [webView] : []
  }
  return view.subviews.flatMap { swipingWebViews(in: $0) }
}
