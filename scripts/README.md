# GitHub Issue Sync Scripts

These scripts synchronize open issues from the [I-Still-Dont-Care-About-Cookies](https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies) repository.

## Scripts

### `npm run sync-issues:test`

Tests the sync process with the first **5 open issues**. Use this to verify the script works before running the full sync.

### `npm run sync-issues`

Runs the full sync across **all 5,000+ open issues**. This will take several hours without a GitHub token.

## What It Does

For each open issue:

1. **If the issue has a linked PR:**
   - Fetches all file changes from the PR
   - Saves each changed file to `scripts/extracted-data/PR_<number>/` with the same filename
   - Includes metadata about additions, deletions, and change type
   - Creates a `meta.json` with PR details

2. **If the issue has NO linked PR:**
   - Extracts website URLs from the issue text
   - Adds the domains to `whitelist.json` (deduplicated and sorted)

## Setup

### Create a GitHub Token

Without a token, you're limited to **60 requests/hour**. With a token: **5,000 requests/hour**.

1. Go to https://github.com/settings/tokens
2. Create a new token with `public_repo` scope
3. Copy `.env.example` to `.env` in the project root:
   ```bash
   cp .env.example .env
   ```
4. Add your token to the `.env` file:
   ```
   GITHUB_TOKEN=your_token_here
   ```

The scripts will automatically load the token from `.env`.

## Output Structure

```
scripts/extracted-data/
├── PR_12345/
│   ├── meta.json
│   ├── rules.json
│   └── src/
│       └── file.js
└── PR_12346/
    ├── meta.json
    └── rules.json

whitelist.json
```

## Rate Limiting

- **With token:** ~5,000 requests/hour (takes ~2-3 hours for full sync)
- **Without token:** ~60 requests/hour (will take 2-3 days for full sync)

The script includes automatic retry with exponential backoff when rate-limited.

## Notes

- URLs are cleaned and domains are extracted (removes `www.` prefix)
- GitHub URLs are filtered out from the whitelist
- Progress is saved every 50 issues
- The whitelist is deduplicated and sorted automatically
