const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add watchFolders to limit file watching
config.watchFolders = [__dirname];

// Reduce the number of files being watched
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Add blacklist to ignore certain directories
config.resolver.blacklistRE = /node_modules\/.*\/node_modules\/react-native\/.*/;

// Limit transformer workers
config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  workers: 1,
};

// Set maximum workers
config.maxWorkers = 2;

module.exports = config;