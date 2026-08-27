import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import type { WebViewNavigation } from 'react-native-webview'
import {
  appShellRenderChanged,
  appShellRenderState,
  authDeliveryFailed,
  authDeliverySucceeded,
  authReceived,
  drainAppShell,
  initialAppShellState,
  initialAuthReceived,
  initialUrlReceived,
  rendererTerminated,
  warmUrlReceived,
  webLoadFailed,
  webLoadStarted,
  webLoadSucceeded,
  webNavigationChanged,
  type AppShellCommand,
  type AppShellState,
} from './src/appShellState'
import { appStateChanged, initialAppLifecycle, WEB_RESUME_SCRIPT } from './src/lifecycle'
import { applicationNavigationScript, classifyNavigation } from './src/navigation'
import {
  NATIVE_AUTH_CALLBACK_URL,
  nativeAuthExchangeScript,
  nativeAuthStartUrl,
  parseNativeAuthCallback,
  parseNativeAuthRequest,
} from './src/nativeAuth'

const BACKGROUND = '#0b0c0e'

WebBrowser.maybeCompleteAuthSession()

function StateView({ error, retry }: { error?: boolean; retry?: () => void }) {
  return (
    <View style={styles.state}>
      {error ? (
        <>
          <Text style={styles.eyebrow}>CONNECTION LOST</Text>
          <Text style={styles.title}>Praetorium could not load</Text>
          <Text style={styles.explanation}>Check your connection and try again.</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color="#7eaa9e" size="large" />
          <Text style={styles.loading}>Opening Praetorium</Text>
        </>
      )}
    </View>
  )
}

