# GitHub Pages Deployment

This project includes a GitHub Actions workflow to build and deploy the Vite site to GitHub Pages.

Workflow path: `.github/workflows/deploy.yml`

What it does

- Runs on pushes to `main`.
- Uses `pnpm` to install and build (`pnpm build`).
- Uses official GitHub Pages actions to deploy the `./dist` folder directly to GitHub Pages (no separate gh-pages branch needed).

How to use

1. Push your changes to the `main` branch on GitHub.
2. Wait for the `build-and-deploy` and `deploy` workflows to finish (Actions tab).
3. GitHub Pages will be automatically enabled and your site should be available at:
   - `https://<your-user>.github.io/<your-repo>/` (or your custom domain if configured)

Notes

- If your site will be served under a path (e.g., `https://<user>.github.io/<repo>/`), set the `base` option in `vite.config.ts` to `'/<repo>/'` before building so asset paths are correct.
- To use a custom domain, add a `CNAME` file to `public/` or configure via repository Pages settings.
- The workflow uses Node.js 20 and `pnpm`. Ensure `pnpm-lock.yaml` is present (it is).

If you want I can add the `base` change to `vite.config.ts` and/or automatically set repository Pages using GitHub's REST API in the workflow.

## Environment & Secrets

- The build reads environment variables from a `.env` file. For secure automation, **do not** commit secrets to the repository. Instead, set the following repository secrets in Settings → Secrets & variables → Actions:
  - `VITE_MAPBOX_TOKEN` (required) — your Mapbox access token
  - `VITE_BASE` (optional) — base path (e.g., `/repo-name/`) if the site is hosted under a path
  - `VITE_APP_TITLE` (optional)

- The workflow will create a `.env` file at build time using these secrets, so you don't need to commit `.env`.

- If you already committed `.env` with secrets, remove it from the repository history (recommended) and add the tokens as Secrets:
  - Locally: run `git rm --cached .env && git commit -m "Remove .env" && git push`
  - For complete cleanup of history, consider using `git filter-branch` or the BFG repo cleaner.

- After adding secrets and pushing `main`, check Actions → `build-and-deploy` to confirm the build and deploy steps succeed.
