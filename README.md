# PDF Renderer

This repository will contain a standalone PDF-rendering service for the Inventory Management platform. The Node.js/Express API will use Playwright and Chromium to turn caller-supplied HTML into PDF files with configurable page settings, margins, and headers or footers.

The service will run independently of the main application and will not access or store its business data. It will provide authenticated, bounded requests, health checks, and documented API and container usage, while restricting access to external networks and local files.
