'use strict';

const walk = require( 'estree-walker' ).walk;
const acorn = require( 'acorn' );
const htmlparser = require('htmlparser2');
const _ = require('underscore');
const glob = require('glob');
const fs = require('fs');
const path = require('path');
const jsonfile = require('jsonfile');
const async = require('async');

class I18NWalker {
    constructor() {
        this.options = {
            translatorFunctions: [
                '__',
                '__n',
                '__l',
                '__h',
                '__mf',
            ],
            htmlTranslatorRegExs: [
                /{{__ '([^'\\]*(?:\\.[^'\\]*)*)'.*?}}/igm,
            ],
            exceptionObjectNames: [
                'logger',
                'console',
                'app'
            ],
            exceptionFunctions: [
                'require',
            ]
        };

        this.addedTranslations = {};
        this.removedEntries = {};
        this.resultJson = {};
        this.currentFile = null;
    }

    findLineNumber(content, atIndex) {
        if (!content || (atIndex > content.length)) {
            return {
                lineNumber: null,
                col: null,
            };
        }

        var index = 0;
        var prevIndex = 0;
        var lineNumber = 1;

        // handle special case.
        index = content.indexOf('\n');
        if (index === -1) {
            return {
                lineNumber: 1,
                col: atIndex-1,
            };
        }

        while(index < atIndex) {
            lineNumber++;
            prevIndex = index;
            index = content.indexOf('\n', index+1);
            if (index === -1) {
                break;
            }
        }

        return {
            lineNumber: lineNumber,
            col: atIndex - prevIndex - 1
        };
    }

    isCodeException(node) {
        if (node.type === 'CallExpression') {
            if (node.callee.type === 'MemberExpression') {
                if (this.options.exceptionObjectNames.indexOf(node.callee.object.name) >= 0) {
                    return true;
                }
            } else if (node.callee.type === 'Identifier') {
                if (this.options.exceptionFunctions.indexOf(node.callee.name) >= 0) {
                    return true;
                }
            }
        }

        return false;
    }

    checkSourceCode(sourceCode) {
        var self = this;

        var exceptionNode = null;
        var ast = acorn.parse( sourceCode ); // https://github.com/marijnh/acorn
        walk( ast, {
            enter: function ( node) {
                // skip nodes if we have exceptionNode turned on.
                if (exceptionNode) {
                    return;
                }

                // check for exceptions
                if (self.isCodeException(node)) {
                    exceptionNode = node;
                    return;
                }

                if (node.type === 'CallExpression' && node.callee &&
                    self.options.translatorFunctions.indexOf(node.callee.name) >= 0) {
                        if (node.arguments[0].type === 'Literal') {
                            var entry = node.arguments[0].value;
                            self.resultJson[entry] = entry;
                        }
                }
                // spot missing translations.
                else if (node.type === 'Literal') {
                    if(node.raw[0] === '\'' &&
                        node.value &&
                        node.value.length >= 2 &&
                        !self.resultJson[node.value]) {

                        var line = self.findLineNumber(sourceCode, node.start);
                        if (self.options.recommend) {
                            console.log(self.currentFile, 'line', line.lineNumber, ': Possible missing translation on: ', node.value);
                        }
                    }
                }
            },
            leave: function ( node ) {
                // turn off exception
                if (node === exceptionNode) {
                    exceptionNode = null;
                }
            }
        });
    }

    getMatches(string, regex, index) {
        index = index || 1;
        var matches = [];
        var match;
        while ((match = regex.exec(string))) {
            matches.push(match[index]);
        }

        return matches;
    }

    /**
     * Check HTML code for missing translations and to extract translation.
     * @param  {[type]} htmlCode [description]
     * @return {[type]}          [description]
     */
    checkHtml(htmlCode) {
        var self = this;
        var inException = false;
        var missingCount = 1;

        // Export all translator tags
        var matches = [];
        self.options.htmlTranslatorRegExs.forEach((htmlRegex) => {
            matches = matches.concat(self.getMatches(htmlCode, htmlRegex));
        });

        matches.forEach((item) => {
            // in HTML \n \t and more than 2 whitespaces don't mean anything. We can remove those.
            var cleanedItem = item.replace(/\n\t/igm, ' ');
            cleanedItem = cleanedItem.replace(/\s+/igm, ' ');
            self.resultJson[cleanedItem] = cleanedItem;
        });

        // remove all existing translator tags.
        self.options.htmlTranslatorRegExs.forEach((htmlRegex) => {
            htmlCode = htmlCode.replace(htmlRegex, '');
        });

        var parser = new htmlparser.Parser({
            onopentag: function(name, attribs){
                if(name === 'script' && attribs.type === 'text/javascript') {
                    inException = true;
                }
            },
            ontext: function(text){
                if (inException) {
                    return;
                }

                text = text.trim();
                if (!text) {
                    return;
                }

                // remove all template marks e.g. {{ }}
                text = text.replace(/{{.*}}/g, '');
                text = text.replace(/^[\n\s]*/gm, '');

                var texts = text.split('\n');
                if (texts && texts.length > 0) {
                    texts.forEach((item) => {
                        if (item && item.indexOf('{{') === -1 && item.indexOf('}}') === -1) {
                            if (self.options.recommend) {
                                console.log(self.currentFile, missingCount++, ': Possible missing translation on:', item);
                            }
                        }
                    });
                }

            },
            onclosetag: function(tagname){
                if(tagname === 'script'){
                    inException = false;
                }
            }
        }, {decodeEntities: true});

        parser.write(htmlCode);
        parser.end();
    }

    /**
     * Check HTML code for missing translations and to extract translation.
     * @param  {[type]} htmlCode [description]
     * @return {[type]}          [description]
     */
    checkTxt(txtCode) {
        var self = this;

        // Export all translator tags
        var matches = [];
        self.options.htmlTranslatorRegExs.forEach((htmlRegex) => {
            matches = matches.concat(self.getMatches(txtCode, htmlRegex));
        });

        matches.forEach((item) => {
            self.resultJson[item] = item;
        });
    }

    /**
     * Store results in appropriate folder.
     * @return {[type]} [description]
     */
    storeResults() {
        var self = this;

        glob(path.join(this.options.out, '*.json'), (err, files) => {
            if (err) {
                console.log('error fetching output files', err);
                process.exit(1);
            }

            if (!files || files.length === 0) {
                var outFile = path.join(this.options.out, 'default.json');
                console.log('storing results to ', outFile);
                jsonfile.writeFileSync(outFile, this.resultJson, {spaces: 2});
                return;
            }

            files.forEach((file) => {
                console.log('updating language file', file);
                let translations = jsonfile.readFileSync(file);
                // update non-existing properties only from self.resultJson
                _.keys(self.resultJson).forEach((key) => {
                    if (!translations[key]) {
                        translations[key] = self.resultJson[key];
                        self.addedTranslations[key] = true;
                    }
                });

                // Remove all keys that exist in existing file but no longer in resultJson
                if (self.options.clean && _.keys(self.resultJson).length > 0)  {
                    _.keys(translations).forEach((key) => {
                        if (!self.resultJson[key]) {
                            self.removedEntries[key] = true;
                            delete translations[key];
                        }
                    });
                }

                jsonfile.writeFileSync(file, translations, {spaces: 2});
            });

            if (self.options.clean) {
                console.log('The following entries were removed from locales files\n', self.removedEntries);
            }
            console.log('The following entries were added to locales files\n', self.addedTranslations);
        });
    }

    run() {
        var self = this;

        async.eachSeries(this.options.src, (item, internalCallback) => {
            glob(item, (err, files) => {
                if (err) {
                    console.log('error fetching source files', err);
                    process.exit(1);
                }

                files.forEach((file) => {
                    if (path.extname(file) === '.html') {
                        let content = fs.readFileSync(file);
                        self.currentFile = file;
                        console.log('analyzing... ', file);
                        self.checkHtml(content.toString());
                    } else if (path.extname(file) === '.js') {
                        let content = fs.readFileSync(file);
                        self.currentFile = file;
                        console.log('analyzing... ', file);
                        self.checkSourceCode(content.toString());
                    } else if (path.extname(file) === '.txt') {
                        let content = fs.readFileSync(file);
                        self.currentFile = file;
                        console.log('analyzing... ', file);
                        self.checkTxt(content.toString());
                    }
                });

                internalCallback();
            });
        }, () => {
            self.storeResults();
        });
    }

    setOptions(options) {
        this.options = _.extend(this.options, options);
    }
}

module.exports = new I18NWalker();
module.exports.I18NWalker = I18NWalker;