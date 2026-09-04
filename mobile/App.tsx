import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import * as KeepAwake from 'expo-keep-awake'
import * as Print from 'expo-print'
import * as WebBrowser from 'expo-web-browser'
import PostHog, { PostHogProvider, type PostHogOptions } from 'posthog-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
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
  navigationDeliverySucceeded,
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
import { NATIVE_BRIDGE_SCRIPT, parseNativeActionRequest, type NativeActionRequest } from './src/nativeActions'
import {
  APPLICATION_SEARCH_SCRIPT,
  APP_URL,
  applicationAccountMenuScript,
  applicationNavigationScript,
  classifyNavigation,
} from './src/navigation'
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
import { deleteSecureValue, getSecureValue, setSecureValue } from './src/secureStorage'

const BACKGROUND = '#0b0c0e'
const CHROME_BACKGROUND = '#111416'
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
  : {
      getItemAsync: getSecureValue,
      setItemAsync: setSecureValue,
      deleteItemAsync: deleteSecureValue,
    }
const ACTIVE_BATTLE_KEEP_AWAKE_TAG = 'praetorium-active-battle'
const POSTHOG_OPTIONS = {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  // Browser replay provides DOM-aware masking; native screenshot replay cannot
  // redact the WebView's contents without masking the whole view.
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

const tabs = [
  { label: 'Battles', path: '/battles', symbol: '×' },
  { label: 'Rosters', path: '/rosters', symbol: '▥' },
  { label: 'Factions', path: '/factions', symbol: '◇' },
  { label: 'Missions', path: '/mission-packs', symbol: '⊕' },
] as const

const moreDestinations = [
  { label: 'Leagues', path: '/leagues', symbol: '▤' },
  { label: 'Leaderboard', path: '/leaderboard', symbol: '♜' },
  { label: 'Rules', path: '/rules', symbol: '¶' },
] as const

function pathOf(url: string) {
  try {
    return new URL(url).pathname
  } catch {
    return '/'
  }
}

function tabIsActive(path: string, root: string) {
  return (
    (root === '/battles' && path === '/') ||
    path === root ||
    path.startsWith(`${root}/`) ||
    (root === '/mission-packs' && path.startsWith('/mission-matchups'))
  )
}

function AppShell() {
  const { height, width } = useWindowDimensions()
  const landscape = width > height
  const webView = useRef<WebView>(null)
  /**
   * Whether going back stays in the tab the player is looking at, which only the web
   * application can answer: every tab shares this one history stack, and a swipe that
   * pops it blindly leaves the tab. It stays off until a screen says otherwise, so the
   * bottom of a tab has nothing behind it.
   */
  const [backGesture, setBackGesture] = useState(false)
  const [nativeNavigation, setNativeNavigation] = useState<{ title: string; backUrl?: string; preferHistory: boolean }>({
    title: 'Praetorium',
    preferHistory: false,
  })
  const [nativeAccount, setNativeAccount] = useState<{ name?: string; image?: string }>({})
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const pendingMoreDestination = useRef<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState(APP_URL)
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
        case 'account':
          setNativeAccount({
            ...(action.name ? { name: action.name } : {}),
            ...(action.image ? { image: action.image } : {}),
          })
          break
        case 'account-menu':
          setAccountMenuOpen(action.open)
          break
        case 'navigation':
          setNativeNavigation({
            title: action.title,
            ...(action.backUrl ? { backUrl: action.backUrl } : {}),
            preferHistory: action.preferHistory,
          })
          if (pendingMoreDestination.current) {
            pendingMoreDestination.current = null
            setMoreOpen(false)
          }
          break
        case 'back-gesture':
          setBackGesture(action.enabled)
          break
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
      if (moreOpen) {
        setMoreOpen(false)
        return true
      }
      if (!backGesture) return false
      webView.current?.goBack()
      return true
    })
    return () => subscription.remove()
  }, [backGesture, moreOpen])

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
      setCurrentUrl(navigation.url)
      if (pendingMoreDestination.current && tabIsActive(pathOf(navigation.url), pendingMoreDestination.current)) {
        pendingMoreDestination.current = null
        setMoreOpen(false)
      }
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
      <View style={styles.header}>
        {!moreOpen && nativeNavigation.backUrl ? (
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => (nativeNavigation.preferHistory ? webView.current?.goBack() : navigateApplication(nativeNavigation.backUrl!))}
            style={styles.headerAction}
          >
            <Text style={styles.backSymbol}>‹</Text>
          </Pressable>
        ) : (
          <Image accessibilityIgnoresInvertColors source={require('./assets/logo.png')} style={styles.logo} />
        )}
        <Text numberOfLines={1} style={styles.brand}>
          {moreOpen ? 'MORE' : nativeNavigation.title.toUpperCase()}
        </Text>
        <Pressable
          accessibilityLabel="Search Praetorium"
          accessibilityRole="button"
          onPress={() => {
            setMoreOpen(false)
            webView.current?.injectJavaScript(APPLICATION_SEARCH_SCRIPT)
          }}
          style={styles.headerUtility}
        >
          <View aria-hidden style={styles.searchIcon}>
            <View style={styles.searchLens} />
            <View style={styles.searchHandle} />
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="Open account menu"
          accessibilityRole="button"
          onPress={() => {
            setMoreOpen(false)
            const open = !accountMenuOpen
            setAccountMenuOpen(open)
            webView.current?.injectJavaScript(applicationAccountMenuScript(open))
          }}
          style={styles.account}
        >
          {nativeAccount.image ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: nativeAccount.image }}
              style={styles.accountAvatar}
              onError={() => setNativeAccount((current) => ({ ...current, image: undefined }))}
            />
          ) : (
            <Text style={styles.accountText}>{nativeAccount.name?.trim().charAt(0).toUpperCase() || '◎'}</Text>
          )}
        </Pressable>
      </View>
      <View style={[styles.body, landscape && styles.bodyLandscape]}>
        <View style={styles.content}>
          {renderedShell.sourceUrl ? (
            <WebView
              key={renderedShell.renderKey}
              accessibilityElementsHidden={moreOpen}
              importantForAccessibility={moreOpen ? 'no-hide-descendants' : 'auto'}
              ref={webView}
              source={{ uri: renderedShell.sourceUrl }}
              style={styles.webView}
              containerStyle={styles.webView}
              originWhitelist={['*']}
              applicationNameForUserAgent={NATIVE_USER_AGENT}
              injectedJavaScriptBeforeContentLoaded={`${NATIVE_BRIDGE_SCRIPT}\n${nativeAuthCompletionScript()}`}
              sharedCookiesEnabled
              thirdPartyCookiesEnabled={false}
              allowsBackForwardNavigationGestures={backGesture}
              allowsLinkPreview={false}
              setBuiltInZoomControls={false}
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
                      url?: unknown
                    }
                  } catch {
                    return null
                  }
                })()
                if (result?.version === 3 && result.type === 'native-navigation-result' && typeof result.url === 'string') {
                  const acknowledged = navigationDeliverySucceeded(shellRef.current, result.url)
                  if (acknowledged !== shellRef.current) commitAndDrain(acknowledged)
                  return
                }
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
          {moreOpen ? (
            <View accessibilityRole="menu" style={styles.moreScreen}>
              <Text style={styles.moreHeading}>DESTINATIONS</Text>
              <View style={styles.moreList}>
                {moreDestinations.map((item) => {
                  const active = tabIsActive(pathOf(currentUrl), item.path)
                  return (
                    <Pressable
                      key={item.path}
                      accessibilityRole="menuitem"
                      onPress={() => {
                        if (active) setMoreOpen(false)
                        else {
                          pendingMoreDestination.current = item.path
                          navigateApplication(new URL(item.path, APP_URL).href)
                        }
                      }}
                      style={({ pressed }) => [styles.moreItem, active && styles.moreItemActive, pressed && styles.tabPressed]}
                    >
                      <Text style={[styles.moreItemSymbol, active && styles.activeTabText]}>{item.symbol}</Text>
                      <Text style={[styles.moreItemLabel, active && styles.activeTabText]}>{item.label}</Text>
                      <Text aria-hidden style={styles.moreChevron}>
                        ›
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : null}
        </View>
        <View accessibilityRole="tablist" style={[styles.tabs, landscape && styles.tabsLandscape]}>
          {tabs.map((tab) => {
            const destinationActive = tabIsActive(pathOf(currentUrl), tab.path)
            const active = !moreOpen && destinationActive
            return (
              <Pressable
                key={tab.path}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (moreOpen && !destinationActive) pendingMoreDestination.current = tab.path
                  else setMoreOpen(false)
                  navigateApplication(new URL(tab.path, APP_URL).href)
                }}
                style={({ pressed }) => [
                  styles.tab,
                  landscape && styles.tabLandscape,
                  active && styles.activeTab,
                  active && landscape && styles.activeTabLandscape,
                  pressed && styles.tabPressed,
                ]}
              >
                <Text style={[styles.tabSymbol, active && styles.activeTabText]}>{tab.symbol}</Text>
                <Text numberOfLines={1} style={[styles.tabLabel, active && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </Pressable>
            )
          })}
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: moreOpen || moreDestinations.some((item) => tabIsActive(pathOf(currentUrl), item.path)) }}
            onPress={() => setMoreOpen(true)}
            style={({ pressed }) => [
              styles.tab,
              landscape && styles.tabLandscape,
              (moreOpen || moreDestinations.some((item) => tabIsActive(pathOf(currentUrl), item.path))) && styles.activeTab,
              (moreOpen || moreDestinations.some((item) => tabIsActive(pathOf(currentUrl), item.path))) &&
                landscape &&
                styles.activeTabLandscape,
              pressed && styles.tabPressed,
            ]}
          >
            <Text
              style={[
                styles.tabSymbol,
                styles.moreSymbol,
                (moreOpen || moreDestinations.some((item) => tabIsActive(pathOf(currentUrl), item.path))) && styles.activeTabText,
              ]}
            >
              •••
            </Text>
            <Text
              style={[
                styles.tabLabel,
                (moreOpen || moreDestinations.some((item) => tabIsActive(pathOf(currentUrl), item.path))) && styles.activeTabText,
              ]}
            >
              More
            </Text>
          </Pressable>
        </View>
      </View>
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
    backgroundColor: CHROME_BACKGROUND,
  },
  body: { flex: 1 },
  bodyLandscape: { flexDirection: 'row-reverse' },
  content: { flex: 1, backgroundColor: BACKGROUND },
  webView: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2b3035',
    backgroundColor: CHROME_BACKGROUND,
  },
  logo: { width: 30, height: 30 },
  headerAction: { width: 30, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  backSymbol: { color: '#eceff1', fontSize: 36, fontWeight: '300', lineHeight: 38 },
  brand: { flex: 1, color: '#eceff1', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  headerUtility: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchIcon: { width: 22, height: 22 },
  searchLens: { width: 14, height: 14, borderWidth: 2.5, borderColor: '#c8c1ae', borderRadius: 7 },
  searchHandle: {
    position: 'absolute',
    right: 1,
    bottom: 3,
    width: 9,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#c8c1ae',
    transform: [{ rotate: '45deg' }],
  },
  account: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4a535a',
    borderRadius: 17,
  },
  accountText: { color: '#c8c1ae', fontSize: 12, fontWeight: '800' },
  accountAvatar: { width: 32, height: 32, borderRadius: 16 },
  tabs: {
    height: 66,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#2b3035',
    backgroundColor: CHROME_BACKGROUND,
  },
  tabsLandscape: {
    width: 78,
    height: 'auto',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    paddingTop: 6,
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderRightColor: '#2b3035',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  tabLandscape: { flex: 0, width: '100%', height: 58, borderTopWidth: 0, borderLeftWidth: 2, borderLeftColor: 'transparent' },
  activeTab: { borderTopColor: '#7eaa9e', backgroundColor: '#181c20' },
  activeTabLandscape: { borderTopColor: 'transparent', borderLeftColor: '#7eaa9e' },
  tabPressed: { opacity: 0.65 },
  tabSymbol: { color: '#737b76', fontSize: 20, fontWeight: '700' },
  moreSymbol: { fontSize: 16, letterSpacing: 1 },
  tabLabel: { color: '#737b76', fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  activeTabText: { color: '#7eaa9e' },
  moreScreen: { position: 'absolute', inset: 0, paddingHorizontal: 16, paddingTop: 24, backgroundColor: BACKGROUND },
  moreHeading: { marginBottom: 10, color: '#737b76', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  moreList: { borderWidth: 1, borderColor: '#2b3035', backgroundColor: '#15191c' },
  moreItem: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#2b3035',
  },
  moreItemActive: { backgroundColor: '#1b2223' },
  moreItemSymbol: { width: 28, color: '#c8c1ae', fontSize: 22, textAlign: 'center' },
  moreItemLabel: { color: '#eceff1', fontSize: 16, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  moreChevron: { marginLeft: 'auto', color: '#737b76', fontSize: 28, fontWeight: '300' },
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
