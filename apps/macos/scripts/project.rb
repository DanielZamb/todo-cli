require 'xcodeproj'
root = File.expand_path('..', __dir__)
project = Xcodeproj::Project.new(File.join(root, 'Todo.xcodeproj'))
app = project.new_target(:application, 'Todo', :osx, '26.0')
unit = project.new_target(:unit_test_bundle, 'TodoTests', :osx, '26.0')
ui = project.new_target(:ui_test_bundle, 'TodoUITests', :osx, '26.0')
[[app, 'Sources'], [unit, 'Tests'], [ui, 'UITests']].each do |target, folder|
  group = project.main_group.new_group(folder, folder)
  Dir[File.join(root, folder, '*.swift')].sort.each do |path|
    target.source_build_phase.add_file_reference(group.new_file(File.basename(path)))
  end
  target.build_configurations.each do |config|
    config.build_settings.merge!({
      'SWIFT_VERSION' => '6.0', 'SWIFT_STRICT_CONCURRENCY' => 'complete',
      'MACOSX_DEPLOYMENT_TARGET' => '26.0', 'GENERATE_INFOPLIST_FILE' => 'YES',
      'PRODUCT_BUNDLE_IDENTIFIER' => "local.todo.#{target.name}",
      'CODE_SIGN_IDENTITY' => 'Apple Development', 'CODE_SIGN_STYLE' => 'Automatic',
      'CURRENT_PROJECT_VERSION' => '1', 'MARKETING_VERSION' => '0.1.0',
      'ENABLE_APP_SANDBOX' => 'NO', 'ENABLE_HARDENED_RUNTIME' => 'YES',
      'COMBINE_HIDPI_IMAGES' => 'YES'
    })
  end
end
app.build_configurations.each do |config|
  config.build_settings.merge!({
    'INFOPLIST_KEY_CFBundleDisplayName' => 'Todo',
    'INFOPLIST_KEY_LSApplicationCategoryType' => 'public.app-category.productivity',
    'INFOPLIST_KEY_NSHighResolutionCapable' => 'YES',
    'ASSETCATALOG_COMPILER_APPICON_NAME' => 'Todo'
  })
end
server_phase = app.new_shell_script_build_phase('Bundle compiled server')
server_phase.shell_script = '"$SRCROOT/scripts/bundle-server.sh" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/Server"'
server_phase.always_out_of_date = '1'
server_phase.output_paths = [
  '$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/Server/todo-server',
  '$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/Server/THIRD_PARTY_NOTICES.txt'
]
assets = project.main_group.new_file('../../design/macos/Assets.xcassets')
app.resources_build_phase.add_file_reference(assets)
icon = project.main_group.new_file('../../design/icon/Todo.icon')
app.resources_build_phase.add_file_reference(icon)
package = project.new(Xcodeproj::Project::Object::XCLocalSwiftPackageReference)
package.relative_path = 'API'
project.root_object.package_references << package
product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
product.product_name = 'TodoAPI'
app.package_product_dependencies << product
build = project.new(Xcodeproj::Project::Object::PBXBuildFile)
build.product_ref = product
app.frameworks_build_phase.files << build
unit.add_dependency(app)
ui.add_dependency(app)
unit.build_configurations.each do |config|
  config.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/Todo.app/Contents/MacOS/Todo'
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
end
ui.build_configurations.each { |config| config.build_settings['TEST_TARGET_NAME'] = 'Todo' }
2.times { project.predictabilize_uuids }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(unit)
scheme.add_test_target(ui)
scheme.test_action.should_use_launch_scheme_args_env = false
scheme.test_action.environment_variables = Xcodeproj::XCScheme::EnvironmentVariables.new([{
  key: 'TODO_VERIFY_KEYCHAIN_NO_UI', value: '1', enabled: true
}, {
  key: 'TODO_VERIFY_KEYCHAIN_FAILURE', value: '$(PROJECT_DIR)/DerivedData/keychain-failure.json', enabled: true
}, {
  key: 'TODO_MACOS_CONFIG',
  value: '$(PROJECT_DIR)/DerivedData/verification.json',
  enabled: true
}])
scheme.set_launch_target(app)
scheme.save_as(project.path, 'Todo', true)
