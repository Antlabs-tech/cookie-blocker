/**
 * Linked PR discovery for GitHub issues: GraphQL timeline, REST timeline (Mockingbird),
 * and title/body/comments regex fallback. PRs are deduped by number.
 */

const GRAPHQL_TIMELINE_QUERY = `
  query($owner: String!, $repo: String!, $issueNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issueNumber) {
        timelineItems(first: 100, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  state
                  merged
                  files(first: 100) {
                    nodes {
                      path
                      additions
                      deletions
                      changeType
                    }
                  }
                }
              }
            }
            ... on ConnectedEvent {
              subject {
                ... on PullRequest {
                  number
                  state
                  merged
                  files(first: 100) {
                    nodes {
                      path
                      additions
                      deletions
                      changeType
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** ~28/min sustained; overridable via GITHUB_SEARCH_MIN_INTERVAL_MS */
const SEARCH_MIN_INTERVAL_MS = (() => {
  const raw = process.env.GITHUB_SEARCH_MIN_INTERVAL_MS
  if (raw == null || raw === '') return 2100
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 2100
})()

/** Random jitter added to each search pacing wait */
const SEARCH_JITTER_MS = (() => {
  const raw = process.env.GITHUB_SEARCH_JITTER_MS
  if (raw == null || raw === '') return 750
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 750
})()

/** Extra cooldown when Search returns 403 without helpful headers */
const SEARCH_403_COOLDOWN_MS = (() => {
  const raw = process.env.GITHUB_SEARCH_403_COOLDOWN_MS
  if (raw == null || raw === '') return 30000
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 30000
})()

let lastSearchRequestAt = 0
let searchCooldownUntil = 0

async function paceSearchRequest() {
  const now = Date.now()

  if (now < searchCooldownUntil) {
    await sleep(searchCooldownUntil - now)
  }

  const elapsed = Date.now() - lastSearchRequestAt
  if (elapsed < SEARCH_MIN_INTERVAL_MS) {
    const baseWait = SEARCH_MIN_INTERVAL_MS - elapsed
    const jitter = SEARCH_JITTER_MS ? Math.floor(Math.random() * (SEARCH_JITTER_MS + 1)) : 0
    await sleep(baseWait + jitter)
  }

  lastSearchRequestAt = Date.now()
}

function getSearchCooldownMs(err, attempt) {
  const minW = 1000
  const maxW = 10 * 60_000
  const h = err.response?.headers

  const ra = h?.['retry-after'] ?? h?.['Retry-After']
  if (ra != null) {
    const sec = parseInt(String(ra), 10)
    if (!Number.isNaN(sec)) return Math.min(Math.max(sec * 1000, minW), maxW)
  }

  const reset = h?.['x-ratelimit-reset'] ?? h?.['X-RateLimit-Reset']
  if (reset != null) {
    const resetMs = parseInt(String(reset), 10) * 1000 - Date.now()
    if (!Number.isNaN(resetMs)) return Math.min(Math.max(resetMs, minW), maxW)
  }

  const backoff = SEARCH_403_COOLDOWN_MS * Math.max(1, attempt)
  return Math.min(Math.max(backoff, minW), maxW)
}

/** #issueNumber with digit boundaries; also /issues/N in URLs */
export function prMentionsIssueInText(text, issueNumber) {
  if (!text) return false
  const n = String(issueNumber)
  if (new RegExp(`(^|[^0-9])#${n}([^0-9]|$)`).test(text)) return true
  return new RegExp(`/issues/${n}(?:\\W|$)`).test(text)
}

/** REST returns PRs as issues with nested pull_request; extract PR number if present. */
function prNumberFromTimelineRef(ref) {
  if (!ref || ref.type !== 'issue') return null
  const issue = ref.issue
  if (issue?.pull_request) return issue.number
  return null
}

