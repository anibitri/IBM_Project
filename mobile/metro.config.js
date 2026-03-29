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
    // 5. Pin React and React Native to the single root-level copies so all
    //    workspace packages resolve the same instance (prevents hook errors).
    extraNodeModules: {
      react: path.resolve(workspaceRoot, 'node_modules/react'),
      'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
    },
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
      // Block web workspaces to prevent React 19 from being picked up
      new RegExp(`${workspaceRoot.replace(/\//g, '\\/')}\\/web\\/.*`),
      new RegExp(`${workspaceRoot.replace(/\//g, '\\/')}\\/frontend\\/.*`),
      // Prevents Metro from getting confused by deeply nested duplicate modules
      /.*\/node_modules\/.*\/node_modules\/.*/,
    ]),
  },
};

module.exports = mergeConfig(defaultConfig, config);