module.exports = {
  extraSources: [
    { type: 'dir', filePath: 'watch', reasons: ['watchCompanion'] },
    { type: 'file', filePath: 'eas.json', reasons: ['nativeBuildProfiles'] },
  ],
  ignorePaths: ['watch/Tests/**/*', 'watch/.build/**/*', 'watch/.swiftpm/**/*', 'watch/Package.swift'],
}
