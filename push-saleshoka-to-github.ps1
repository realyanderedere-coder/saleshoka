param(
  [string]$Repo = "https://github.com/realyanderedere-coder/saleshoka.git"
)

$ErrorActionPreference = "Stop"

function Need($cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $cmd"
  }
}

Need "git"

$root = (Get-Location).Path
if (-not (Test-Path (Join-Path $root "wrangler.jsonc"))) {
  throw "Run this script inside the site folder (wrangler.jsonc not found)."
}
if (-not (Test-Path (Join-Path $root "public\index.html"))) {
  throw "Run this script inside the site folder (public\index.html not found)."
}

@"
node_modules/
.wrangler/
.dev.vars
.env
.DS_Store
Thumbs.db
"@ | Set-Content -Path ".gitignore" -Encoding ascii

@"
# Saleshoka

Production source for the Saleshoka site.

- Hosting: Cloudflare Workers Static Assets
- Worker: saleshoka
- Public assets: ./public
- Local preview: npm run dev
- Deploy: npm run deploy
"@ | Set-Content -Path "README.md" -Encoding utf8

New-Item -ItemType Directory -Force -Path ".github\workflows" | Out-Null

$workflow = @'
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Deploy
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
'@

$workflow | Set-Content -Path ".github\workflows\deploy.yml" -Encoding utf8

if (-not (Test-Path ".git")) {
  git init
}

git branch -M main

$remotes = @(git remote)
if ($remotes -contains "origin") {
  git remote set-url origin $Repo
} else {
  git remote add origin $Repo
}

git add .
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "Import WebsitePublisher site for Cloudflare Workers"
} else {
  Write-Host "No staged changes to commit."
}

Write-Host ""
Write-Host "Repository prepared."
Write-Host "Remote: $Repo"
Write-Host ""
Write-Host "Next:"
Write-Host "  git push -u origin main"