function prNumberFromTimelineEvent(event) {
  if (event.event === 'cross-referenced') {
    const n = prNumberFromTimelineRef(event.source)
    if (n != null) return n
  }
  if (event.event === 'connected') {
    const fromSubject = prNumberFromTimelineRef(event.subject)
    if (fromSubject != null) return fromSubject
    const fromSource = prNumberFromTimelineRef(event.source)
    if (fromSource != null) return fromSource
  }
  return null
}

/**
 * @param {{ octokit: import('@octokit/rest').Octokit, withRetry: <T>(fn: () => Promise<T>) => Promise<T>, owner: string, repo: string }} ctx
 */
export async function getLinkedPRsGraphQL(ctx, issueNumber) {
  const { octokit, withRetry, owner, repo } = ctx
  try {
    const response = await withRetry(() =>
      octokit.graphql(GRAPHQL_TIMELINE_QUERY, {
        owner,
        repo,
        issueNumber,
      }),
    )

    const nodes = response.repository?.issue?.timelineItems?.nodes || []
    const prs = []

    for (const node of nodes) {
      const prData = node.source || node.subject
      if (prData && prData.number) {
        prs.push({
          number: prData.number,
          state: prData.state,
          merged: prData.merged,
          files: prData.files?.nodes || [],
        })
      }
    }

    return prs
  } catch (err) {
    console.warn(`   ⚠️  Could not fetch linked PRs (GraphQL) for #${issueNumber}:`, err.message)
    return []
  }
}

/**
 * PR numbers from issue timeline (Mockingbird). REST exposes linked PRs as source.type "issue" + pull_request.
 */
export async function getLinkedPRNumbersFromTimelineRest(ctx, issueNumber) {
  const { octokit, withRetry, owner, repo } = ctx
  const numbers = new Set()
  let page = 1
  const perPage = 100

  try {
    while (true) {
      const { data: events } = await withRetry(() =>
        octokit.rest.issues.listEventsForTimeline({
          owner,
          repo,
          issue_number: issueNumber,
          per_page: perPage,
          page,
          mediaType: { previews: ['mockingbird'] },
        }),
      )

      for (const event of events) {
        const n = prNumberFromTimelineEvent(event)
        if (n != null && n !== issueNumber) numbers.add(n)
      }

      if (events.length < perPage) break
      page++
    }
  } catch (err) {
    console.warn(`   ⚠️  Could not fetch issue timeline (REST) for #${issueNumber}:`, err.message)
  }

  return numbers
}

async function validateSearchItemMentionsIssue(ctx, item, issueNumber) {
  const { octokit, withRetry, owner, repo } = ctx
  const combined = `${item.title || ''}\n${item.body || ''}`
  if (prMentionsIssueInText(combined, issueNumber)) return true
  try {
    const { data: pr } = await withRetry(() =>
      octokit.pulls.get({
        owner,
        repo,
        pull_number: item.number,
      }),
    )
    return prMentionsIssueInText(`${pr.title || ''}\n${pr.body || ''}`, issueNumber)
  } catch {
    return false
  }
}

/**
 * One search query + validation. Needed when timeline omits cross-referenced events for some tokens.
 */
export async function getLinkedPRNumbersFromSearch(ctx, issueNumber) {
  const { octokit, withRetry, owner, repo } = ctx
  const numbers = new Set()
  const q = `repo:${owner}/${repo} is:pr ${issueNumber}`

  try {
    const maxRetries = 3
    let data = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await paceSearchRequest()
        ;({ data } = await octokit.rest.search.issuesAndPullRequests({
          q,
          per_page: 100,
        }))
        break
      } catch (err) {
        const isRateLimit = err.status === 403 || err.status === 429
        if (!isRateLimit || attempt === maxRetries) throw err

        const coolDownMs = getSearchCooldownMs(err, attempt)
        searchCooldownUntil = Math.max(searchCooldownUntil, Date.now() + coolDownMs)
        console.log(
          `   ⏳ Search rate limited. Cooling down ${Math.ceil(coolDownMs / 1000)}s (attempt ${attempt}/${maxRetries})...`,
        )
      }
    }

    if (!data) return numbers

    for (const item of data.items || []) {
      if (!item.pull_request || item.number === issueNumber) continue
      if (await validateSearchItemMentionsIssue(ctx, item, issueNumber)) {
        numbers.add(item.number)
      }
    }
  } catch (err) {
    console.warn(`   ⚠️  PR search failed for #${issueNumber}:`, err.message)
  }

  return numbers
}

