import { Octokit } from '@octokit/rest'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import { fetchPullRequestFilesRaw, findLinkedPRsForIssue } from './lib/issue-linked-prs.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')

// Load environment variables from .env file
dotenv.config({ path: path.join(ROOT_DIR, '.env') })

// Configuration
const OWNER = 'OhMyGuus'
const REPO = 'I-Still-Dont-Care-About-Cookies'
const OUTPUT_DIR = path.join(ROOT_DIR, 'scripts', 'extracted-data', 'PRs')
const WHITELIST_PATH = path.join(ROOT_DIR, 'scripts', 'extracted-data', 'whitelist.json')
const BATCH_SIZE = 100 // Issues per page
const DELAY_MS = 1000 // Delay between requests to avoid rate limiting
const MAX_ISSUES = 3500
const REQ_PREFIX = '[REQ]'

// Initialize Octokit (GitHub API client)
if (!process.env.GITHUB_TOKEN) {
  console.warn('⚠️  WARNING: GITHUB_TOKEN not set!')
  console.warn('   - Unauthenticated rate limit: 60 requests/hour')
  console.warn('   - Authenticated rate limit: 5,000 requests/hour')
  console.warn('   - GraphQL API may fail without token')
  console.warn('')
  console.warn('   Create a token: https://github.com/settings/tokens')
  console.warn('   Add to .env file: GITHUB_TOKEN=your_token_here')
  console.warn('')
}

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN || undefined,
})

// Helper: Sleep for ms milliseconds
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function getRateLimitWaitMs(err, attempt, baseDelay) {
  const minW = 1000
  const maxW = 3600_000
  const fallback = Math.min(Math.max(baseDelay * Math.pow(2, attempt - 1), minW), maxW)
  const h = err.response?.headers
  if (!h) return fallback
  const ra = h['retry-after'] ?? h['Retry-After']
  if (ra != null) {
    const sec = parseInt(String(ra), 10)
    if (!Number.isNaN(sec)) return Math.min(Math.max(sec * 1000, minW), maxW)
  }
  const reset = h['x-ratelimit-reset'] ?? h['X-RateLimit-Reset']
  if (reset != null) {
    const resetMs = parseInt(String(reset), 10) * 1000 - Date.now()
    if (!Number.isNaN(resetMs)) return Math.min(Math.max(resetMs, minW), maxW)
  }
  return fallback
}

// Retry wrapper: honors Retry-After and X-RateLimit-Reset when present
async function withRetry(fn, maxRetries = 5, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isRateLimit = err.status === 403 || err.status === 429

      if (isRateLimit && attempt < maxRetries) {
        const waitTime = getRateLimitWaitMs(err, attempt, baseDelay)
        console.log(
          `   ⏳ Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s (attempt ${attempt}/${maxRetries})...`,
        )
        await sleep(waitTime)
        continue
      }

      throw err
    }
  }
}

const githubCtx = { octokit, withRetry, owner: OWNER, repo: REPO }

// Extract URLs and bare domains in document order so the reported site (e.g. under
// "### Website URL") wins over later cross-reference links (e.g. webcompat.com).
function extractUrls(text) {
  if (!text) return []
  const urls = []
  const combined =
    /https?:\/\/[^\s<>"{}|\\^`\[\]]+|\b(?:www\.)?[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]+)+\b/gi
  let m
  while ((m = combined.exec(text)) !== null) {
    const raw = m[0]
    if (raw.startsWith('http')) {
      urls.push(raw.replace(/[.,;:!?)\*\-]+$/, ''))
    } else {
      const domain = raw
      const fullDomain = domain.startsWith('www.') ? domain : `www.${domain}`
      if (!urls.some((u) => u.includes(domain) || u.includes(fullDomain))) {
        urls.push(domain)
      }
    }
  }
  return urls
}

