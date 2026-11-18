const fs = require('node:fs')
const path = require('node:path')
const { withXcodeProject } = require('expo/config-plugins')

const TARGET = 'PraetoriumWidgets'
const SOURCES = [
  'widgets/PraetoriumWidgets.swift',
  'widgets/BattleActivityWidget.swift',
  'widgets/HomeWidget.swift',
  // The Live Activity's attributes are the app module's own file, so the two can never describe the activity differently.
  'modules/praetorium-battle-activity/ios/BattleActivityAttributes.swift',
  // The home widget reads what the app module writes to the App Group, through the module's own file.
  'modules/praetorium-home-widget/ios/HomeWidgetData.swift',
]

/** Adds the WidgetKit extension that draws the battle Live Activity and the home screen widget, embedded in the iPhone application. */
module.exports = (config) =>
  withXcodeProject(config, (mod) => {
    const project = mod.modResults
    const objects = project.hash.project.objects
    objects.PBXTargetDependency ??= {}
    objects.PBXContainerItemProxy ??= {}
    const buildNumber = mod.ios.buildNumber ?? '1'
    const directory = path.join(mod.modRequest.platformProjectRoot, TARGET)
    fs.mkdirSync(directory, { recursive: true })
    const files = SOURCES.map((source) => path.basename(source))
    for (const source of SOURCES)
      fs.copyFileSync(path.join(mod.modRequest.projectRoot, source), path.join(directory, path.basename(source)))
    fs.writeFileSync(
      path.join(directory, `${TARGET}-Info.plist`),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Praetorium</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundlePackageType</key><string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
<key>CFBundleShortVersionString</key><string>${mod.version}</string>
<key>CFBundleVersion</key><string>${buildNumber}</string>
<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string></dict>
</dict></plist>`,
    )
    const entitlements = mod.ios.entitlements?.['com.apple.security.application-groups'] ?? []
    fs.writeFileSync(
      path.join(directory, `${TARGET}.entitlements`),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.security.application-groups</key><array>${entitlements.map((group) => `<string>${group}</string>`).join('')}</array>
</dict></plist>`,
    )
    if (Object.values(objects.PBXNativeTarget).some((target) => target.name?.replaceAll('"', '') === TARGET)) return mod
    const target = project.addTarget(TARGET, 'app_extension', TARGET, `${mod.ios.bundleIdentifier}.widgets`)
    objects.PBXFileReference[target.pbxNativeTarget.productReference].path = `"${TARGET}.appex"`
    const group = project.addPbxGroup([], TARGET, '""')
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup)
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid)
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid)
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)
    for (const file of files) project.addSourceFile(`${TARGET}/${file}`, { target: target.uuid }, group.uuid)
    for (const configuration of Object.values(objects.XCBuildConfiguration)) {
      if (configuration.buildSettings?.PRODUCT_NAME !== `"${TARGET}"`) continue
      Object.assign(configuration.buildSettings, {
        SDKROOT: 'iphoneos',
        TARGETED_DEVICE_FAMILY: '"1,2"',
        IPHONEOS_DEPLOYMENT_TARGET: '16.4',
        SWIFT_VERSION: '5.0',
        GENERATE_INFOPLIST_FILE: 'NO',
        APPLICATION_EXTENSION_API_ONLY: 'YES',
        CODE_SIGN_STYLE: 'Automatic',
        CODE_SIGN_ENTITLEMENTS: `${TARGET}/${TARGET}.entitlements`,
        CURRENT_PROJECT_VERSION: buildNumber,
        MARKETING_VERSION: mod.version,
      })
      if (configuration.name === 'Debug') configuration.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = 'DEBUG'
    }
    return mod
  })
