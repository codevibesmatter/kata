# My App

React app using TanStack Router with file-based routing.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Production build
```

## Browser Testing

`agent-browser` is available globally for browser automation:

```bash
npm run dev &                                   # Start dev server in background
agent-browser open http://localhost:3000        # Open in headless browser
agent-browser wait --load networkidle           # Wait for page to load
agent-browser snapshot -i                       # Get interactive elements with refs
agent-browser screenshot                        # Take screenshot
agent-browser close                             # Close browser
```

Dev server: http://localhost:3000
Tests: `npm test` (vitest unit tests)

## Workflow Management

kata is installed globally. Use `kata` commands directly:

```bash
kata setup           # Set up kata for this project
kata enter onboard   # Guided onboarding
kata status          # Check current mode
```
