# i18n-walker

Generates translatio files from your JS source code files and HTML files that rely on handlebars.
This tool will create and manage your files that should be translated. It will automatically update
existing locales files and add new entries found by scanning your code and html files.
If you add new locale json file it will automatically populate it.

Designed to work for i18 node package.

## Installation

npm install -g i18n-walker

## What it Does?

1. Let say your js code look like this
```javascript
    var message = __('Translate this message %s', companyName);
    var anotherMessage = 'This is something that needs translation';
```
2. i18n-walker will scan your code find those entries and create/update locale files with proper entry.
Your JSON locale file will have 'Translate this message %s' entry

3. i18n-walker (if used with `--recommend` switch) would suggest you add translation function to anotherMessage.

4. If you change source code to include this new translation
```javascript
    var message = __('Translate this message %s', companyName);
    var anotherMessage = __('This is something that needs translation');
```
i18n-walker will update your locale files but it won't touch existing translations.
So it is safe to add new translations as your code evolves by just running i18n-walker again.

## HTML Code translations
If your html code has the following templating (handlebars) {{__ 'Translate this'}} it would be found by the tool and create translations. This is default settings.

The tool is customizable and you could change how you scan your html files by providing proper regex.

## Example Of Usage

You can try this example to get default.json locales file.

`i18n-walker --src example/test/js/*.js example/test/html/*.html \
    --out example/locales \
    --recommend=1 --clean`

Try changing this example/locales/default.json file somehow and running command again. You will see
changed entries won't be touched.

## Future
1. Add switch for html template that is used. So far you would need to provide your own regexp but ideally you should be able to set name of the most popular templating engine that you use and tool should be able to handle those.

## Version History

1.0.9
	- Fixed bug with regexp being to greedy on HTML
	- Adding some additional logging
1.0.6
	- First public version