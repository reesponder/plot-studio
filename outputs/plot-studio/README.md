# PLOT Studio

PLOT Studio is the self-hosted visual website builder behind [plotstudio.pro](https://plotstudio.pro/). The editor and graph compiler run on Node.js. The server project store uses Python and `cryptography`. Certificate PDFs use a separate ReportLab environment.

The public [Studio handbook](https://plotstudio.pro/docs) covers browser workflows and no-code recipes. The [node reference](https://plotstudio.pro/docs/nodes) is generated from the same catalog as the editor.

## Licensed workspaces

After confirming a Studio payment in Stripe, sign in as the operator at `/admin/sign-in`, open `/studio/licences`, and issue a key for the checkout email. Copy the key when it appears and send it to that customer with a link to `/register`. The customer activates once and then signs in at `/sign-in` with the same email and key. Replacing a key preserves that workspace and invalidates old sessions. Revoking it blocks Studio sign-in; previously public sites remain available at their existing URLs.

Keep `workspace-accounts.bin` and `customer-workspaces/` in the same encrypted state backups as existing Studio data. Preserve both encryption keys. The operator’s projects and public URLs remain in their existing locations. Licensed workspaces do not inherit operator connections, native commands, server tasks or environment secrets. Uploaded image URLs can be opened by anyone who has the link.

## Certification

[PLOT Studio certification](https://plotstudio.pro/certification) has two practical assessments. Builder checks responsive pages, navigation, and the Blueprint path that handles a contact form. Workflow Architect adds a private database, a validated intake endpoint, an authenticated lookup, an inbound signed event, and browser success and error paths. Each enrolment allows three graded submissions. The server tests Architect submissions against disposable SQLite data and synthetic credentials without configured services or outbound requests.

The server issues a PDF after a passing candidate chooses to publish their certificate. The public validator accepts the exact certificate ID and returns the credential record without exposing the candidate's payment details or submitted project.

Configure one-time USD Stripe prices in `PLOT_EXAM_BUILDER_PRICE_ID` (8000 cents) and `PLOT_EXAM_ARCHITECT_PRICE_ID` (15000 cents). The enrolment form remains closed until its price, Stripe keys, and `PLOT_EXAM_STRIPE_WEBHOOK_SECRET` are present. On the Stripe account, configure `/certification/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `charge.refunded`. Checkout confirms payment through signed events. Full refunds invalidate enrolment and an issued credential.

For certificate downloads, install ReportLab 4.4.9 with Pillow into a Python environment and set `PLOT_CERTIFICATE_PYTHON` to its interpreter path. The certificate fonts and their licences are in `certificate/`. The assessment database is `certification.sqlite3` inside `PLOT_STATE_DIR` and belongs in the service's normal state backups.

## Build a site

1. In **Design**, add elements from the library or start a page from a template. Double-click text to edit it. Use **Layers** to reorder elements and Shift-drag into containers. Device buttons expose separate desktop, tablet, and phone styles. Image fields and galleries accept direct HTTP or HTTPS image URLs.
2. In **Logic**, right-drag to pan in any direction, scroll to zoom, and right-click to open graph actions. Execution wires determine when an action runs. Value wires pass data between nodes. Use **JavaScript** for custom browser code, or add page-wide CSS and JavaScript under **Code**.
3. In **Data**, create tables, set field types, and add or import records. Use the API panel to choose which operations an exported website can make public. Operations are off by default. The **form + database demo** shows a complete flow.
4. Open **Preview** to run the site. The console shows graph messages and data calls. Public API permissions apply to the test database by default. Enable **Allow fetch and sockets** in the console when you want to test connections to an external API. Use **Keep test records** to copy preview changes into the draft.
5. Use **Download .plot project** to create an editable copy encrypted by your Studio instance. **Import project** opens protected files from the same instance and earlier JSON-based `.plot` files. It asks before replacing the active draft. [Project files in the Studio handbook](https://plotstudio.pro/docs#plot-project-files)

New protected exports (`PLOTSEC2`) use AES-256-GCM with a fresh per-file key derived using HKDF-SHA256, a 96-bit random nonce and a 128-bit authentication tag. The server keeps the master key and the operator workspace still reads legacy `PLOTSEC1` files made with that key. Licensed workspace exports use a separate key per workspace. Public Studio templates use a separate template key and open in every workspace. Keep the master key in a separate protected backup if older exports must remain recoverable. Export files do not contain the saved values from the project secret vault. Earlier JSON exports are unencrypted.

Choose **Export** to download a site ZIP for deployment. Standard sites export HTML, CSS, JavaScript, and local assets. Sites with tables or Backend workflows include the Python runtime. For a handoff, share `harbour-site.plot` with a colleague who needs to edit the project and `harbour-site.zip` with whoever will deploy the site.

The active draft saves in the browser. Use **Project → Server projects** to save it to the VPS, with an optional revision note. **History** shows up to 30 recent server saves, subject to storage limits. Download an earlier revision as a `.plot` file or restore it as a new server revision. Open that revision explicitly in the editor when ready. Concurrent saves and restores use revision checks. Record data in ZIP exports is opt-in.

Use **Paint** to draw and edit raster images, organise variants in separate sheets, or remove an edge-connected solid or gradient background. Paint keeps its sheets in this browser. Export a sheet as PNG, JPEG or WebP, or download all sheets as a ZIP of PNG files. To assign a public image URL to a drawing, choose **Save asset** or enable **Upload changes automatically**. The version shown in Paint can be inserted directly on the current page.

Use **Assets** to upload PNG, JPEG or WebP images up to 12 MB and 16 megapixels. Studio validates and re-encodes them, preserving transparency in PNG and WebP. Assets have distinct public addresses for use in published pages or other sites. The visual editor also accepts direct external image URLs. The Projects and Assets management views require Studio sign-in.

Use **Logic → Flows** to find page events and reusable flows across a project. **Show callers** lists `Run flow` and `For each item` nodes that call a definition. Use **Go to definition** to jump from a caller to the flow input.

Use **Design → Records table** for data-driven pages. Add columns with exact field IDs or top-level JSON keys and set the loading, empty, and error messages. In Blueprint, connect **List records** or an array from an API to **Show records**. Choose one of the table states for the start and error paths. Only mapped scalar fields are displayed; table data permissions still determine what a visitor can request. Use a row limit and **Skip rows** to build pagination.

Use **Backend → Workflows** to configure server-side request flows. **Backend → Hosting** publishes private or public releases. A public link uses `/s/<custom-address>/<site-id>/` and opens without Studio sign-in. Updating the same address preserves the ID and database. **Unpublish** takes the link offline. Generated browser assets for hosted releases are packed and minified. The browser can still inspect what it runs. Backend workflows, server-side credentials and the editable `.plot` source stay on the server. **Connections** registers server-side HTTP destinations. Existing browser drafts from the previous domain can be recovered at [99host.fun/studio/recover-draft](https://99host.fun/studio/recover-draft).

Use **Backend → Secrets** to create, replace or delete encrypted values for a saved server project. Choose a `PLOT_SECRET_…` alias in a protected route, a verifier or a named HTTPS connection. In **Hosting**, link the release to the saved project using **Project secrets**. Requests pick up rotations on the next run. For local workflow tests, opt in to saved secrets on an individual **Request test**. That request’s temporary aliases take precedence. [Project secrets guide](https://plotstudio.pro/docs#project-secrets)

Use **Backend → Tests** to save named requests and assert an HTTP status and values in the JSON response. **Run all** runs the collection in Studio; each request gets a fresh temporary database seeded from the current draft. Use sample data in saved tests. For headers, credentials, and raw signed bodies, use the one-off **Request test**. The `.plot` project retains the test definitions. Hosted releases and site ZIP exports omit them.

Use **Backend → Python** to write and test project scripts with `def run(input)`. Supply JSON and return a JSON value. In the workflow choose **Run Python script**, select the script, and bind its input to request data or an earlier node. A node named `transform` exposes the return value at `steps.transform.value.result` and captured output at `steps.transform.value.logs`. Connect **On error** to handle script errors or timeouts. Python runs in draft tests and on hosted sites. Each workflow request has 15 seconds of shared Python execution time. The runtime includes the Python standard library, plus any server-installed packages shown in the editor. Use Data and Connections nodes for database and HTTP access.

Use **Backend → Packages** to enable approved, pinned actions for a project. CSV Toolkit, Decimal Billing and Document Text use the Python standard library. Phone Contacts uses the dependency pinned in `workflow-package-requirements.txt`. Install it in the backend environment with `python -m pip install --only-binary=:all: --require-hashes -r workflow-package-requirements.txt` and point `PLOT_PYTHON` at that environment. The action list shows availability on the current server. Backend exports carry the project pins and the dependency file when required.

## Run an exported site

For a static export, extract the ZIP and serve the files with a static host. `index.html` is the home page. To test from the extracted directory, run `python -m http.server 8080` and open `http://localhost:8080/`.

For an export with Data, extract the ZIP and run `python runtime.py --port 8080`. See the included `DATABASE.md` for the API, permissions, and data paths. Host the runtime behind HTTPS when you expose it publicly. Table permissions govern operations for site visitors. Add your own application authentication if visitors should have distinct accounts or access to individual records.

When a backend ZIP references a credential alias, `.env.example` lists the alias with a blank value. Set the value in the server’s environment before running Python. Hosted secret values stay with their Studio projects. A self-hosted deployment gets its own values and named connection definitions.

Fonts outside the system font list load from Google Fonts. Browser fetch nodes use the browser's usual cross-origin rules.

## Run the editor locally on Windows

Use Node.js 20+ and Python 3.10+. Install the pinned publication dependencies with `npm ci --prefix publish-toolchain --omit=dev --ignore-scripts`. Make `cryptography` available to the Studio project-store interpreter and Pillow with WebP support available to the image decoder. `PLOT_ASSET_PYTHON` can point to a dedicated Pillow environment. The following PowerShell commands prompt for a local access password and start the gateway on loopback. Generate the two protection keys once for a new instance and keep the same values across restarts.

```powershell
$plotPassword = Read-Host 'Local access password' -AsSecureString
$env:STUDIO_PASSWORD_HASH = [Net.NetworkCredential]::new('', $plotPassword).Password | node server.mjs hash
$env:STUDIO_SESSION_SECRET = node -p "require('node:crypto').randomBytes(32).toString('base64url')"
$env:PLOT_PROJECT_STORAGE_KEY = node -p "require('node:crypto').randomBytes(32).toString('base64url')"
$env:PLOT_FILE_KEY = node -p "require('node:crypto').randomBytes(32).toString('base64url')"
$env:PUBLIC_ORIGIN = 'http://localhost:14990'
$env:PLOT_STATE_DIR = Join-Path $PWD '.plot-data'
node server.mjs
```

Open `http://localhost:14990/`. The production gateway uses Nginx and systemd on the VPS. Its draft SQLite database lives in `/var/lib/plot-studio`. Its password hash and session key are stored in `/etc/plot-studio/config.env`.

Store the protection keys in a root-owned configuration file and a separate secured backup. `PLOT_PROJECT_STORAGE_KEY` protects private drafts, checkpoints, release snapshots, connector settings and project secrets. `PLOT_FILE_KEY` protects downloaded `.plot` files. To move protected downloads to another Studio instance, retain their original `PLOT_FILE_KEY` in the destination configuration. Use separate keys for the two purposes. Set `PLOT_PROJECT_STORE_PYTHON` to an interpreter with `cryptography` when the workflow runner uses a separate Python environment.

## Example photo

`assets/prog.webp` was generated with the built-in ImageGen tool and resized to WebP for the PRÓG starter.

> Create a single landscape architectural editorial photograph for the demo website PRÓG, an independent Polish architecture studio. Tight three-quarter exterior courtyard view of a low contemporary Polish house clad in warm red-brown thin brick, rhythm of horizontal brick courses, large recessed dark glazing on the left, a narrow dark door on the right, sun dappled by one partly-cropped tall tree. Foreground rough outdoor limestone paving and low grasses. Quiet residential architecture, physically believable joinery and scale, warm late afternoon sun casting hard geometric shadows, earth warm brick and muted olive foliage, restrained contrast. An original, specific building, nothing flashy, slightly cinematic analog 35mm architecture editorial. The brick building fills the frame, little sky, no dramatic wide-angle distortion. Crisp authentic materials without oversharpening. Landscape 4:3 or 3:2. No text, no signage, no logos, no render sheen, no decorative overlay.
