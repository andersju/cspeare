const { table, getBorderCharacters } = require('table');
const chalk = require('chalk');

module.exports = { parseAndPresentResults };

String.prototype.truncate = function (n) {
    if (this.length > n) {
        return `${this.slice(0, n-1)}...`;
    }
    return this;
}

function sortTableData(a, b) {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
}

function printCspReportSummary(reports, heading, footer) {
    if (heading) {
        console.log(chalk.bold(heading));
        console.log('-'.repeat(heading.length));
    }

    if (reports.length > 0) {
        let tableHeader = [[`${chalk.bold('Effective directive')}`, `${chalk.bold('Description')}`]];
        let data = [];
        for (const report of reports) {
            const lineNumber = report.lineNumber > 0 ? ` line ${report.lineNumber}` : '';
            if (report.effectiveDirective === 'script-src-elem'){
                if (report.blockedURI === 'inline') {
                    data.push([report.effectiveDirective, `Execution of inline script on ${report.documentURI}${lineNumber}`]);
                } else {
                    data.push([report.effectiveDirective, `Execution of script ${report.blockedURI} on ${report.documentURI}${lineNumber}`]);
                }
            } else if (report.effectiveDirective === 'script-src-attr') {
                data.push([report.effectiveDirective, `Execution of inline script in event handler on ${report.documentURI}${lineNumber}`]);
            } else if (report.effectiveDirective === 'style-src-elem') {
                data.push([report.effectiveDirective, `${report.documentURI}${lineNumber}`]);
            } else if (report.effectiveDirective === 'style-src-attr') {
                data.push([report.effectiveDirective, `Style in attribute on ${report.documentURI}${lineNumber}`]);
            } else if (['connect-src', 'font-src', 'img-src', 'manifest-src', 'media-src', 'object-src'].includes(report.effectiveDirective)) {
                data.push([report.effectiveDirective, `Resource ${report.blockedURI} on ${report.documentURI}${lineNumber}`]);
            } else {
                data.push([report.effectiveDirective, `${report.blockedURI} on ${report.documentURI}${lineNumber}`]);
            }
        }

        const tableConfig = {
            border: getBorderCharacters('void'),
            columnDefault: {
                paddingLeft: 0,
                paddingRight: 3
            },
            columns: {
                1: { width: 80 }
            },
            drawHorizontalLine: () => false,
        };
        data.sort(sortTableData);
        console.log(table([...tableHeader, ...data], tableConfig));
    } else {
        console.log('No violations were reported.')
    }
    if (footer) {
        console.log(`${footer}\n`);
    }
}

function cspEvalSummary(findings) {
    let findingsTypes = new Set();
    if (findings.length === 0) {
        console.log(`${chalk.bold('Google CSP Evaluator evaluation of generated CSP')}`);
        console.log('-------------------------------------------------');
        console.log(`Google's CSP evaluator library found no problems in the generated CSP.`);
        return findingsTypes;
    }

    const sortedFindings = findings.slice().sort((a, b) => {
        // CSP Evaluator finding severities: HIGH = 10, MEDIUM = 30, etc.,
        if (a.severity < b.severity) return -1;
        if (a.severity > b.severity) return 1;
        if (a.typeName < b.typeName) return -1;
        if (a.typeName > b.typeName) return 1;
        return 0;
    });

    let data = [[chalk.bold('Type'), chalk.bold('Severity'), chalk.bold('Directive'), chalk.bold('Value')]];
    for (const [index, finding] of sortedFindings.entries()) {
        let severityName = finding.severityName;
        if (severityName === 'MEDIUM') {
            severityName = chalk.yellow(severityName);
        } else if (severityName === 'MEDIUM_MAYBE') {
            severityName = chalk.yellow('MEDIUM?');
        } else if (severityName === 'HIGH') {
            severityName = chalk.red(severityName);
        } else if (severityName === 'HIGH?') {
            severityName = chalk.red(severityName);
        }
        data.push([finding.typeName, severityName, finding.directive, finding.value]);
        // Ugly...
        const possiblyNewline = index === findings.length - 1 ? '' : '\n';
        data.push([`${finding.description}${possiblyNewline}`, '', '', '']);
        findingsTypes.add(finding.typeName);
    }
    // The 'description' row needs a colspan of 4, so generate the necessary table config.
    const cellSpanConfig = data.reduce((acc, row, index) => {
        if ((index - 1) % 2 === 1) {
            acc.push({col: 0, row: index, colSpan: 4});
        }
        return acc;
    }, []);

    const tableConfig = {
        border: getBorderCharacters('void'),
        columnDefault: {
            paddingLeft: 0,
            paddingRight: 3
        },
        columns: {
            3: { width: 40 }
        },
        drawHorizontalLine: () => false,
        spanningCells: cellSpanConfig
    };
    console.log(`${chalk.red('!!')} ${chalk.bold('Google CSP Evaluator evaluation of generated CSP')}`);
    console.log('---------------------------------------------------');
    console.log(table(data, tableConfig));

    return findingsTypes;
}