// Helper: Extract domain from URL
function extractDomain(url) {
  try {
    // Add protocol if missing for parsing
    const urlToParse = url.startsWith('http') ? url : `https://${url}`
    const parsed = new URL(urlToParse)
    // Remove www. prefix if present
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// Helper: Check if a domain should be excluded from whitelist
const EXCLUDED_DOMAINS = [
  'github.com',
  'bucket.g-server.nl', // Extension infrastructure
]

function isDomainExcluded(domain) {
  return EXCLUDED_DOMAINS.some((excluded) => domain === excluded || domain.endsWith('.' + excluded))
}

// Helper: Ensure directory exists
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true })
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
}

// Helper: Save file
async function saveFile(filePath, content) {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, 'utf-8')
}

// Helper: Load or create whitelist
async function loadWhitelist() {
  try {
    const data = await fs.readFile(WHITELIST_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []
    }
    throw err
  }
}

// Helper: Save whitelist
async function saveWhitelist(whitelist) {
  // Sort and deduplicate
  const unique = [...new Set(whitelist)].sort()
  await saveFile(WHITELIST_PATH, JSON.stringify(unique, null, 2) + '\n')
}

// Fetch newest open issues with GraphQL cursor pagination (filters out PRs by using repository.issues)
async function fetchAllOpenIssues() {
  const allIssues = []
  let hasNextPage = true
  let cursor = null
  const first = BATCH_SIZE

  console.log('📥 Fetching open issues...')

  const query = `
    query($owner: String!, $repo: String!, $first: Int!, $after: String) {
      repository(owner: $owner, name: $repo) {
        issues(states: OPEN, first: $first, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
          nodes {
            number
            title
            body
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `

  while (hasNextPage) {
    const response = await withRetry(() =>
      octokit.graphql(query, {
        owner: OWNER,
        repo: REPO,
        first,
        after: cursor,
      }),
    )

    const issuesConnection = response.repository?.issues
    const nodes = issuesConnection?.nodes || []

    if (nodes.length === 0) {
      hasNextPage = false
      break
    }

    allIssues.push(
      ...nodes.map((n) => ({
        number: n.number,
        title: n.title || '',
        body: n.body || '',
      })),
    )

    console.log(`   Fetched ${allIssues.length} issues (GraphQL cursor page)`)

    if (allIssues.length >= MAX_ISSUES) {
      hasNextPage = false
      break
    }

    hasNextPage = issuesConnection.pageInfo?.hasNextPage
    cursor = issuesConnection.pageInfo?.endCursor || null

    if (hasNextPage) {
      await sleep(DELAY_MS)
    }
  }

  const sliced = allIssues.slice(0, MAX_ISSUES)
  console.log(`✅ Total open issues fetched: ${sliced.length}`)
  return sliced
}