function AppShell() {
  const webView = useRef<WebView>(null)
  const canGoBack = useRef(false)
  const authOpen = useRef(false)
  const handledAuthTokens = useRef(new Set<string>())
  const lifecycle = useRef(initialAppLifecycle(AppState.currentState))
  const shellRef = useRef(initialAppShellState())
  const [renderedShell, setRenderedShell] = useState(() => appShellRenderState(shellRef.current))

  const commitShell = useCallback((state: AppShellState) => {
    const shouldRender = appShellRenderChanged(shellRef.current, state)
    shellRef.current = state
    if (shouldRender) setRenderedShell(appShellRenderState(state))
  }, [])

  const deliver = useCallback((command: AppShellCommand) => {
    const script = command.kind === 'auth' ? nativeAuthExchangeScript(command.callback) : applicationNavigationScript(command.url)
    if (script) webView.current?.injectJavaScript(script)
  }, [])

  const commitAndDrain = useCallback(
    (state: AppShellState) => {
      const drained = drainAppShell(state)
      commitShell(drained.state)
      if (drained.command) deliver(drained.command)
    },
    [commitShell, deliver],
  )

  const handleAuthCallback = useCallback(
    (url: string) => {
      const callback = parseNativeAuthCallback(url)
      if (callback.kind === 'success') {
        if (handledAuthTokens.current.has(callback.token)) return
        handledAuthTokens.current.add(callback.token)
        commitAndDrain(authReceived(shellRef.current, callback))
      } else {
        commitShell(warmUrlReceived(shellRef.current, url))
        Alert.alert('Sign-in did not finish', 'Return to Praetorium and try the provider again.')
      }
    },
    [commitAndDrain, commitShell],
  )

  const openNativeAuth = useCallback(
    async (message: string) => {
      const request = parseNativeAuthRequest(message)
      if (!request || authOpen.current) return
      authOpen.current = true
      try {
        const result = await WebBrowser.openAuthSessionAsync(nativeAuthStartUrl(request), NATIVE_AUTH_CALLBACK_URL)
        if ('url' in result) handleAuthCallback(result.url)
        else if (result.type !== WebBrowser.WebBrowserResultType.CANCEL && result.type !== WebBrowser.WebBrowserResultType.DISMISS)
          Alert.alert('Sign-in did not finish', 'Return to Praetorium and try the provider again.')
      } catch {
        Alert.alert('Could not open sign-in', 'The secure system sign-in session could not be opened.')
      } finally {
        authOpen.current = false
      }
    },
    [handleAuthCallback],
  )

  const openExternal = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Could not open link', 'No application on this device can open that link.')
    }
  }, [])

  const handleUrl = useCallback(
    (url: string) => {
      const decision = classifyNavigation(url)
      if (decision.kind === 'internal') return true
      if (decision.kind === 'external') void openExternal(decision.url)
      return false
    },
    [openExternal],
  )

  const navigateApplication = useCallback(
    (url: string) => {
      commitAndDrain(warmUrlReceived(shellRef.current, url))
    },
    [commitAndDrain],
  )

  const handleIncomingUrl = useCallback(
    (url: string) => {
      if (url.startsWith(NATIVE_AUTH_CALLBACK_URL)) {
        handleAuthCallback(url)
      } else navigateApplication(url)
    },
    [handleAuthCallback, navigateApplication],
  )

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false
      webView.current?.goBack()
      return true
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    let active = true
    void Linking.getInitialURL().then(
      (url) => {
        if (!active || !shellRef.current.initialUrlPending) return
        if (url?.startsWith(NATIVE_AUTH_CALLBACK_URL)) {
          const callback = parseNativeAuthCallback(url)
          if (callback.kind === 'success' && !handledAuthTokens.current.has(callback.token)) {
            handledAuthTokens.current.add(callback.token)
            commitAndDrain(initialAuthReceived(shellRef.current, callback))
          } else if (callback.kind === 'error') {
            commitShell(initialUrlReceived(shellRef.current, null))
            Alert.alert('Sign-in did not finish', 'Return to Praetorium and try the provider again.')
          }
        } else commitShell(initialUrlReceived(shellRef.current, url))
      },
      () => {
        if (active) commitShell(initialUrlReceived(shellRef.current, null))
      },
    )
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url)
    })
    return () => {
      active = false
      subscription.remove()
    }
  }, [commitAndDrain, commitShell, handleIncomingUrl])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      const changed = appStateChanged(lifecycle.current, status)
      lifecycle.current = changed.lifecycle
      if (changed.shouldResumeWebApp && shellRef.current.ready) webView.current?.injectJavaScript(WEB_RESUME_SCRIPT)
    })
    return () => subscription.remove()
  }, [])

  const updateNavigation = useCallback(
    (navigation: WebViewNavigation) => {
      canGoBack.current = navigation.canGoBack
      commitShell(webNavigationChanged(shellRef.current, navigation.url))
    },
    [commitShell],
  )

  const recoverRenderer = useCallback(() => {
    commitShell(rendererTerminated(shellRef.current))
  }, [commitShell])

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      {/* oxlint-disable-next-line react/style-prop-object -- Expo's style prop selects a color scheme. */}
      <StatusBar style="light" />
      {renderedShell.sourceUrl ? (
        <WebView
          key={renderedShell.renderKey}
          ref={webView}
          source={{ uri: renderedShell.sourceUrl }}
          style={styles.webView}
          containerStyle={styles.webView}
          originWhitelist={['*']}
          applicationNameForUserAgent="PraetoriumNative/0.3.0"
          injectedJavaScriptBeforeContentLoaded="window.PraetoriumNative = Object.freeze({ bridgeVersion: 1 }); true;"
          sharedCookiesEnabled
          thirdPartyCookiesEnabled={false}
          allowsBackForwardNavigationGestures
          allowsLinkPreview={false}
          setSupportMultipleWindows
          startInLoadingState
          renderLoading={() => <StateView />}
          renderError={() => <StateView error retry={() => webView.current?.reload()} />}
          onLoadStart={() => {
            commitShell(webLoadStarted(shellRef.current))
          }}
          onLoad={({ nativeEvent }) => {
            commitAndDrain(webLoadSucceeded(shellRef.current, nativeEvent.url))
          }}
          onError={() => commitShell(webLoadFailed(shellRef.current))}
          onHttpError={() => commitShell(webLoadFailed(shellRef.current))}
          onContentProcessDidTerminate={recoverRenderer}
          onRenderProcessGone={recoverRenderer}
          onMessage={({ nativeEvent }) => {
            const result = (() => {
              try {
                return JSON.parse(nativeEvent.data) as { type?: unknown; ok?: unknown }
              } catch {
                return null
              }
            })()
            if (result?.type === 'native-auth-result') {
              if (result.ok === true) commitShell(authDeliverySucceeded(shellRef.current))
              else {
                commitAndDrain(authDeliveryFailed(shellRef.current))
                Alert.alert('Sign-in did not finish', 'The secure sign-in code expired. Try again.')
              }
              return
            }
            void openNativeAuth(nativeEvent.data)
          }}
          onNavigationStateChange={updateNavigation}
          onShouldStartLoadWithRequest={({ url }) => handleUrl(url)}
          onOpenWindow={({ nativeEvent }) => {
            const decision = classifyNavigation(nativeEvent.targetUrl)
            if (decision.kind === 'internal') navigateApplication(decision.url)
            if (decision.kind === 'external') void openExternal(decision.url)
          }}
        />
      ) : (
        <StateView />
      )}
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  webView: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  state: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
    backgroundColor: BACKGROUND,
  },
  eyebrow: {
    color: '#c8c1ae',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  title: {
    color: '#eceff1',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  explanation: {
    color: '#a7aea8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  loading: {
    color: '#a7aea8',
    fontSize: 14,
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#7eaa9e',
    backgroundColor: '#171a1e',
  },
  buttonPressed: {
    backgroundColor: '#24292f',
  },
  buttonText: {
    color: '#eceff1',
    fontSize: 15,
    fontWeight: '600',
  },
})