function inlineSummary(hashes) {
    let inlineResults = {
        inlineScript: false,
        inlineEvent: false,
        jsNavScript: false,
        inlineStyle: false,
        inlineStyleAttribute: false,
    };
    let tableHeader = [[chalk.bold('Type'), chalk.bold('Code sample'), chalk.bold('URL')]];
    let data = [];
    let jsTotals = [];

    if (hashes.script.length > 0) {
        jsTotals.push(`${chalk.bold(hashes.script.length)} inline <script>`);
        for (const el of hashes.script) {
            data.push(['Inline <script>', el.sample, el.url])
        }
        inlineResults.inlineScript = true;
    }

    if (hashes.inlineEvents.length > 0) {
        jsTotals.push(`${chalk.bold(hashes.inlineEvents.length)} element(s) with inline event handlers`);
        for (const el of hashes.inlineEvents) {
            for (const attr of el.attributes) {
                data.push([`Inline event handler`, `${el.elementName} ${attr.name}: ${attr.sample}`, el.url]);
            }
        }
        inlineResults.inlineEvent = true;
    }

    if (hashes.jsNavScript.length > 0) {
        jsTotals.push(`${chalk.bold(hashes.jsNavScript.length)} element(s) with a javascript: navigation target`);
        for (const el of hashes.jsNavScript) {
            data.push(['javascript: navigation target', `${el.elementName} ${el.attributeName}: ${el.sample}`, el.url]);
        }
        inlineResults.jsNavScript = true;
    }

    if (jsTotals.length > 0) {
        const jsTotalsStr = jsTotals.join(', ');
        console.log(`${chalk.red('!!')} ${chalk.bold('Inline JavaScript detected')}`);
        console.log('-----------------------------');
        const tableConfig = {
            border: getBorderCharacters('void'),
            columnDefault: {
                paddingLeft: 0,
                paddingRight: 3
            },
            drawHorizontalLine: () => false,
        };
        data.sort(sortTableData);
        console.log(table([...tableHeader, ...data], tableConfig));
        console.log(`${jsTotalsStr}\n`);
    }

    let styleTableHeader = [[chalk.bold('Type'), chalk.bold('Style sample'), chalk.bold('URL')]];
    let styleData = [];
    let styleTotals = [];
    if (hashes.style.length > 0) {
        styleTotals.push(`${chalk.bold(hashes.style.length)} inline <style>`);
        for (const el of hashes.style) {
            styleData.push(['Inline <style>', el.sample, el.url]);
        }
        inlineResults.inlineStyle = true;
    }

    if (hashes.styleAttribute.length > 0) {
        styleTotals.push(`${chalk.bold(hashes.style.length)} inline style in element attribute`);
        for (const el of hashes.styleAttribute) {
            styleData.push([`Style in ${el.elementName} element`, el.sample, el.url]);
        }
        inlineResults.inlineStyleAttribute = true;
    }

    if (styleTotals.length > 0) {
        const styleTotalsStr = styleTotals.join(', ');
        console.log(`${chalk.red('!!')} ${chalk.bold('Inline styles detected')}`);
        console.log('-------------------------');
        const tableConfig = {
            border: getBorderCharacters('void'),
            columnDefault: {
                paddingLeft: 0,
                paddingRight: 3
            },
            drawHorizontalLine: () => false,
        };
        styleData.sort(sortTableData);
        console.log(table([...styleTableHeader, ...styleData], tableConfig));
        console.log(`${styleTotalsStr}\n`);
    }

    return inlineResults;
}