const PR_REF_PATTERN = /(?:PR\s*)?#(\d+)|pull\/(\d+)/gi

function collectPRNumbersFromText(text, issueNumber) {
  const refs = new Set()
  if (!text) return refs
  let match
  PR_REF_PATTERN.lastIndex = 0
  while ((match = PR_REF_PATTERN.exec(text)) !== null) {
    const prNum = parseInt(match[1] || match[2], 10)
    if (prNum && prNum !== issueNumber) refs.add(prNum)
  }
  return refs
}

/**
 * @param {{ octokit: import('@octokit/rest').Octokit, withRetry: <T>(fn: () => Promise<T>) => Promise<T>, owner: string, repo: string }} ctx
 */
export async function fetchPRWithFiles(ctx, pullNumber) {
  const { octokit, withRetry, owner, repo } = ctx
  const { data: pr } = await withRetry(() =>
    octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    }),
  )

  const { data: files } = await withRetry(() =>
    octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    }),
  )

  return {
    number: pr.number,
    state: pr.state,
    merged: pr.merged_at !== null,
    files: files.map((f) => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      changeType: f.status,
      patch: f.patch || null,
    })),
  }
}

/** Single listFiles call; use for exporting patches without re-fetching per file */
export async function fetchPullRequestFilesRaw(ctx, pullNumber) {
  const { octokit, withRetry, owner, repo } = ctx
  const { data: files } = await withRetry(() =>
    octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    }),
  )
  return files
}

/**
 * Regex scan of issue title, body, and comments (one listComments call).
 * @returns {Promise<Set<number>>}
 */
export async function collectReferencedPRNumbersFromIssueText(ctx, issueNumber, title, body) {
  const { octokit, withRetry, owner, repo } = ctx
  try {
    const { data: comments } = await withRetry(() =>
      octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
      }),
    )

    const allText = [title || '', body || '', ...comments.map((c) => c.body || '')].join('\n')
    return collectPRNumbersFromText(allText, issueNumber)
  } catch {
    return new Set()
  }
}

/**
 * Full pipeline: GraphQL → REST timeline → title/body/comments. Dedupes by PR number (GraphQL data kept when duplicate).
 */
export async function findLinkedPRsForIssue(ctx, issueNumber, { title, body }) {
  const byNumber = new Map()

  for (const pr of await getLinkedPRsGraphQL(ctx, issueNumber)) {
    byNumber.set(pr.number, pr)
  }

  const fromTimeline = await getLinkedPRNumbersFromTimelineRest(ctx, issueNumber)
  for (const num of fromTimeline) {
    if (!byNumber.has(num)) {
      try {
        byNumber.set(num, await fetchPRWithFiles(ctx, num))
      } catch {
        // ignore
      }
    }
  }

  if (byNumber.size === 0) {
    const fromSearch = await getLinkedPRNumbersFromSearch(ctx, issueNumber)
    for (const num of fromSearch) {
      if (!byNumber.has(num)) {
        try {
          byNumber.set(num, await fetchPRWithFiles(ctx, num))
        } catch {
          // ignore
        }
      }
    }
  }

  const refNums = await collectReferencedPRNumbersFromIssueText(ctx, issueNumber, title, body)
  const newFromText = [...refNums].filter((n) => !byNumber.has(n))
  if (newFromText.length > 0) {
    console.log(`   🔍 Found PR references in title/body/comments: ${newFromText.join(', ')}`)
    for (const num of newFromText) {
      try {
        byNumber.set(num, await fetchPRWithFiles(ctx, num))
      } catch {
        // Not a PR in this repo or inaccessible
      }
    }
  }

  return [...byNumber.values()]
}
