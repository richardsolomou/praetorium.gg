module.exports = ({ config }) => {
  const channel = process.env.MOBILE_UPDATE_CHANNEL
  if (!channel) return config

  return {
    ...config,
    plugins: config.plugins.map((plugin) => (plugin === 'expo-notifications' ? ['expo-notifications', { mode: 'production' }] : plugin)),
    updates: {
      ...config.updates,
      requestHeaders: { 'expo-channel-name': channel },
    },
  }
}
