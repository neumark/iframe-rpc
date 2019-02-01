var webpackConfig = require('../webpack.config.js');
var webpack = require('webpack');
webpackConfig.plugins = [];

module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    port: 9876,
    colors: true,
    singleRun: true,
    reporters: ['mocha'],
    files: [
      `${webpackConfig.output.path}/${webpackConfig.output.filename}`,
      '*.spec.js',
    ],
    webpack: { ...webpackConfig, optimization: undefined },
    webpack: webpackConfig,
    browsers: ['Chrome'],
    customLaunchers: {
      'Chrome_Desktop' : {
        base: 'Chrome',
        options: {
          viewportSize: {
            width: 1000,
            height: 1000,
          },
        },
      },
    },
  });
};