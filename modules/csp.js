const { firefox, chromium, devices } = require('playwright');
const desktopfirefox = devices['Desktop Firefox'];
const desktopchromium = devices['Desktop Chrome'];
const fastShuffle = require('fast-shuffle');
const debug = require('debug')('csp');

const { get_hashes } = require('./hashing.js');
const { updatePolicy, generatePolicyString, evaluateCsp, sameOrigin } = require('./policy.js');

module.exports = { generateCsp };

async function visitSite(options, csp, headless=true) {
    // To make it easy to switch for debugging purposes
    const browserChoice = 'chromium' // 'firefox' or 'chromium'

    debug(`Visiting ${options.urls} and injecting header Content-Security-Policy-Report-Only: ${csp}`);
    let results = {
        "reports": new Set(),
        "hashes": {
            "script": [],
            "jsNavScript": [],
            "style": [],
            "styleAttribute": [],
            "inlineEvents": [],
        },
        "hashesWereAdded": false,
        "documentURI": "",
    }

    let browser;
    let browserOptions;
    if (browserChoice === 'firefox') {
        browser = await firefox.launch({
            headless: headless,
            bypassCSP: false,
        });
        browserOptions = desktopfirefox;
    } else {
        browser = await chromium.launch({
            headless: headless,
            bypassCSP: false,
        });
        browserOptions = desktopchromium;
    }

    const context = await browser.newContext({ ...browserOptions });
    const page = await context.newPage();

    // Inject code that listens for policy violations and logs them
    await page.addInitScript({ content: `
        document.addEventListener('securitypolicyviolation', (e) => {
          console.log('_csp-violation-report', JSON.stringify({
            'blockedURI': e.blockedURI,
            'columnNumber': e.columnNumber,
            'disposition': e.disposition,
            'documentURI': e.documentURI,
            'effectiveDirective': e.effectiveDirective,
            'lineNumber': e.lineNumber,
            'originalPolicy': e.originalPolicy,
            'referrer': e.referrer,
            'sample': e.sample,
            'sourceFile': e.sourceFile,
            'statusCode': e.statusCode,
            'violatedDirective': e.violatedDirective,
            'type': e.type
          }));
        });
    `});

    // Listen for logged policy violations and add them to the reports array
    page.on('console', async msg => {
        if (msg.text().startsWith('_csp-violation-report')) {
            let reportData = msg.text().split('_csp-violation-report', 2)[1];
            results.reports.add(reportData);
        }
    });

    // Intercept responses so we can inject/override CSP
    await page.route('**/*', async route => {
        const request = await route.request();
        debug("Intercepting request/response: " + request.url());
        try {
            // We only want to add CSP to the main document, nothing else.
            // Also check if we're dealing with the main frame (and not an iframe).
            // https://playwright.dev/docs/api/class-request#request-frame
            if (request.isNavigationRequest() && request.frame().parentFrame() == null) {
                debug("Request is a navigation request");
                // Get original response
                const response = await route.fetch();
                // Modify response
                // https://playwright.dev/docs/network#modify-responses
                if ('content-type' in response.headers() && response.headers()['content-type'].includes('text/html')) {
                    debug("content-type is text/html; modifying body and headers")
                    // Check for CSP in <meta> element. If multiple CSP policies are defined, e.g., in both
                    // header and <meta> (or two headers, or ..), all policies are enforced -- in practice, the most
                    // restrictive ones: https://w3c.github.io/webappsec-csp/#multiple-policies
                    // However, we currently don't handle <meta> at all, and ignore any existing CSP header.
                    let body = await response.text();
                    const metaCspRegex = /<meta\b[^>]*\bhttp-equiv=['"]content-security-policy['"][^>]*>/gi;
                    const metaCspMatch = body.match(metaCspRegex);
                    if (metaCspMatch) {
                        console.log(`Existing CSP found in meta element; removing: ${metaCspMatch[0]}`);
                        body = body.replace(metaCspRegex, '');
                    }

                    let headers = response.headers();
                    if ('content-security-policy' in headers) {
                        console.log(`Ignoring existing CSP header: ${headers['content-security-policy']}`);
                        delete headers['content-security-policy']
                    }
                    if ('content-security-policy-report-only' in headers) {
                        console.log(`Ignoring existing CSP report-only header: ${headers['content-security-policy-report-only']}`);
                        delete headers['content-security-policy.-report-only'];
                    }
                    headers['content-security-policy-report-only'] = csp;

                    await route.fulfill({ response, body: body, headers: headers, });
                } else {
                    await route.continue();
                }
            } else {
                await route.continue();
            }
        } catch {
            await route.continue();
        }
    });
    
    const firstVisit = options.linksVisited.length === 0;
    for (const url of options.urls) {
        // If there's something in the linksVisited array, it means this is not
        // the first round, so we want to visit the same set of pages as previously.
        if (!(firstVisit)) {
            for (const linkVisited of options.linksVisited) {
                debug(`Visiting link [visited in previous session] ${linkVisited}`);
                await page.goto(linkVisited);
                if (!(results.documentURI)) {
                    results.documentURI = page.url();
                }
            }
        } else {
            // Otherwise, visit the specified URL
            let response = await page.goto(url);
            if (response.status() >= 400) {
                throw new Error(`Got HTTP status ${response.status()} from ${response.url()}`);
            }
            results.documentURI = page.url();
            const initialHost = new URL(page.url()).host;
            options['linksVisited'].push(page.url());

            await page.waitForLoadState('load');
            await page.waitForLoadState('networkidle');

            await get_hashes(page, options, results);

            // If started with --numLinks n, visit up to n links found on the page
            if (options.numLinks > 0) {
                // Extract all links on the page
                debug(`--numLinks ${options.numLinks} specified; extracting links`);
                const allLinks = await page.evaluate(() => {
                    return Array
                        .from(document.links)
                        .map(element => element.href)
                });

                // Randomize the list of links
                let potentialLinks = fastShuffle.shuffle(
                    allLinks
                        .filter((link) => {
                            const url = new URL(link);
                            // Exclude links that are (very likely) to non-HTML content
                            if (/\.(jpg|png|gif|pdf|exe|zip|js|json)$/i.test(url.pathname)) {
                                return false;
                            }
                            // Include links where the host is the same as the page we're on
                            if (url.host === initialHost) {
                                return true;
                            }
                        })
                );
                debug(`${potentialLinks.length} links found`)
                debug(`Potential links: ${potentialLinks}`);
                for (const potentialLink of potentialLinks) {
                    debug(`Visiting link ${potentialLink}`);
                    const response = await page.goto(potentialLink);
                    if ('content-type' in response.headers() && response.headers()['content-type'].includes('text/html')) {
                        await get_hashes(page, options, results)
                        options['linksVisited'].push(potentialLink);
                    } else {
                        debug(`Potential link ${potentialLink} not text/html; skipping`)
                    }
                    if (options['linksVisited'].length >= options.numLinks) {
                        break;
                    }
                }
            }
        }
    }

    if (!(headless)) {
        // If running in the foreground, this lets us keep the browser open and keep
        // collecting violation reports until the user closes the browser.
        await new Promise((resolve) => {
            page.on('close', resolve);
        });
    } else {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
    }

    await context.close();
    await browser.close();

    // Turn set into array so we can use filter/map. At this point we might have
    // CSP violations from documents other than the main one we're visiting, e.g.,
    // an iframed page, so we filter out those.
    debug(results.reports);
    results.reports = Array
        .from(results.reports)
        .map(report => JSON.parse(report))
        .filter(result => {
            return sameOrigin(result['documentURI'], results.documentURI);
        });
    debug(results.reports);

    return results;
}

async function _generateCsp(options, csp, count, initialReports, initialHashes) {
    // Prevent infinite loop of website visits
    if (count > 5) {
        debug(csp);
        console.error("Error: couldn't determine valid rules within max attempts.");
        if (!(options.noHashes)) {
            console.error("Try again with --noHashes.");
        }
        process.exit(1);
    }
    debug(`CSP is currently ${JSON.stringify(csp)}`);

    let headless = true;
    if (count === 0 && options.interactive) {
        headless = false;
    }
    let results = await visitSite(options, generatePolicyString(csp), headless);
    if (count === 0) {
        initialReports = results.reports;
        initialHashes = results.hashes;
        options['initialCspString'] = generatePolicyString(csp);
        options['initialCspStringPretty'] = generatePolicyString(csp, true);
    }

    // If CSP violations were reported, try again with CSP updated based on the violations.
    // Also try again if it was 1) the first visit, and 2) there were no violations but
    // hashes of inline scripts/styles were found (scripts that only execute on user interaction
    // would not have generated a CSP violation report here).
    if (results.reports.length > 0 || (count === 0 && results.hashesWereAdded)) {
        debug("Trying again with modified CSP")
        count++;
        csp = await updatePolicy(csp, results);
        return await _generateCsp(options, csp, count, initialReports, initialHashes);
    }

    debug("No reports found; continuing");

    // At this point we have CSP that doesn't cause any violations. However:
    // The generated CSP might be unsafe. While CspEvaluator will point out which
    // directives are unsafe, we also want to link the warnings to a specific URIs and lines
    // when possible, so *if* there are warnings from CspEvaluator, re-run the browser
    // visits with the final CSP, *minus* the unsafe directives, and save the actual
    // violation reports this time.
    let findings = evaluateCsp(csp);
    let tmpCsp = structuredClone(csp);
    if (findings.length > 0) { //|| "script-src" in csp) {
        debug(`CSP rule warnings detected, or script detected; trying a final time to gather more information`)
        for (const finding of findings) {
            if (finding.severityName === 'HIGH') { //&& finding.typeName !== 'SCRIPT_ALLOWLIST_BYPASS') {
                if (tmpCsp[finding.directive].delete(finding.value)) {
                    debug(`Deleted ${finding.value} from ${tmpCsp[finding.directive]}`);
                }
            }
        }
        debug("Visiting site with modified CSP")
        results = await visitSite(options, generatePolicyString(tmpCsp), true);
    }

    return {
        'csp': csp,
        'cspString': generatePolicyString(csp),
        'cspStringPretty': generatePolicyString(csp, true),
        'findings': evaluateCsp(csp),
        'initialCspString': options.initialCspString,
        'initialCspStringPretty': options.initialCspStringPretty,
        'initialReports': initialReports,
        'reports': results.reports,
        'linksVisited': options.linksVisited,
        'hashes': initialHashes,
    };
}

async function generateCsp(options, initialCsp) {
    return await _generateCsp(options, initialCsp, 0, [], []);
}
