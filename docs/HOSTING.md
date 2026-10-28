# Hosting at rackstudio.app

Rack Studio is a static browser application, so hosting serves the files that `pnpm build` writes to `dist/`. Cloudflare Workers serves them on the custom domain `rackstudio.app`, and Cloudflare Access requires sign-in before any page or file is served. No server code, database or application secret is involved.

## What is hosted, and what is not

- **Hosted:** the built application only. The source code is already public on GitHub, so Access protects use of the site, not the code.
- **Not hosted:** projects. They stay in the IndexedDB storage of the browser that created them, exactly as when running locally. Signing in does not sync projects between browsers or devices, and clearing site data for `rackstudio.app` deletes them. Export JSON for backups and to move work between devices.
- **Moving local work:** projects saved at `http://127.0.0.1:5173` or `:4173` belong to that origin and do not appear on `rackstudio.app`. Export each project as JSON locally, then import it on the website.

Cloud project storage is a separate, planned piece of work that needs its own security design (see `ARCHITECTURE.md`).

## Configuration in the repository

| File | Purpose |
| --- | --- |
| `wrangler.jsonc` | Worker `rack-studio`: serves `dist/` as static assets on the custom domain `rackstudio.app`. The public `workers.dev` and version/preview URLs are disabled, so the protected custom domain is the only address. Unknown paths serve `index.html` |
| `public/_headers` | Copied into `dist/` by Vite. Cloudflare applies it as response headers and does not serve it as a file: a content security policy limited to this origin (plus `data:`/`blob:` for embedded images and downloads), `nosniff`, no referrer, disabled device permissions, `noindex`, and long-lived caching for fingerprinted `/assets/*` files. The STEP import worker (`/assets/step.worker-*`) has no content security policy: its bundled OpenCascade (Emscripten) kernel compiles WebAssembly and evaluates generated code, and a dedicated worker takes its policy from its own response, so the page keeps the strict policy |

Wrangler is not a project dependency. Cloudflare's build runs a pinned `npx wrangler@4.149.0`; change the version there deliberately.

## One-time Cloudflare setup (account owner)

These steps are done in the [Cloudflare dashboard](https://dash.cloudflare.com/). `rackstudio.app` is registered with Cloudflare Registrar on the same account.

### 1. Enable Zero Trust

Open **Zero Trust**, choose a team name and select the **Free** plan (up to 50 users). Cloudflare may ask for a payment method even though the Free plan costs nothing.

### 2. Connect the repository

1. Go to **Workers & Pages > Create > Import a repository**, connect GitHub if prompted and select `RBNebula/Rack-Studio`.
2. Set:
   - **Project name:** `rack-studio`. It must match `name` in `wrangler.jsonc`.
   - **Production branch:** `main`
   - **Build command:** `pnpm build`
   - **Deploy command:** `npx wrangler@4.149.0 deploy`
   - **Root directory:** leave empty.
3. Under the build settings, turn off **builds for non-production branches**. Preview URLs are disabled in `wrangler.jsonc`, so branch builds have nothing to publish.
4. Save and deploy. Cloudflare installs dependencies with the pnpm version from `package.json`, builds, and attaches `rackstudio.app` automatically, including its DNS record and certificate. If the deploy reports an existing DNS record for `rackstudio.app`, delete that record under the domain's **DNS** settings and retry.

Every later merge to `main` deploys automatically. Merge only pull requests whose CI is green.

### 3. Require sign-in

Do this straight after the first deploy.

1. Go to **Workers & Pages**, select `rack-studio`, then the **Access** tab.
2. Select **Protect this Worker behind Access** and choose **All traffic**.
3. Under **Authentication policy**, choose **Cloudflare account**. Only members of your Cloudflare account can then sign in.
4. Select **Apply Access**.

To let other people in later, including yourself with an address that is not a member of the Cloudflare account:

1. Under **Zero Trust > Integrations > Identity providers** (older dashboards: **Settings > Authentication > Login methods**), add **One-time PIN** if it is not listed.
2. Edit the application under **Zero Trust > Access > Applications**. Under **Login methods**, enable **One-time PIN** next to the Cloudflare account login. Without it, the sign-in page offers only **Cloudflare** and says sign-in is restricted to members of the account, whatever the policy allows.
3. Add an **Allow** policy whose **Include** rule is **Emails** listing their addresses, or **Emails ending in** a company domain. Keep it a separate policy, or an **Include** in the existing one; a **Require** rule would demand both conditions at once.

They then sign in by entering their address and the one-time code emailed to it. Never allow the email domain of a public mail provider such as `gmail.com`: that admits every account at that provider.

### 4. Check it

- In a private window, `https://rackstudio.app` must show the Cloudflare sign-in page, never the application.
- After signing in, the application loads, the 3D viewport renders, and a saved project reappears after reloading the page.
- **Workers & Pages > rack-studio > Settings > Domains & Routes** lists only `rackstudio.app`, with `workers.dev` and preview URLs disabled.

## Testing the hosted configuration locally

```sh
pnpm build
npx wrangler@4.149.0 dev --ip 127.0.0.1 --port 8787
```

This serves `dist/` through Cloudflare's local runtime with `_headers` applied, at `http://127.0.0.1:8787/`. Access does not run locally. Browser workflows can target it with `RACK_TEST_URL=http://127.0.0.1:8787` (see `TESTING.md`).

## Costs

The domain is the only recurring cost. Workers static asset requests, Workers Builds and Cloudflare Access for up to 50 users are free on Cloudflare's free plans; check Cloudflare's current pricing before adding further services.
