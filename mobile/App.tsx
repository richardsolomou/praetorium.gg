import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import type { WebViewNavigation } from 'react-native-webview'
import { APP_URL, classifyNavigation } from './src/navigation'
import {
  NATIVE_AUTH_CALLBACK_URL,
  nativeAuthExchangeScript,
  nativeAuthStartUrl,
  parseNativeAuthCallback,
  parseNativeAuthRequest,
  type NativeAuthCallback,
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
  const pendingAuth = useRef<Extract<NativeAuthCallback, { kind: 'success' }> | null>(null)
  const webReady = useRef(false)
  const [sourceUrl, setSourceUrl] = useState(APP_URL)

  const exchangeAuth = useCallback((callback: Extract<NativeAuthCallback, { kind: 'success' }>) => {
    if (!webReady.current) {
      pendingAuth.current = callback
      return
    }
    webView.current?.injectJavaScript(nativeAuthExchangeScript(callback))
  }, [])

  const handleAuthCallback = useCallback(
    (url: string) => {
      const callback = parseNativeAuthCallback(url)
      if (callback.kind === 'success') {
        if (handledAuthTokens.current.has(callback.token)) return
        handledAuthTokens.current.add(callback.token)
        exchangeAuth(callback)
      } else Alert.alert('Sign-in did not finish', 'Return to Praetorium and try the provider again.')
    },
    [exchangeAuth],
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

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false
      webView.current?.goBack()
      return true
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url?.startsWith(NATIVE_AUTH_CALLBACK_URL)) handleAuthCallback(url)
    })
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(NATIVE_AUTH_CALLBACK_URL)) handleAuthCallback(url)
    })
    return () => subscription.remove()
  }, [handleAuthCallback])

  const updateNavigation = useCallback((navigation: WebViewNavigation) => {
    canGoBack.current = navigation.canGoBack
  }, [])

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      {/* oxlint-disable-next-line react/style-prop-object -- Expo's style prop selects a color scheme. */}
      <StatusBar style="light" />
      <WebView
        ref={webView}
        source={{ uri: sourceUrl }}
        style={styles.webView}
        containerStyle={styles.webView}
        originWhitelist={['*']}
        applicationNameForUserAgent="PraetoriumNative/0.2.0"
        injectedJavaScriptBeforeContentLoaded="window.PraetoriumNative = Object.freeze({ bridgeVersion: 1 }); true;"
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        allowsBackForwardNavigationGestures
        allowsLinkPreview={false}
        setSupportMultipleWindows
        startInLoadingState
        renderLoading={() => <StateView />}
        renderError={() => <StateView error retry={() => webView.current?.reload()} />}
        onLoadEnd={() => {
          webReady.current = true
          if (pendingAuth.current) {
            const callback = pendingAuth.current
            pendingAuth.current = null
            exchangeAuth(callback)
          }
        }}
        onMessage={({ nativeEvent }) => {
          const result = (() => {
            try {
              return JSON.parse(nativeEvent.data) as { type?: unknown; ok?: unknown }
            } catch {
              return null
            }
          })()
          if (result?.type === 'native-auth-result') {
            if (result.ok !== true) Alert.alert('Sign-in did not finish', 'The secure sign-in code expired. Try again.')
            return
          }
          void openNativeAuth(nativeEvent.data)
        }}
        onNavigationStateChange={updateNavigation}
        onShouldStartLoadWithRequest={({ url }) => handleUrl(url)}
        onOpenWindow={({ nativeEvent }) => {
          const decision = classifyNavigation(nativeEvent.targetUrl)
          if (decision.kind === 'internal') setSourceUrl(decision.url)
          if (decision.kind === 'external') void openExternal(decision.url)
        }}
      />
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
