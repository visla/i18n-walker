# i18n-walker

Generates translatio files from your JS source code files and HTML files that rely on handlebars.
This tool will create and manage your files that should be translated. It will automatically update
existing locales files and add new entries found by scanning your code and html files.
If you add new locale json file it will automatically populate it.

Designed to work for i18 node package.

## Installation

npm install -g i18n-walker

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
