const { expo } = require('./app.json')

module.exports = () => {
  const channel = process.env.MOBILE_UPDATE_CHANNEL
  if (!channel) return expo

  return {
    ...expo,
    plugins: expo.plugins.map((plugin) => (plugin === 'expo-notifications' ? ['expo-notifications', { mode: 'production' }] : plugin)),
    updates: {
      ...expo.updates,
      requestHeaders: { 'expo-channel-name': channel },
    },
  }
}