// Process a single issue
async function processIssue(issue, stats) {
  const issueNumber = issue.number
  const issueBody = issue.body || ''

  console.log(`\n🔍 Processing issue #${issueNumber}: ${issue.title.substring(0, 60)}...`)

  try {
    if (!issue.title?.startsWith(REQ_PREFIX)) {
      stats.issuesSkippedNonREQ++
      console.log(`   ⏭️  Skipping (title does not start with ${REQ_PREFIX})`)
      return []
    }

    const linkedPRs = await findLinkedPRsForIssue(githubCtx, issueNumber, {
      title: issue.title,
      body: issueBody,
    })
    await sleep(DELAY_MS)

    if (linkedPRs.length > 0) {
      console.log(`   📦 Found ${linkedPRs.length} linked PR(s)`)
      stats.issuesWithPRs++

      // Process each PR
      for (const pr of linkedPRs) {
        console.log(`   └─ PR #${pr.number} (state: ${pr.state}, merged: ${pr.merged})`)
        stats.prsProcessed++

        // Create directory for this PR
        const prDir = path.join(OUTPUT_DIR, `PR_${pr.number}`)
        await ensureDir(prDir)

        // Save PR metadata
        const prMeta = {
          issue_number: issueNumber,
          pr_number: pr.number,
          state: pr.state,
          merged: pr.merged,
          files_changed: pr.files.length,
        }
        await saveFile(path.join(prDir, 'meta.json'), JSON.stringify(prMeta, null, 2) + '\n')

        const rawFiles = await fetchPullRequestFilesRaw(githubCtx, pr.number)
        await sleep(DELAY_MS)

        for (const f of rawFiles) {
          stats.filesProcessed++

          const filePath = path.join(prDir, f.filename)
          const changeContent = [
            `// File: ${f.filename}`,
            `// Status: ${f.status}`,
            `// Additions: ${f.additions}`,
            `// Deletions: ${f.deletions}`,
            `// PR: #${pr.number}`,
            `// Issue: #${issueNumber}`,
            ``,
            f.patch || '// No patch available',
          ].join('\n')

          await saveFile(filePath, changeContent)
          console.log(`      └─ ${f.filename} (${f.status})`)
        }
      }
    } else {
      // No linked PR - extract URLs and add to whitelist
      console.log(`   🌐 No linked PR - extracting URLs from issue`)
      stats.issuesWithoutPRs++

      const urls = extractUrls(issueBody)
      const domains = urls
        .map(extractDomain)
        .filter(Boolean)
        .filter((domain) => !isDomainExcluded(domain))

      // Deduplicate domains for this issue
      const uniqueDomains = [...new Set(domains)]

      if (uniqueDomains.length > 0) {
        const firstDomain = uniqueDomains[0]
        console.log(`   └─ Found domain: ${firstDomain}`)
        stats.domainsAdded++
        return [firstDomain]
      } else {
        console.log(`   └─ No valid domains found`)
      }
    }
  } catch (err) {
    console.error(`   ❌ Error processing issue #${issueNumber}:`, err.message)
    stats.errors++
  }

  return []
}

// Main function
async function main() {
  console.log('🚀 Starting GitHub issue sync...\n')

  // Check for GitHub token
  if (!process.env.GITHUB_TOKEN) {
    console.log('⚠️  GITHUB_TOKEN not set. Rate limits will be lower.')
    console.log('   Create a token at: https://github.com/settings/tokens')
    console.log('   Then run: GITHUB_TOKEN=your_token npm run sync-issues\n')
  }

  const stats = {
    totalIssues: 0,
    issuesWithPRs: 0,
    issuesWithoutPRs: 0,
    issuesSkippedNonREQ: 0,
    prsProcessed: 0,
    filesProcessed: 0,
    domainsAdded: 0,
    errors: 0,
  }

  // Fetch all open issues
  const issues = await fetchAllOpenIssues()
  stats.totalIssues = issues.length

  // Process issues
  const allDomains = []

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i]
    console.log(`\n[${i + 1}/${issues.length}]`, '')

    const domains = await processIssue(issue, stats)
    allDomains.push(...domains)

    // Progress save every 50 issues
    if ((i + 1) % 50 === 0) {
      console.log('\n💾 Saving progress...')
      const whitelist = await loadWhitelist()
      whitelist.push(...allDomains)
      await saveWhitelist(whitelist)
      allDomains.length = 0 // Clear array
    }
  }

  // Final save
  console.log('\n💾 Saving final results...')
  if (allDomains.length > 0) {
    const whitelist = await loadWhitelist()
    whitelist.push(...allDomains)
    await saveWhitelist(whitelist)
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total open issues:        ${stats.totalIssues}`)
  console.log(`Skipped (non-[REQ]):      ${stats.issuesSkippedNonREQ}`)
  console.log(`Issues with PRs:          ${stats.issuesWithPRs}`)
  console.log(`Issues without PRs:       ${stats.issuesWithoutPRs}`)
  console.log(`PRs processed:            ${stats.prsProcessed}`)
  console.log(`Files processed:          ${stats.filesProcessed}`)
  console.log(`Domains added:            ${stats.domainsAdded}`)
  console.log(`Errors:                   ${stats.errors}`)
  console.log('='.repeat(60))
  console.log(`\n📁 PR changes saved to: ${OUTPUT_DIR}`)
  console.log(`📝 Whitlist saved to: ${WHITELIST_PATH}`)
  console.log('\n✅ Done!')
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
