const {CspParser} = require("csp_evaluator/dist/parser");
const {CspEvaluator} = require("csp_evaluator");
const {Type, Severity} = require("csp_evaluator/dist/finding");
const chalk = require('chalk');
module.exports = { updatePolicy, generatePolicyString, evaluateCsp, sameOrigin }

function updatePolicy(csp, results) {
    let hashAdded = false;

    // Whenever we add a hash we also make sure 'unsafe-inline' is added.
    // This provides backwards compatibility with older browsers that
    // don't support 'unsafe-hashes'. In modern browsers, the presence
    // of a hash will make the browser ignore 'unsafe-inline'.
    for (const el of results.hashes.script) {
        csp['script-src'].add(`'sha256-${el.hash}'`);
        hashAdded = true;
    }

    if (results.hashes.jsNavScript.length > 0) {
        csp['script-src'].add("'unsafe-hashes'");
        hashAdded = true;
        for (const el of results.hashes.jsNavScript) {
            csp['script-src'].add(`'sha256-${el.hash}'`);
        }
    }

    if (results.hashes.inlineEvents.length > 0) {
        csp['script-src'].add("'unsafe-hashes'");
        hashAdded = true;
        for (const el of results.hashes.inlineEvents) {
            for (const attr of el.attributes) {
                csp['script-src'].add(`'sha256-${attr.hash}'`);
            }
        }
    }

    for (const el of results.hashes.style) {
        csp['style-src'].add(`'sha256-${el.hash}'`);
        hashAdded = true;
    }

    if (results.hashes.styleAttribute.length > 0) {
        csp['style-src'].add("'unsafe-hashes'");
        hashAdded = true;
        for (const el of results.hashes.styleAttribute) {
            csp['style-src'].add(`'sha256-${el.hash}'`);
        }
    }

    for (const report of results.reports) {
        let effectiveDirective = report['effectiveDirective'];

        // The more granular <script|style>-src-<elem|attr> are new in CSP3 but generally script-src
        // and style-src are still preferred as stated in https://www.w3.org/TR/CSP3/#directive-script-src
        if (['script-src-attr', 'script-src-elem'].includes(effectiveDirective)) {
            effectiveDirective = 'script-src';
        }
        if (['style-src-attr', 'style-src-elem'].includes(effectiveDirective)) {
            effectiveDirective = 'style-src';
        }

        let blockedUri = report['blockedURI'];

        // If we added hashes for inlined code in this round, skip reports about use of inline
        if (blockedUri === 'inline' && hashAdded) {
            continue;
        }

        let valueToAdd;
        if (blockedUri.startsWith('http')) {
            if (sameOrigin(blockedUri, results.documentURI)) {
                valueToAdd = "'self'";
            } else {
                const url = new URL(blockedUri);
                valueToAdd = url.host
            }
        } else if (blockedUri === 'inline') {
            valueToAdd = "'unsafe-inline'";
        } else if (blockedUri === 'eval') {
            valueToAdd = "'unsafe-eval'";
        } else if (blockedUri === 'data') {
            valueToAdd = 'data:';
        } else if (blockedUri === 'blob') {
            valueToAdd = 'blob:';
        } else {
            valueToAdd = blockedUri;
        }

        if (effectiveDirective === 'frame-src' && valueToAdd === "'self'") {
            if (!('frame-ancestors') in csp) {
                csp['frame-ancestors'] = new Set();
            }
            csp['frame-ancestors'] .delete("'none'");
            csp['frame-ancestors'].add("'self'");
        }

        if (!(effectiveDirective in csp)) {
            csp[effectiveDirective] = new Set()
        }

        // If we have default-src 'self' and then add a specific directive, like
        // script-src foo.com, this completely overrides the fallback default-src
        // setting, meaning *only* foo.com (and not 'self') is allowed. So here we
        // ensure that 'self' is always allowed along with other sources, *if*
        // default-src 'self' is set.
        if (csp['default-src'].has("'self'")) {
            csp[effectiveDirective].add("'self'");
        }

        if (csp[effectiveDirective].has("'none'")) {
            csp[effectiveDirective].delete("'none'");
        }
        csp[effectiveDirective].add(valueToAdd);
    }

    return csp;
}

function generatePolicyString(csp, prettify=false) {
    let cspList = [];
    for (const [name, value] of Object.entries(csp)) {
        if (value.size !== 0) {
            let values = [...value].join(' ');
            if (prettify) {
                cspList.push(`${chalk.bold(name)} ${values}`);
            } else {
                cspList.push(`${name} ${values}`);
            }
        }
    }
    return [...cspList].join('; ');
}

function evaluateCsp(csp) {
    const cspString = generatePolicyString(csp);
    const parsedCsp = new CspParser(cspString).csp;
    let findings = new CspEvaluator(parsedCsp).evaluate();
    for (let finding of findings) {
        finding['typeName'] = Type[finding.type];
        finding['severityName'] = Severity[finding.severity];
    }
    return findings;
}

function sameOrigin(url1, url2) {
    try {
        const parsedUrl1 = new URL(url1);
        const parsedUrl2 = new URL(url2);

        return parsedUrl1.protocol === parsedUrl2.protocol && parsedUrl1.hostname === parsedUrl2.hostname && parsedUrl1.port === parsedUrl2.port;
    } catch (error) {
        console.error(`Error parsing URLs: ${error}`);
        return false;
    }
}
