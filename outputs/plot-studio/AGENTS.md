The production editor starts from an encrypted, compiled bundle assembled across the content domains.
After changing studio.mjs or any module imported by it, run `node build-studio.mjs` from this directory and include `studio-build/editor.mjs` in the deployment.
Install the build dependency, when needed, with `npm ci --prefix studio-build-toolchain`.
Keep private server modules and cryptographic master keys out of the browser bundle.
For changes to startup or its compiled client, run `PLOT_TEST_DISTRIBUTED_BOOT=1 node work/check-studio-rotation.mjs` from the workspace root. In PowerShell, set the environment variable before running Node.
