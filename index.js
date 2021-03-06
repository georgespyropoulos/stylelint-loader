/* global __dirname */
'use strict';

var assign = require('deep-assign'),
    chalk = require('chalk'),
    fs = require('fs'),
    loaderUtils = require('loader-utils'),
    path = require('path'),
    stylelint = require('stylelint');

var defaultOptions = {
    configFile: './.stylelint.config.js',
    displayOutput: true,
    ignoreCache: false
};

var lintedFiles = [];

/**
 * Determine if the provided file is in the cache
 * @param {string} filePath the file to check
 * @returns {bool} true if the file is in the cache
 */
function isCached(filePath) {
    return lintedFiles.findIndex((entry) => { return entry === filePath; }) !== -1;
}

/**
 * Returns the relative path
 * @param {string} filePath the path to make relative
 * @returns {string} the relative path
 */
function relativePath(filePath) {
    return filePath.indexOf(__dirname) === 0 ? filePath.replace(__dirname, '.') : filePath;
}

/**
 * Display a single error or warning
 * @param {Object} warning the warning object
 * @param {Number} warning.line the line number
 * @param {Number} warning.column the column number
 * @param {string} warning.text the error or warning message
 * @param {string} warning.severity the severity (warning or error)
 * @param {Object} options the loader options
 * @param {Object} context the Webpack context
 * @returns {void}
 */
function printWarningOrError(warning, options, context) {
    var text = `${warning.line}:${warning.column} ${warning.text}`;

    if (warning.severity === 'warning') {
        if (options.displayOutput)
            console.log(chalk.yellow(text));
        context.emitWarning(text);
    } else if (warning.severity === 'error') {
        if (options.displayOutput)
            console.log(chalk.red(text));
        context.emitError(text);
    } else if (typeof warning.severity === 'undefined') {
        if (options.displayOutput)
            console.log(chalk.red(warning.text));
        context.emitError(text);
    }
}

/**
 * Lint the provided file
 *
 * @param {string|Buffer} content the content to be linted (not used in general)
 * @param {object} options the loader options
 * @param {object} context the webpack context
 * @param {Function} callback the async callback
 * @returns {object} the result from the callback
 * @async
 */
function linter(content, options, context, callback) {
    var filePath = relativePath(context.resourcePath),
        lintOptions = {};

    // Figure out if we need to process this file
    if (!options.ignoreCache)
        if (!isCached(context.resourcePath))
            lintedFiles.push(context.resourcePath);
        else {
            return callback(null, content);
        }

    lintOptions = assign({}, options, {
        code: fs.readFileSync(context.resourcePath, { encoding: 'utf-8' }),
        syntax: path.extname(filePath).replace('.', ''),
        formatter: 'json'
    });

    // If the config file does not exist, then produce a warning
    if (lintOptions.configFile)
        try {
            fs.statSync(lintOptions.configFile, fs.R_OK);
        } catch (error) {
            if (options.displayOutput)
                console.log(chalk.yellow(`Configuration File ${lintOptions.configFile} cannot be found/read`));
            context.emitWarning(`Configuration File ${lintOptions.configFile} cannot be found/read`);
            return callback(null, content);
        }

    stylelint.lint(lintOptions)
    .then((result) => { return result.results[0]; })
    .then((result) => {
        if (options.displayOutput && result.warnings.length > 0) {
            console.log(chalk.blue.underline.bold(filePath));
            result.warnings.forEach((warning) => { printWarningOrError(warning, options, context); });
            console.log('');
        }
        return callback(null, content);
    }).catch((error) => {
        return callback(error);
    });

    // If we get here, we are complete, but synchronous, so just return something
    return null;
}

/**
 * Webpack Loader Definition
 *
 * @param {string|buffer} content = the content to be linted
 * @returns {object} the result of the callback
 */
module.exports = function (content) {
    var callback = this.async();
    var packOptions = this.options.stylelint || {};
    var loaderOptions = loaderUtils.parseQuery(this.query);
    var options = assign({}, defaultOptions, packOptions, loaderOptions);

    if (this.cacheable) this.cacheable();

    try {
        return linter(content, options, this, callback);
    } catch (error) {
        console.error('[stylelint-loader] error = ', error.stack);
        return callback(error);
    }
};