function printRecommendations(results, inlineResults, findingsTypes) {
    let recommendations = [];
    if (findingsTypes.has('SCRIPT_UNSAFE_INLINE')) {
        recommendations.push(
`The generated CSP allows inline scripts, defeating much of the purpose of CSP.
  This is because the CSP could not be made stronger without breaking functionality.
  See the recommendation(s) below, with details above, for how to remedy the situation.\n`);
    }

    if (inlineResults.inlineScript || findingsTypes.has('SCRIPT_UNSAFE_INLINE')) {
        recommendations.push(`Move inline scripts to separate files. See:
  - https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html#refactoring-inline-code\n`);
    }

    if (inlineResults.inlineEvent || findingsTypes.has('SCRIPT_UNSAFE_HASHES')) {
        recommendations.push(`Replace inline event handlers with addEventListener calls. See:
  - https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html#refactoring-inline-code\n`);
    }

    if (findingsTypes.has('SCRIPT_UNSAFE_EVAL')) {
recommendations.push(`Do not use eval() in JavaScript. See:
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_direct_eval!`)
    }

    if (inlineResults.jsNavScript) {
        recommendations.push(`Replace javascript: navigation targets with non-inlined code. See:
  - https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html#refactoring-inline-code\n`);
    }

    if (inlineResults.inlineStyle || inlineResults.inlineStyleAttribute || findingsTypes.has('STYLE_UNSAFE_INLINE')) {
        recommendations.push(`Move inline styles to files.\n`);
    }

    if (findingsTypes.has('SCRIPT_ALLOWLIST_BYPASS')) {
        recommendations.push(`Consider switching to a strict CSP using 'strict-dynamic' with nonces or hashes instead of specifying
  allowed hosts. This likely requires changes to your application code or configuration. See:
  - https://web.dev/articles/strict-csp
  - https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html#strict-csp\n`);
    }

    let unsafeHashesDirectives = [];
    if (results.csp['script-src'].has("'unsafe-hashes'")) {
        unsafeHashesDirectives.push('script-src');
    }
    if (results.csp['style-src'].has("'unsafe-hashes'")) {
        unsafeHashesDirectives.push('style-src');
    }

    if (unsafeHashesDirectives.length > 0) {
        const unsafeHashesStr = unsafeHashesDirectives.join(' and ');
        recommendations.push(`${chalk.bold('Note')}: 'unsafe-hashes' is used in ${unsafeHashesStr}.\n  If you need backwards compatibility with older browsers, add 'unsafe-inline' to ${unsafeHashesStr}.\n  Modern browsers will ignore 'unsafe-inline' if a hash or nonce is present.\n`);
    }

    if (findingsTypes.has('OBJECT_ALLOWLIST_BYPASS')) {
        recommendations.push(`Using <object> is not recommended. Consider replacing it with an iframe or a
  more specific element (such as <audio> or <video>), depending on the content. See:
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/object-src\n`);
    }

    if (recommendations.length > 0) {
        console.log(chalk.bold('Recommendations'));
        console.log('---------------');
    }

    console.log(recommendations.map(str => `* ${str}`).join("\n"));
}

function parseAndPresentResults(results) {
    if (results.linksVisited.length > 0) {
        console.log(chalk.bold('Pages visited:'));
        console.log(results.linksVisited.map(str => `* ${str}`).join("\n"));
        console.log('');
    }

    printCspReportSummary(results.initialReports,'Violation reports collected with initial CSP', `CSP used: ${results.initialCspStringPretty}`);

    if (results.reports.length > 0) {
        console.log(`The generated CSP (see below) doesn't cause violations, but is unsafe. From the violations above,\nthe following could not be eliminated without the use of unsafe CSP:\n`)
        printCspReportSummary(results.reports,'', '');
    } else {
        console.log(`The generated CSP (see below) doesn't cause violations.\n`)
    }

    let inlineResults = [];
    inlineResults = inlineSummary(results.hashes);

    const findingsTypes = cspEvalSummary(results.findings);
    printRecommendations(results, inlineResults, findingsTypes);

    console.log(`${chalk.bold('Deployment')}`);
    console.log('----------');
    console.log(`1) In your web server, set the ${chalk.bold('Content-Security-Policy-Report-Only')} header to the CSP above.`);
    console.log(`2) Next, keep it that way for some weeks. Look for CSP warnings in the browser console,\n   or configure a CSP reporting endpoint.`);
    console.log('3) Possibly adjust CSP based on violation reports.');
    console.log(`4) Finally, change the header to ${chalk.bold('Content-Security-Policy')} to begin enforcement.\n`);

    console.log(`${chalk.bold('Generated CSP')}`);
    console.log('-------------');
    console.log(`${results.cspStringPretty}`);
}
