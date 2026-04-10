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
const TEST_ISSUES_COUNT = 100
const DELAY_MS = 1000
const REQ_PREFIX = '[REQ]'
/** If set (e.g. 23810), fetch and process only that issue for verification */
const TEST_ISSUE_NUMBER = process.env.TEST_ISSUE_NUMBER
  ? parseInt(process.env.TEST_ISSUE_NUMBER, 10)
  : null

// Initialize Octokit
if (!process.env.GITHUB_TOKEN) {
  console.warn('⚠️  WARNING: GITHUB_TOKEN not set!')
  console.warn('   - Unauthenticated rate limit: 60 requests/hour')
  console.warn('   - Authenticated rate limit: 5,000 requests/hour')
  console.warn('')
}

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN || undefined,
})

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

function extractDomain(url) {
  try {
    const urlToParse = url.startsWith('http') ? url : `https://${url}`
    const parsed = new URL(urlToParse)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// Excluded domains
const EXCLUDED_DOMAINS = ['github.com', 'bucket.g-server.nl']

function isDomainExcluded(domain) {
  return EXCLUDED_DOMAINS.some((excluded) => domain === excluded || domain.endsWith('.' + excluded))
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function saveFile(filePath, content) {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, 'utf-8')
}

async function loadWhitelist() {
  try {
    const data = await fs.readFile(WHITELIST_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function saveWhitelist(whitelist) {
  const unique = [...new Set(whitelist)].sort()
  await saveFile(WHITELIST_PATH, JSON.stringify(unique, null, 2) + '\n')
}

async function main() {
  let issues = []

  if (TEST_ISSUE_NUMBER != null && !Number.isNaN(TEST_ISSUE_NUMBER)) {
    console.log('🧪 TESTING: Single issue #' + TEST_ISSUE_NUMBER + ' (TEST_ISSUE_NUMBER)\n')
    const { data: issue } = await withRetry(() =>
      octokit.rest.issues.get({
        owner: OWNER,
        repo: REPO,
        issue_number: TEST_ISSUE_NUMBER,
      }),
    )
    if (issue.pull_request) {
      console.error(`#${TEST_ISSUE_NUMBER} is a pull request, not an issue.`)
      process.exit(1)
    }
    issues = [issue]
  } else {
    console.log('🧪 TESTING: Syncing first', TEST_ISSUES_COUNT, 'issues (GraphQL)...\n')

    const query = `
      query($owner: String!, $repo: String!, $first: Int!) {
        repository(owner: $owner, name: $repo) {
          issues(states: OPEN, first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              number
              title
              body
            }
          }
        }
      }
    `

    const response = await withRetry(() =>
      octokit.graphql(query, {
        owner: OWNER,
        repo: REPO,
        first: TEST_ISSUES_COUNT,
      }),
    )

    const nodes = response.repository?.issues?.nodes || []
    issues = nodes.map((n) => ({
      number: n.number,
      title: n.title || '',
      body: n.body || '',
    }))

    console.log(`📥 Fetched ${issues.length} issues via GraphQL\n`)
  }

  const stats = {
    issuesWithPRs: 0,
    issuesWithoutPRs: 0,
    issuesSkippedNonREQ: 0,
    prsProcessed: 0,
    filesProcessed: 0,
    domainsAdded: 0,
    errors: 0,
  }

  const allDomains = []

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i]
    console.log(
      `\n[${i + 1}/${issues.length}] Issue #${issue.number}: ${issue.title.substring(0, 60)}...`,
    )

    try {
      if (!issue.title?.startsWith(REQ_PREFIX)) {
        stats.issuesSkippedNonREQ++
        console.log(`   ⏭️  Skipping (title does not start with ${REQ_PREFIX})`)
        continue
      }

      const linkedPRs = await findLinkedPRsForIssue(githubCtx, issue.number, {
        title: issue.title,
        body: issue.body || '',
      })
      await sleep(DELAY_MS)

      if (linkedPRs.length > 0) {
        console.log(`   📦 Found ${linkedPRs.length} linked PR(s)`)
        stats.issuesWithPRs++

        for (const pr of linkedPRs) {
          console.log(
            `   └─ PR #${pr.number} (state: ${pr.state}, merged: ${pr.merged}, files: ${pr.files.length})`,
          )
          stats.prsProcessed++

          const prDir = path.join(OUTPUT_DIR, `PR_${pr.number}`)
          await ensureDir(prDir)

          // Save metadata
          const prMeta = {
            issue_number: issue.number,
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
              `// Issue: #${issue.number}`,
              ``,
              f.patch || '// No patch available',
            ].join('\n')

            await saveFile(filePath, changeContent)
            console.log(`      └─ ${f.filename} (${f.status})`)
          }
        }
      } else {
        console.log(`   🌐 No linked PR - extracting URLs`)
        stats.issuesWithoutPRs++

        const urls = extractUrls(issue.body || '')
        const domains = urls
          .map(extractDomain)
          .filter(Boolean)
          .filter((domain) => !isDomainExcluded(domain))

        // Deduplicate
        const uniqueDomains = [...new Set(domains)]

        if (uniqueDomains.length > 0) {
          const firstDomain = uniqueDomains[0]
          console.log(`   └─ Found domain: ${firstDomain}`)
          stats.domainsAdded++
          allDomains.push(firstDomain)
        } else {
          console.log(`   └─ No valid domains found`)
        }
      }
    } catch (err) {
      console.error(`   ❌ Error:`, err.message)
      stats.errors++
    }
  }

  // Save whitelist
  if (allDomains.length > 0) {
    const whitelist = await loadWhitelist()
    whitelist.push(...allDomains)
    await saveWhitelist(whitelist)
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(60))
  console.log(`Issues processed:           ${issues.length}`)
  console.log(`Skipped (non-[REQ]):        ${stats.issuesSkippedNonREQ}`)
  console.log(`Issues with PRs:            ${stats.issuesWithPRs}`)
  console.log(`Issues without PRs:         ${stats.issuesWithoutPRs}`)
  console.log(`PRs processed:              ${stats.prsProcessed}`)
  console.log(`Files processed:            ${stats.filesProcessed}`)
  console.log(`Domains added:              ${stats.domainsAdded}`)
  console.log(`Errors:                     ${stats.errors}`)
  console.log('='.repeat(60))
  console.log(`\n📁 PR changes saved to: ${OUTPUT_DIR}`)
  console.log(`📝 Whitelist saved to: ${WHITELIST_PATH}`)
  console.log('\n✅ Test complete! Review the output and run `npm run sync-issues` for full sync.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
