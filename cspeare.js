#!/usr/bin/env node
const { parseArgs } = require('node:util');
const { generateCsp, sameOrigin } = require('./modules/csp.js');
const { parseAndPresentResults } = require('./modules/results.js');
const { CspParser } = require('csp_evaluator/dist/parser.js');
const path = require('path');
const scriptName = path.basename(__filename);

const options = {
    help: {
        type: 'boolean',
        short: 'h',
    },
    numLinks: {
        type: 'string',
        short: 'n',
        default: '0',
    },
    noHashes: {
        type: 'boolean',
        default: false,
    },
    additionalCsp: {
        type: 'string',
        short: 'a',
    },
    interactive: {
        type: 'boolean',
        short: 'i'
    }
};

function displayHelp() {
    console.log(`usage:
    ${scriptName} [--noHashes] <url ...>
    
    ${scriptName} [--noHashes] <--interactive|--numLinks <integer>> <url>
    
Examples:
    ${scriptName} https://www.example.com/
    
    ${scriptName} --interactive https://www.example.com/
    
    ${scriptName} --numLinks 5 https://www.example.com/
    `);
}

(async () => {
    const { values, positionals, } = parseArgs({ options, allowPositionals: true });

    if (values.help) {
        displayHelp();
        process.exit(1);
    }

    if (positionals.length === 0) {
        console.error('No URL(s) specified.');
        displayHelp();
        process.exit(1);
    }

    if (isNaN(values.numLinks)) {
        console.error('Specified numLinks is not a number.');
        displayHelp();
        process.exit(1);
    }

    if (positionals.length > 1 && values.numLinks > 0) {
        console.error('--numLinks cannot be used if multiple URLs are specified.');
        displayHelp();
        process.exit(1);
    }

    if (values.interactive && values.numLinks > 0) {
        console.error('--interactive cannot be used if multiple URLs are specified.');
        displayHelp();
        process.exit(1);
    }

    // If multiple URLs have been specified, ensure they all share the same origin
    if (positionals.length > 1) {
        const firstUrl = positionals[0];
        for (let i = 1; i < positionals.length; i++) {
            if (!sameOrigin(firstUrl, positionals[i])) {
                console.error('Error: all URLs must have the same origin ("be on the same site").');
                process.exit(1);
            }
        }
    }

    let initialCsp = {
        'default-src': new Set(["'none'"]),
        'form-action': new Set(["'none'"]),
        'frame-ancestors': new Set(["'none'"]),
        'base-uri': new Set(["'none'"]),
        // script-src, style-src, etc. use default-src as a fallback value
        'script-src': new Set(),
        'style-src': new Set(),
        'connect-src': new Set(),
        'frame-src': new Set(),
        'img-src': new Set(),
    }

    // If user has specified additional CSP, parse it and add it to initialCsp
    if (values.additionalCsp) {
        const parsedCsp = new CspParser(values.additionalCsp).csp;
        for (const [key, value] of Object.entries(parsedCsp.directives)) {
            if (!(key in initialCsp)) {
                initialCsp[key] = new Set();
            }
            for (const source of value) {
                initialCsp[key].add(source);
            }
        }
    }

    let results;
    let generateCspOptions = {
        'urls': positionals,
        'numLinks': parseInt(values.numLinks),
        'noHashes': values.noHashes,
        'interactive': values.interactive,
        'linksVisited': [],
    }

    try {
        results = await generateCsp(generateCspOptions, initialCsp);
    } catch (err) {
        console.error(err.stack);
        process.exit(1);
    }

    parseAndPresentResults(results);
})();
