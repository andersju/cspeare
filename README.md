## CSPeare
Automatic CSP generation (with recommendations) using the Playwright browser automation library.

Disclaimer: this is experimental software, intended to help developers implement Content Security Policy rules.
Generated rules should be treated as a _starting point_.

### Software used
* [Node.js](https://nodejs.org) v22.11.0 (LTS)
* [Playwright](https://playwright.dev/) 1.50.1 with Chromium 133.0.6943.16
* [CSP Evaluator Core Library](https://github.com/google/csp-evaluator) 1.1.2
* NPM utility libraries: chalk 4.1.2, debug 4.3.7, fast-shuffle 6.1.1, table 6.8.2

### Install
Install dependencies:
```bash
# Assumes Node.js 22 is installed
npm install
npx playwright install
```

Tested with Node.js 22 LTS in Debian 12 Bookworm and macOS 15.1.1. 

### Use
```bash
# Test a single URL
node cspeare.js https://www.example.com

# Test multiple URLs (on the same site)
node cspeare.js https://www.example.com https://www.example.com/something

# See options
node cspeare.js -h

# Get debug-level output
DEBUG=csp node cspeare.js https://www.example.com
```

### Author
Anders Jensen-Urstad <anders@unix.se>
