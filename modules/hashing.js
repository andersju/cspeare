const crypto = require('crypto');

module.exports = {get_hashes, }

String.prototype.truncate = function (n) {
    if (this.length > n) {
        return `${this.slice(0, n-1)}...`;
    }
    return this;
}

function cleanSample(sample) {
    return sample.trim().replace(/[^\p{L}\p{N}\p{P}\p{S} ]/gu, '').truncate(20);
}

async function get_hashes(page, options, results) {
    if (!(options.noHashes)) {
        results.hashes.script.push(...await get_script_content_hashes(page));
        results.hashes.inlineEvents.push(...await get_inline_event_handlers(page));
        results.hashes.jsNavScript.push(...await get_js_nav_target_hashes(page));
        results.hashes.style.push(...await get_style_content_hashes(page));
        results.hashes.styleAttribute.push(...await get_style_attribute_content_hashes(page));

        if (results.hashes.script.length > 0 ||
            results.hashes.jsNavScript.length > 0 ||
            results.hashes.style.length > 0 ||
            results.hashes.styleAttribute.length > 0 ||
            results.hashes.inlineEvents.length > 0) {
            results.hashesWereAdded = true;
        }
    }
}

function get_content_hash(message) {
    const hash = crypto.createHash('sha256');
    return hash.update(message).digest('base64');
}

// e.g. <script>console.log('Hello, world.');</script>
async function get_script_content_hashes(page) {
    const inlineScripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script'))
            .filter(script => !script.src)
            .map(el => el.textContent);
    });
    let hashes = [];
    for (const inlineScript of inlineScripts) {
        hashes.push({
            'url': page.url(),
            'hash': get_content_hash(inlineScript),
            'sample': cleanSample(inlineScript)
        })
    }
    return hashes;
}

// e.g. <a href="javascript:alert('Hello, world.');</a>
async function get_js_nav_target_hashes(page) {
    const jsNavTargets = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(
            'a[href^="javascript:"],' +
            'form[action^="javascript:"],' +
            'iframe[src^="javascript:"]'))
            .map(el => {
                let navTarget = {'elementName': el.localName};
                if (el.localName === 'a') {
                    navTarget.code = el.href;
                    navTarget.attributeName = 'href';
                }
                if (el.localName === 'form') {
                    navTarget.code = el.action;
                    navTarget.attributeName = 'action';
                }
                if (el.localName === 'iframe') {
                    navTarget.code = el.src;
                    navTarget.attributeName = 'src';
                }
                return navTarget;
            });
    });

    let hashes = [];
    for (const navTarget of jsNavTargets) {
        hashes.push({
            'elementName': navTarget.elementName,
            'attributeName': navTarget.attributeName,
            'url': page.url(),
            'hash': get_content_hash(navTarget.code),
            'sample': cleanSample(navTarget.code)
        });
    }
    return hashes;
}

// e.g. <style>p { color: red; }</style>
async function get_style_content_hashes(page) {
    const inlineStyles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('style'))
            .map(el => el.textContent );
    });

    let hashes = [];
    for (const inlineStyle of inlineStyles) {
        hashes.push({
            'url': page.url(),
            'hash': get_content_hash(inlineStyle),
            'sample': cleanSample(inlineStyle)
        });
    }
    return hashes;
}

// e.g. <p style="color: red;">
async function get_style_attribute_content_hashes(page) {
    const inlineStyles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[style]'))
            .map(el => { return {'elementName': el.localName, 'code': el.getAttribute('style') }});
    });

    let hashes = [];
    for (const el of inlineStyles) {
        hashes.push({
            'elementName': el.elementName,
            'url': page.url(),
            'hash': get_content_hash(el.code),
            'sample': cleanSample(el.code)
        })
    }
    return hashes;
}

// e.g. <button onclick="alert('Hello world');">
async function get_inline_event_handlers(page) {
    // Let the browser extract all elements that have attributes
    const elementsWithAttributes = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*'))
            .filter(el => el.attributes.length > 0)
            .map(el => {
                const attributes = Array.from(el.attributes)
                    .map(attribute => {
                        return {
                            'localName': attribute.localName,    // e.g. 'button'
                            'textContent': attribute.textContent // inline code
                        };
                    });
                return {'name': el.localName, 'attributes': attributes};
            });

    });

    let results = [];
    for (const el of elementsWithAttributes) {
        let matchingAttributes = [];
        // An element can have multiple attributes and multiple event handlers
        for (const attribute of el['attributes']) {
            // Check if attribute is an event handler
            if (inline_event_handlers.includes(attribute.localName)) {
                matchingAttributes.push({
                    'name': attribute.localName,
                    'hash': get_content_hash(attribute.textContent),
                    'sample': cleanSample(attribute.textContent)
                });
            }
        }

        if (matchingAttributes.length > 0) {
            results.push({
                'url': page.url(),
                'elementName': el['name'],
                'attributes': matchingAttributes,
            })
        }
    }
    return results;
}

// https://html.spec.whatwg.org/#event-handlers-on-elements,-document-objects,-and-window-objects
const inline_event_handlers = [
    "onabort",
    "onafterprint",
    "onauxclick",
    "onbeforeinput",
    "onbeforematch",
    "onbeforeprint",
    "onbeforetoggle",
    "onbeforeunload",
    "onblur",
    "oncancel",
    "oncanplay",
    "oncanplaythrough",
    "onchange",
    "onclick",
    "onclose",
    "oncontextlost",
    "oncontextmenu",
    "oncontextrestored",
    "oncopy",
    "oncuechange",
    "oncut",
    "ondblclick",
    "ondrag",
    "ondragend",
    "ondragenter",
    "ondragleave",
    "ondragover",
    "ondragstart",
    "ondrop",
    "ondurationchange",
    "onemptied",
    "onended",
    "onerror",
    "onfocus",
    "onformdata",
    "onhashchange",
    "oninput",
    "oninvalid",
    "onkeydown",
    "onkeypress",
    "onkeyup",
    "onlanguagechange",
    "onload",
    "onloadeddata",
    "onloadedmetadata",
    "onloadstart",
    "onmessage",
    "onmessageerror",
    "onmousedown",
    "onmouseenter",
    "onmouseleave",
    "onmousemove",
    "onmouseout",
    "onmouseover",
    "onmouseup",
    "onoffline",
    "ononline",
    "onpageswap",
    "onpagehide",
    "onpagereveal",
    "onpageshow",
    "onpaste",
    "onpause",
    "onplay",
    "onplaying",
    "onpopstate",
    "onprogress",
    "onratechange",
    "onrejectionhandled",
    "onreset",
    "onresize",
    "onscroll",
    "onscrollend",
    "onsecuritypolicyviolation",
    "onseeked",
    "onseeking",
    "onselect",
    "onslotchange",
    "onstalled",
    "onstorage",
    "onsubmit",
    "onsuspend",
    "ontimeupdate",
    "ontoggle",
    "onunhandledrejection",
    "onunload",
    "onvolumechange",
    "onwaiting",
    "onwebkitanimationend",
    "onwebkitanimationiteration",
    "onwebkitanimationstart",
    "onwebkittransitionend",
    "onwheel",
]
