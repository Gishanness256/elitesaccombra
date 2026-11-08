# Elite SACCO Mbarara

A browser-based SACCO management interface for **Elite SACCO Mbarara**, formerly Obwesigwa Financial Services. The app’s interface covers member savings, loans, accounts, portfolio reporting, and regulatory returns.

> **Project status:** The repository currently contains a single-page `index.html` and a proposed project layout in `structure.txt`. The modular frontend and Express backend described below are an intended architecture, not a claim that those components are already implemented.

## Features represented in the interface

- Login and account-registration screens
- Member records and member-account statements
- Savings deposits and withdrawals
- Loan requests, approvals, repayments, and loan-history views
- Portfolio ledger and liquidity reporting
- Financial and regulatory reports, with export and print options
- Role-based menu and permission concepts
- System activity audit log

## Getting started

The current entry point is the root `index.html`. You can preview the page in a browser or serve the repository with a local static-file server.

The repository does not currently document a package manager, a backend startup command, or database setup. Those instructions should be added when the corresponding server and configuration files are implemented.

## Project structure

`structure.txt` describes the intended modular layout:

- **`public/`** — browser-facing app shell, HTML views, stylesheets, scripts, images, and optional vendor libraries.
- **`public/views/`** — public pages and dashboard view fragments.
- **`public/css/`** — design tokens, base styles, public-page styles, dashboard styles, reports, and responsive rules.
- **`public/js/`** — application startup, routing, API client and authentication, UI components, pages, and feature modules.
- **`server/`** — planned Express application, routes, controllers, business services, repositories, middleware, and validators.
- **`database/`** — planned SQL migrations, development seed data, and database documentation.
- **`tests/`** — planned unit tests, integration tests, and fixtures.

The current `index.html` keeps much of the interface styling and application code together. The structure above provides a direction for splitting those responsibilities into separate files.

## Suggested development direction

1. Extract the page sections into files under `public/views/`.
2. Move shared styles into `public/css/` and feature behavior into `public/js/`.
3. Implement and document the server API, authentication, and database before relying on backend features.
4. Add automated tests for financial calculations, permissions, and API behavior.

## Security note

This application concerns financial and personal information. Treat the current interface as a prototype until production-grade authentication, server-side authorization, input validation, secure data storage, HTTPS, backups, and audit controls have been implemented and reviewed. Do not use real member data or production credentials in development or demo environments.

## License

No license is specified yet. Add a `LICENSE` file before redistributing or reusing this project.