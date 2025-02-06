// Generated using webpack-cli https://github.com/webpack/webpack-cli
'use strict';

const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist')
  },
  plugins: [
    // Add your plugins here
    // Learn more about plugins from https://webpack.js.org/configuration/plugins/
  ],
  experiments: { topLevelAwait: true },
  target: 'node',
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/i,
        loader: 'ts-loader',
        exclude: ['/node_modules/']
      },
      {
        test: /\.node$/i,
        loader: 'node-loader'
      }
      // Add your rules for custom modules here
      // Learn more about loaders from https://webpack.js.org/loaders/
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '...', '.node'],
    fallback: { crypto: false }
  }
};

module.exports = () => {
  if (isProduction) {
    config.mode = 'production';
  } else {
    config.mode = 'development';
  }
  return config;
};
