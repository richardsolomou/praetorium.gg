const fs = require('node:fs')
const path = require('node:path')
const { withXcodeProject } = require('expo/config-plugins')

const TARGET = 'PraetoriumWatch'
const SOURCE_FILES = ['PraetoriumWatchApp.swift', 'CompanionView.swift', 'BattleSnapshot.swift', 'BattleSession.swift', 'WatchStore.swift']

module.exports = (config) =>
  withXcodeProject(config, (mod) => {
    const project = mod.modResults
    const objects = project.hash.project.objects
    objects.PBXTargetDependency ??= {}
    objects.PBXContainerItemProxy ??= {}
    const bundleId = `${mod.ios.bundleIdentifier}.watch`
    const directory = path.join(mod.modRequest.platformProjectRoot, TARGET)
    fs.mkdirSync(directory, { recursive: true })
    for (const file of [...SOURCE_FILES, 'demo-battle.json', 'PrivacyInfo.xcprivacy']) {
      fs.copyFileSync(path.join(mod.modRequest.projectRoot, 'watch', file), path.join(directory, file))
    }
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>Praetorium</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${mod.version}</string>
<key>CFBundleVersion</key><string>${mod.ios.buildNumber ?? '1'}</string>
<key>WKApplication</key><true/>
<key>WKCompanionAppBundleIdentifier</key><string>${mod.ios.bundleIdentifier}</string>
<key>WKRunsIndependentlyOfCompanionApp</key><false/>
</dict></plist>`
    fs.writeFileSync(path.join(directory, `${TARGET}-Info.plist`), plist)
    const existing = Object.entries(objects.PBXNativeTarget).find(
      ([key, target]) => !key.endsWith('_comment') && target.name?.replaceAll('"', '') === TARGET,
    )
    const target = existing
      ? { uuid: existing[0], pbxNativeTarget: existing[1] }
      : project.addTarget(TARGET, 'application', TARGET, bundleId)
    const phone = project.getFirstTarget()
    if (!phone.firstTarget.dependencies.some((dependency) => objects.PBXTargetDependency[dependency.value]?.target === target.uuid))
      project.addTargetDependency(phone.uuid, [target.uuid])
    const existingGroup = Object.entries(objects.PBXGroup).find(([key, value]) => !key.endsWith('_comment') && value.name === TARGET)
    const group = existingGroup ? { uuid: existingGroup[0] } : project.addPbxGroup([], TARGET, '""')
    if (!existingGroup) project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup)
    if (!existing) {
      project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid)
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid)
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)
    }
    for (const file of SOURCE_FILES) project.addSourceFile(`${TARGET}/${file}`, { target: target.uuid }, group.uuid)
    const resources = ['demo-battle.json', 'Assets.xcassets', 'PrivacyInfo.xcprivacy']
    const icons = path.join(directory, 'Assets.xcassets', 'AppIcon.appiconset')
    fs.mkdirSync(icons, { recursive: true })
    fs.copyFileSync(path.join(mod.modRequest.projectRoot, 'assets', 'icon.png'), path.join(icons, 'icon.png'))
    fs.writeFileSync(
      path.join(icons, 'Contents.json'),
      JSON.stringify({
        images: [{ filename: 'icon.png', idiom: 'universal', platform: 'watchos', size: '1024x1024' }],
        info: { author: 'xcode', version: 1 },
      }),
    )
    for (const name of resources) {
      const resource = project.addFile(`${TARGET}/${name}`, group.uuid)
      if (!resource) continue
      resource.target = target.uuid
      resource.uuid = project.generateUuid()
      project.addToPbxBuildFileSection(resource)
      project.addToPbxResourcesBuildPhase(resource)
    }
    for (const configuration of Object.values(objects.XCBuildConfiguration)) {
      if (configuration.buildSettings?.PRODUCT_NAME !== `"${TARGET}"`) continue
      Object.assign(configuration.buildSettings, {
        SDKROOT: 'watchos',
        SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
        TARGETED_DEVICE_FAMILY: '4',
        WATCHOS_DEPLOYMENT_TARGET: '10.0',
        SWIFT_VERSION: '5.0',
        SWIFT_EMIT_LOC_STRINGS: 'YES',
        GENERATE_INFOPLIST_FILE: 'NO',
        ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
        CODE_SIGN_STYLE: 'Automatic',
        CURRENT_PROJECT_VERSION: mod.ios.buildNumber ?? '1',
        MARKETING_VERSION: mod.version,
        ENABLE_PREVIEWS: 'YES',
      })
      if (configuration.name === 'Debug') configuration.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS = 'DEBUG'
    }
    if (existing) return mod
    const embed = project.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      'Embed Watch Content',
      project.getFirstTarget().uuid,
      'watch2_app',
      '"$(CONTENTS_FOLDER_PATH)/Watch"',
    )
    const buildId = project.generateUuid()
    objects.PBXBuildFile[buildId] = {
      isa: 'PBXBuildFile',
      fileRef: target.pbxNativeTarget.productReference,
      fileRef_comment: `${TARGET}.app`,
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
    }
    objects.PBXBuildFile[`${buildId}_comment`] = `${TARGET}.app in Embed Watch Content`
    embed.buildPhase.files.push({ value: buildId, comment: `${TARGET}.app in Embed Watch Content` })
    return mod
  })
