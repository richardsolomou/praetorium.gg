import { nativeApplicationVersion } from 'expo-application'
import { NATIVE_USER_AGENT_PRODUCT } from '../../src/contracts/nativeBridge'
import appConfig from '../app.json'

export const NATIVE_USER_AGENT = `${NATIVE_USER_AGENT_PRODUCT}/${nativeApplicationVersion ?? appConfig.expo.version}`
