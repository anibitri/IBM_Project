module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    '@babel/plugin-transform-private-methods',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-transform-runtime',
    'react-native-reanimated/plugin',
  ],
};