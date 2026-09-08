const { expo } = require('./app.json')

module.exports = () => {
  const channel = process.env.MOBILE_UPDATE_CHANNEL
  if (!channel) return expo

  return {
    ...expo,
    updates: {
      ...expo.updates,
      requestHeaders: { 'expo-channel-name': channel },
    },
  }
}
