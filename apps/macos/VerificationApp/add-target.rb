require 'xcodeproj'
root = File.expand_path('..', __dir__)
project = Xcodeproj::Project.new(File.join(__dir__, 'TodoVerification.xcodeproj'))
production = Xcodeproj::Project.open(File.join(root, 'Todo.xcodeproj')).targets.find { |target| target.name == 'Todo' }
target = project.new_target(:application, 'TodoVerification', :osx, '26.0')
trap = project.new_target(:dynamic_library, 'CredentialTrap', :osx, '26.0')
excluded = %w[TodoApp.swift SessionVault.swift ServerLifecycle.swift ServerSettingsView.swift]
group = project.main_group.new_group('Production screens', '../Sources')
production.source_build_phase.files.each do |file|
  target.source_build_phase.add_file_reference(group.new_file(file.file_ref.path)) unless excluded.include?(file.file_ref.path)
end
group = project.main_group.new_group('VerificationApp', '.')
Dir[File.join(__dir__, '*.swift')].sort.each do |path|
  target.source_build_phase.add_file_reference(group.new_file(File.basename(path))) unless File.basename(path) == 'BuildBindings.generated.swift'
end
target.source_build_phase.add_file_reference(group.new_file('BuildBindings.generated.swift'))
trap.source_build_phase.add_file_reference(group.new_file('CredentialTrap.c'))
trap.source_build_phase.add_file_reference(group.new_file('ChildProof.c'))
trap.source_build_phase.add_file_reference(group.new_file('BoundaryProof.c'))
trap.add_system_framework('Security')
trap.add_system_framework('IOKit')
trap.add_system_framework('CoreFoundation')
trap.add_system_framework('Foundation')
target.add_dependency(trap)
target.frameworks_build_phase.add_file_reference(trap.product_reference)
copy = target.new_copy_files_build_phase('Embed credential trap')
copy.dst_subfolder_spec = '10'
copy.add_file_reference(trap.product_reference)
resources = project.main_group.new_group('Production resources', '../../../design')
target.resources_build_phase.add_file_reference(resources.new_file('macos/Assets.xcassets'))
target.resources_build_phase.add_file_reference(resources.new_file('icon/Todo.icon'))
package = project.new(Xcodeproj::Project::Object::XCLocalSwiftPackageReference)
package.relative_path = '../API'
project.root_object.package_references << package
product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
product.product_name = 'TodoAPI'
target.package_product_dependencies << product
build = project.new(Xcodeproj::Project::Object::PBXBuildFile)
build.product_ref = product
target.frameworks_build_phase.files << build
phase = target.new_shell_script_build_phase('Bundle canonical graph resources')
phase.shell_script = '"$TODO_NODE_BINARY" "$SRCROOT/../../../.agents/skills/verify-macos-real-app/scripts/bundle-graph.mjs" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/graph-browser"'
phase.always_out_of_date = '1'
phase.output_paths = ['$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/graph-browser/graph.js']
[target, trap].each do |item|
  item.build_configurations.each do |config|
    config.build_settings.merge!({
      'SWIFT_VERSION' => '6.0', 'SWIFT_STRICT_CONCURRENCY' => 'complete',
      'MACOSX_DEPLOYMENT_TARGET' => '26.0', 'GENERATE_INFOPLIST_FILE' => 'YES',
      'PRODUCT_BUNDLE_IDENTIFIER' => 'local.todo.verification',
      'INFOPLIST_KEY_CFBundleDisplayName' => 'Todo Verification',
      'CODE_SIGNING_ALLOWED' => 'NO', 'CODE_SIGNING_REQUIRED' => 'NO',
      'CODE_SIGN_IDENTITY' => '', 'DEVELOPMENT_TEAM' => '',
      'ENABLE_HARDENED_RUNTIME' => 'NO', 'SKIP_INSTALL' => 'YES',
      'CURRENT_PROJECT_VERSION' => '1', 'MARKETING_VERSION' => '0.1.0',
      'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/../Frameworks'
    })
  end
end
trap.build_configurations.each { |config| config.build_settings['LD_DYLIB_INSTALL_NAME'] = '@rpath/libCredentialTrap.dylib' }
2.times { project.predictabilize_uuids }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.set_launch_target(target)
scheme.save_as(project.path, 'TodoVerification', true)
