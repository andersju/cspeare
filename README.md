## CSPeare
Automatic CSP generation (with recommendations) using the Playwright browser automation library.

Disclaimer: this is experimental software, intended to help developers implement Content Security Policy rules.
Generated rules should be treated as a _starting point_.

### Software used
* [Node.js](https://nodejs.org) v22.11.0 (LTS)
* [Playwright](https://playwright.dev/) 1.49.0 with Chromium 131.0.6778.33
* [CSP Evaluator Core Library](https://github.com/google/csp-evaluator) 1.1.2
* NPM utility libraries: chalk 4.1.2, debug 4.3.7, fast-shuffle 6.1.1, table 6.8.2

### Install
Tested with Node.js 22 LTS.

Install dependencies:
```
npm install
npx playwright install firefox chromium
```

### Use
```
# Test a single URL
node cspeare.js https://www.example.com

# Test multiple URLs
node cspeare.js https://www.example.com https://www.example2.com

# See options
node cspeare.js -h

# Get debug-level output
DEBUG=csp node cspeare.js https://www.example.com
```

### Author
Anders Jensen-Urstad <anders@unix.se>
