import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import * as KeepAwake from 'expo-keep-awake'
import * as Print from 'expo-print'
import * as WebBrowser from 'expo-web-browser'
import * as SecureStore from 'expo-secure-store'
import PostHog, { PostHogProvider, type PostHogOptions } from 'posthog-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, BackHandler, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import type { WebViewNavigation } from 'react-native-webview'
import {
  appShellActivityChanged,
  appShellRenderChanged,
  appShellRenderState,
  authDeliveryDeferred,
  authDeliveryFailed,
  authDeliverySucceeded,
  authReceived,
  confirmWebLoadSucceeded,
  drainAppShell,
  initialAppShellState,
  initialAuthReceived,
  initialUrlReceived,
  rendererTerminated,
  warmUrlReceived,
  webLoadFailed,
  webLoadFinished,
  webNavigationStarted,
  webNavigationChanged,
  type AppShellCommand,
  type AppShellState,
} from './src/appShellState'
import { appStateChanged, initialAppLifecycle, WEB_RESUME_SCRIPT } from './src/lifecycle'
import { NATIVE_BRIDGE_SCRIPT, nativeHistoryStateScript, parseNativeActionRequest, type NativeActionRequest } from './src/nativeActions'
import { applicationNavigationScript, classifyNavigation } from './src/navigation'
import {
  NATIVE_AUTH_CALLBACK_URL,
  nativeAuthCompletionScript,
  nativeAuthConsumeScript,
  nativeAuthExchangeScript,
  nativeAuthStartUrl,
  parseNativeAuthCallback,
  parseNativeAuthRequest,
} from './src/nativeAuth'
import { completedPendingNativeAuth, parsePendingNativeAuth, pendingNativeAuth, type PendingNativeAuth } from './src/pendingNativeAuth'
import { NATIVE_USER_AGENT } from './src/version'

const BACKGROUND = '#0b0c0e'
const PENDING_AUTH_KEY = 'praetorium.native-auth.pending'
let pendingAuthTestValue: string | null = null
const pendingAuthStorage = process.env.EXPO_PUBLIC_NATIVE_AUTH_TEST_APP_URL
  ? {
      getItemAsync: async () => pendingAuthTestValue,
      setItemAsync: async (_key: string, value: string) => {
        pendingAuthTestValue = value
      },
      deleteItemAsync: async () => {
        pendingAuthTestValue = null
      },
    }
  : SecureStore
const ACTIVE_BATTLE_KEEP_AWAKE_TAG = 'praetorium-active-battle'
const POSTHOG_OPTIONS = {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  // The interface is one WKWebView. The native recorder runs that view out of
  // process, so it masks the whole screen and every native replay is black.
  // Unmasking it would expose the web DOM the native SDK cannot redact, and
  // posthog-js in the web app already records the same screen with its masking.
  enableSessionReplay: false,
  errorTracking: {
    autocapture: { uncaughtExceptions: true, unhandledRejections: true },
  },
} satisfies PostHogOptions
const posthogApiKey = __DEV__ ? undefined : process.env.EXPO_PUBLIC_POSTHOG_API_KEY
const posthog = posthogApiKey ? new PostHog(posthogApiKey, POSTHOG_OPTIONS) : null

