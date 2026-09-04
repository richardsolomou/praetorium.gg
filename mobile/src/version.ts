import { nativeApplicationVersion } from 'expo-application'
import appConfig from '../app.json'

export const NATIVE_USER_AGENT = `PraetoriumNative/${nativeApplicationVersion ?? appConfig.expo.version}`
