# PLOT Studio

PLOT Studio is a self-hosted visual development environment for websites and web applications. Build pages on a canvas, connect logic nodes, define data tables and backend workflows, run Python, create image assets, and publish a project from the same application.

This repository contains the source of the deployed PLOT Studio release `alias-names-20261118T214936Z`, together with its public handbook, template projects, source assets, certificate renderer and 76 development checks. Original software is available under the MIT license.

## Features

- Visual page editing with responsive styles, draggable elements, component variants, templates and device previews.
- Node-based browser logic, backend routes, database operations, integrations, project packages, Python scripts and request tests.
- Paint with brush presets, selections, shape tools, background removal and a separate image reference for tracing.
- Image assets, public publishing, project history and encrypted `.plot` import and export.
- Per-workspace accounts, licence administration and a server-side project secret vault.
- Practical certification assessments, session tracking, PDF certificates and public credential verification.
- Optional distributed startup with short-lived session grants, ten AES-256-GCM encrypted content fragments and signed startup manifests.

## Local setup

Use Node.js 22 or newer and Python 3.10 or newer. The gateway listens on loopback. These commands run from the repository root.

```sh
npm ci
npm run deps
python -m pip install -r requirements.txt
npm run init
npm start
```

The initializer prints a generated operator password once and creates an ignored `.env` file with separate encryption keys. Open `http://localhost:14990/admin/sign-in` and sign in with that password. On systems where the interpreter is named `python3`, use `python3` in the installation command. Set the interpreter variables in `.env` if using a virtual environment.

For the pinned optional workflow actions, install `outputs/plot-studio/workflow-package-requirements.txt` into the backend Python environment. Additional Python packages and their pins are listed in `outputs/plot-studio/python-packages-linux310.txt`.

The application directory contains the detailed [operator and Studio guide](outputs/plot-studio/README.md). Its public handbook is served at `/docs`, with the node reference at `/docs/nodes` and the design handbook at `/docs/design`.

## Build and test

```sh
npm run build
npm test
npx playwright install chromium
npm run test:paint
npm run test:startup
```

Browser checks use the package-managed Chromium installation. `PLOT_BROWSER_PATH` can select an existing Chromium executable. The startup integration test also needs the Python `cryptography` package and uses temporary HTTPS certificates and local hostname routing.

The production bundle lives in `outputs/plot-studio/studio-build/editor.mjs`. Rebuild it after editing the browser modules. Individual development checks are in `work/`; some historical checks target earlier UI versions or explicitly access the live service and are outside the default test commands.

## Deployment

The default local setup uses one origin. For HTTPS deployment, run the gateway behind a reverse proxy, configure your own `PUBLIC_ORIGIN` and keep the state directory and encryption keys in durable, protected storage.

The optional distributed startup currently names the original `plotstudio.pro` aliases and content hosts. Adapt `studio-rotation.mjs`, `studio-content-hosts.mjs` and `studio-alias.mjs` for your domain before enabling `PLOT_STUDIO_ALIAS_ROTATION=1` and `PLOT_STUDIO_DISTRIBUTED_BOOT=1`. Nginx and systemd examples from the original deployment are in `ops/`; their hostnames, paths and service names need to match your installation.

Distributed startup encrypts delivery per launch and verifies the assembled code. The browser ultimately executes the decrypted JavaScript. All content hosts may share a server, as in the original installation.

## Certificates and service pages

The certificate renderer, sample records and licensed fonts are included. Provide your own signature file through `PLOT_CERTIFICATE_SIGNATURE` when issuing certificates. The original issuer's handwritten signature is excluded.

The bundled marketing pages preserve the original service's branding, payment links, contact details and terms. Update these before operating your own public service. Source publication also makes the assessment tasks and grading implementation visible.

## Repository contents

| Path | Contents |
| --- | --- |
| `outputs/plot-studio/` | Application, backend, public pages and static assets |
| `outputs/plot-studio/certificate/` | Certificate renderer, sample records and fonts |
| `work/` | Development and regression checks |
| `ops/` | Original reverse proxy, deployment and verification examples |
| `scripts/` | Local configuration and test entry points |
| `SOURCE_PROVENANCE.json` | Production release and publication adjustments |

## License

See [LICENSE](LICENSE) for the MIT license. Bundled fonts retain the SIL Open Font License notices in `outputs/plot-studio/certificate/`. Names, logos and certificate marks identify the original project and issuer; they do not imply endorsement of another installation.