function captureNativeException(operation: string, cause?: unknown) {
  const exception = cause instanceof Error ? cause : new Error(`Praetorium ${operation.replaceAll('_', ' ')} failed`, { cause })
  posthog?.captureException(exception, { operation })
}

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
  const battleAwake = useRef(false)
  const battleAwakeOperation = useRef<Promise<void>>(Promise.resolve())
  const handledAuthTokens = useRef(new Set<string>())
  const lifecycle = useRef(initialAppLifecycle(AppState.currentState))
  const shellRef = useRef(initialAppShellState(AppState.currentState === 'active'))
  const loadDrainTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadGeneration = useRef(0)
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

  const cancelScheduledDrain = useCallback(() => {
    loadGeneration.current += 1
    if (loadDrainTimer.current !== null) clearTimeout(loadDrainTimer.current)
    loadDrainTimer.current = null
  }, [])

  const finishWebLoad = useCallback(
    (url: string) => {
      cancelScheduledDrain()
      commitShell(webLoadFinished(shellRef.current, url))
      const generation = loadGeneration.current
      loadDrainTimer.current = setTimeout(() => {
        if (generation !== loadGeneration.current) return
        loadDrainTimer.current = null
        commitAndDrain(confirmWebLoadSucceeded(shellRef.current))
      }, 0)
    },
    [cancelScheduledDrain, commitAndDrain, commitShell],
  )

  const handleAuthCallback = useCallback(
    async (url: string, knownPending?: PendingNativeAuth) => {
      const pending = knownPending ?? parsePendingNativeAuth(await pendingAuthStorage.getItemAsync(PENDING_AUTH_KEY))
      const callback = parseNativeAuthCallback(url, pending ?? undefined)
      if (callback.kind === 'success') {
        if (handledAuthTokens.current.has(callback.token)) return
        handledAuthTokens.current.add(callback.token)
        try {
          await pendingAuthStorage.setItemAsync(PENDING_AUTH_KEY, JSON.stringify(completedPendingNativeAuth(pending!, url)))
        } catch (error) {
          handledAuthTokens.current.delete(callback.token)
          throw error
        }
        commitAndDrain(authReceived(shellRef.current, callback))
      } else {
        await pendingAuthStorage.deleteItemAsync(PENDING_AUTH_KEY)
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
      const pending = pendingNativeAuth(request)
      try {
        await pendingAuthStorage.setItemAsync(PENDING_AUTH_KEY, JSON.stringify(pending))
        const result = await WebBrowser.openAuthSessionAsync(nativeAuthStartUrl(request), NATIVE_AUTH_CALLBACK_URL)
        if ('url' in result) await handleAuthCallback(result.url, pending)
        else {
          await pendingAuthStorage.deleteItemAsync(PENDING_AUTH_KEY)
          if (result.type !== WebBrowser.WebBrowserResultType.CANCEL && result.type !== WebBrowser.WebBrowserResultType.DISMISS) {
            Alert.alert('Sign-in did not finish', 'Return to Praetorium and try the provider again.')
          }
        }
      } catch (error) {
        captureNativeException('native_auth', error)
        await pendingAuthStorage.deleteItemAsync(PENDING_AUTH_KEY)
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
    } catch (error) {
      captureNativeException('external_link', error)
      Alert.alert('Could not open link', 'No application on this device can open that link.')
    }
  }, [])

  const setBattleActive = useCallback((active: boolean) => {
    if (active === battleAwake.current) return battleAwakeOperation.current
    battleAwake.current = active
    const operation = battleAwakeOperation.current
      .catch(() => undefined)
      .then(() =>
        active
          ? KeepAwake.activateKeepAwakeAsync(ACTIVE_BATTLE_KEEP_AWAKE_TAG)
          : KeepAwake.deactivateKeepAwake(ACTIVE_BATTLE_KEEP_AWAKE_TAG),
      )
      .catch((error: unknown) => {
        if (battleAwake.current === active) battleAwake.current = !active
        throw error
      })
    battleAwakeOperation.current = operation
    return operation
  }, [])

  const navigateApplication = useCallback(
    (url: string) => {
      commitAndDrain(warmUrlReceived(shellRef.current, url))
    },
    [commitAndDrain],
  )

  const handleNativeAction = useCallback(
    async (action: NativeActionRequest) => {
      switch (action.kind) {
        case 'battle-active':
          await setBattleActive(action.active)
          break
        case 'haptic':
          if (Platform.OS === 'android') await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
          else await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          break
        case 'open-window': {
          const decision = classifyNavigation(action.url)
          // The application is one screen: a second window would stack a separate
          // web context over the one the player is already in.
          if (decision.kind === 'internal') navigateApplication(decision.url)
          if (decision.kind === 'external') await openExternal(decision.url)
          break
        }
        case 'print':
          await Print.printAsync({ html: action.html })
          break
        case 'share':
          await Share.share({ message: action.url, url: action.url, title: action.title })
          break
      }
    },
    [navigateApplication, openExternal, setBattleActive],
  )

  const handleNativeActionMessage = useCallback(
    (message: string) => {
      const action = parseNativeActionRequest(message)
      if (!action) return false
      void handleNativeAction(action).catch((error) => {
        captureNativeException(`native_${action.kind.replace('-', '_')}`, error)
        if (action.kind === 'print') Alert.alert('Could not print', 'The system print service could not open this roster.')
        if (action.kind === 'share') Alert.alert('Could not share', 'The system share sheet could not open this link.')
      })
      return true
    },
    [handleNativeAction],
  )

  const handleUrl = useCallback(
    (url: string) => {
      const decision = classifyNavigation(url)
      if (decision.kind === 'internal') return true
      if (decision.kind === 'external') void openExternal(decision.url)
      return false
    },
    [openExternal],
  )

  const handleIncomingUrl = useCallback(
    (url: string) => {
      if (url.startsWith(NATIVE_AUTH_CALLBACK_URL)) {
        void handleAuthCallback(url).catch((error) => {
          captureNativeException('native_auth_callback', error)
          Alert.alert('Sign-in did not finish', 'The secure sign-in result could not be saved. Try again.')
        })
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
    void Promise.all([Linking.getInitialURL(), pendingAuthStorage.getItemAsync(PENDING_AUTH_KEY)])
      .then(async ([url, stored]) => {
        if (!active || !shellRef.current.initialUrlPending) return
        if (url?.startsWith(NATIVE_AUTH_CALLBACK_URL)) {
          const pending = parsePendingNativeAuth(stored)
          const callback = parseNativeAuthCallback(url, pending ?? undefined)
          if (callback.kind === 'success' && pending && !handledAuthTokens.current.has(callback.token)) {
            handledAuthTokens.current.add(callback.token)
            try {
              await pendingAuthStorage.setItemAsync(PENDING_AUTH_KEY, JSON.stringify(completedPendingNativeAuth(pending, url)))
            } catch (error) {
              handledAuthTokens.current.delete(callback.token)
              throw error
            }
            if (!active) return
            commitAndDrain(initialAuthReceived(shellRef.current, callback))
          } else {
            void pendingAuthStorage.deleteItemAsync(PENDING_AUTH_KEY)
            commitShell(initialUrlReceived(shellRef.current, null))
            Alert.alert('Sign-in did not finish', 'Return to Praetorium and try the provider again.')
          }
        } else {
          const pending = parsePendingNativeAuth(stored)
          if (pending?.callbackUrl) await handleAuthCallback(pending.callbackUrl, pending)
          else commitShell(initialUrlReceived(shellRef.current, url))
        }
      })
      .catch((error) => {
        captureNativeException('native_initialization', error)
        if (active) commitShell(initialUrlReceived(shellRef.current, null))
      })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url)
    })
    return () => {
      active = false
      subscription.remove()
    }
  }, [commitAndDrain, commitShell, handleAuthCallback, handleIncomingUrl])

  useEffect(() => cancelScheduledDrain, [cancelScheduledDrain])

  useEffect(
    () => () => {
      void setBattleActive(false).catch(() => undefined)
    },
    [setBattleActive],
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      const changed = appStateChanged(lifecycle.current, status)
      lifecycle.current = changed.lifecycle
      if (changed.shouldResumeWebApp && shellRef.current.ready) webView.current?.injectJavaScript(WEB_RESUME_SCRIPT)
      const nextShell = appShellActivityChanged(shellRef.current, status === 'active')
      if (status === 'active') commitAndDrain(nextShell)
      else commitShell(nextShell)
    })
    return () => subscription.remove()
  }, [commitAndDrain, commitShell])

  const updateNavigation = useCallback(
    (navigation: WebViewNavigation) => {
      canGoBack.current = navigation.canGoBack
      webView.current?.injectJavaScript(nativeHistoryStateScript(navigation.canGoBack))
      commitShell(webNavigationChanged(shellRef.current, navigation.url))
    },
    [commitShell],
  )

  const recoverRenderer = useCallback(() => {
    captureNativeException('web_renderer')
    cancelScheduledDrain()
    void setBattleActive(false).catch(() => undefined)
    commitShell(rendererTerminated(shellRef.current))
  }, [cancelScheduledDrain, commitShell, setBattleActive])

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
          applicationNameForUserAgent={NATIVE_USER_AGENT}
          injectedJavaScriptBeforeContentLoaded={`${NATIVE_BRIDGE_SCRIPT}\n${nativeAuthCompletionScript()}`}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled={false}
          allowsBackForwardNavigationGestures
          allowsLinkPreview={false}
          setSupportMultipleWindows
          startInLoadingState
          renderLoading={() => <StateView />}
          renderError={() => <StateView error retry={() => webView.current?.reload()} />}
          onLoadStart={({ nativeEvent }) => {
            cancelScheduledDrain()
            commitShell(webNavigationStarted(shellRef.current, Platform.OS, nativeEvent.loading))
          }}
          onLoad={({ nativeEvent }) => {
            finishWebLoad(nativeEvent.url)
          }}
          onError={({ nativeEvent }) => {
            captureNativeException('web_load', new Error(`WebView load failed: ${nativeEvent.description} (code ${nativeEvent.code})`))
            cancelScheduledDrain()
            commitShell(webLoadFailed(shellRef.current))
          }}
          onHttpError={({ nativeEvent }) => {
            captureNativeException('web_http', new Error(`WebView HTTP error ${nativeEvent.statusCode}: ${nativeEvent.description}`))
            cancelScheduledDrain()
            commitShell(webLoadFailed(shellRef.current))
          }}
          onContentProcessDidTerminate={recoverRenderer}
          onRenderProcessGone={recoverRenderer}
          onMessage={({ nativeEvent }) => {
            if (handleNativeActionMessage(nativeEvent.data)) return
            const result = (() => {
              try {
                return JSON.parse(nativeEvent.data) as {
                  version?: unknown
                  type?: unknown
                  id?: unknown
                  ok?: unknown
                  retryable?: unknown
                }
              } catch {
                return null
              }
            })()
            if (result?.version === 2 && result.type === 'native-auth-result' && typeof result.id === 'string') {
              if (result.ok === true) {
                const delivering = shellRef.current.delivering
                if (delivering?.kind !== 'auth' || delivering.callback.id !== result.id) return
                commitShell(authDeliverySucceeded(shellRef.current, result.id))
                void pendingAuthStorage.deleteItemAsync(PENDING_AUTH_KEY).then(
                  () => webView.current?.injectJavaScript(nativeAuthConsumeScript(delivering.callback)),
                  (error) => captureNativeException('native_auth_cleanup', error),
                )
              } else if (result.retryable === true) {
                const deferred = authDeliveryDeferred(shellRef.current, result.id)
                if (deferred === shellRef.current) return
                commitShell(deferred)
                Alert.alert(
                  'Sign-in is waiting',
                  'Praetorium could not finish the secure sign-in exchange. Check your connection and retry.',
                  [{ text: 'Retry', onPress: () => commitAndDrain(shellRef.current) }],
                  { cancelable: false },
                )
              } else {
                const failed = authDeliveryFailed(shellRef.current, result.id)
                if (failed === shellRef.current) return
                commitAndDrain(failed)
                void pendingAuthStorage.deleteItemAsync(PENDING_AUTH_KEY)
                Alert.alert('Sign-in did not finish', 'The secure sign-in code expired. Try again.')
              }
              return
            }
            void openNativeAuth(nativeEvent.data)
          }}
          onNavigationStateChange={updateNavigation}
          onShouldStartLoadWithRequest={({ url }) => handleUrl(url)}
          onOpenWindow={({ nativeEvent }) => {
            void handleNativeAction({ kind: 'open-window', url: nativeEvent.targetUrl })
          }}
        />
      ) : (
        <StateView />
      )}
    </SafeAreaView>
  )
}

export default function App() {
  const application = (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  )
  if (!posthog) return application

  return (
    <PostHogProvider client={posthog} autocapture={{ captureScreens: false }}>
      {application}
    </PostHogProvider>
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
