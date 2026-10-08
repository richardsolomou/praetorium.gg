Pod::Spec.new do |s|
  s.name = 'PraetoriumWatch'
  s.version = '1.0.0'
  s.summary = 'Praetorium watch companion transport'
  s.description = s.summary
  s.license = 'AGPL-3.0-only'
  s.author = 'Praetorium'
  s.homepage = 'https://praetorium.gg'
  s.source = { git: 'https://github.com/richardsolomou/praetorium.gg.git' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
