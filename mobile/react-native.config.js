'use strict';

// In this monorepo, react-native and its CLI plugins are hoisted to the root
// node_modules. The CLI (running from the mobile workspace) can't auto-discover
// them, so we register the commands explicitly here.
const { bundleCommand, startCommand } = require('@react-native/community-cli-plugin');
const ios = require('@react-native-community/cli-platform-ios');

module.exports = {
  commands: [
    startCommand,
    bundleCommand,
    ...ios.commands,
  ],
  platforms: {
    ios: {
      projectConfig: ios.projectConfig,
      dependencyConfig: ios.dependencyConfig,
    },
  },
};
