const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..'); // Points to your main project root

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  // 1. CRITICAL: You MUST watch the workspaceRoot so Metro is allowed to read hoisted node_modules
  watchFolders: [workspaceRoot],
  
  resolver: {
    // 2. Tell Metro exactly where the modules live
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // 3. Keep your custom Viro AR extensions
    assetExts: [
      ...defaultConfig.resolver.assetExts,
      'obj', 'mtl', 'JPG', 'vrx', 'hdr', 'gltf', 'glb', 'bin', 'arobject'
    ],
    // 4. MUST be 'blockList' in RN 0.75+ (blacklistRE is ignored)
    // Adding `.*` to the start ensures it matches correctly anywhere in the tree
    blockList: exclusionList([
      /.*\/ios\/build\/.*/,
      /.*\/android\/build\/.*/,
      /.*\/deliverables\/.*/,
      /.*\/backend\/.*/,
      /.*\/test_visuals\/.*/,
      /.*\/reports\/.*/,
      // Prevents Metro from getting confused by deeply nested duplicate modules
      /.*\/node_modules\/.*\/node_modules\/.*/, 
    ]),
  },
};

module.exports = mergeConfig(defaultConfig, config);