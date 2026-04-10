import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')

const PRS_DIR = path.join(ROOT_DIR, 'scripts', 'extracted-data', 'PRs')
const OUT_DIR = path.join(ROOT_DIR, 'scripts', 'extracted-data', 'combined')

function parsePrNumberFromDirname(dirName) {
  const m = /^PR_(\d+)$/.exec(dirName)
  if (!m) return null
  return Number(m[1])
}

async function pathExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function listDirEntries(dir) {
  return await fs.readdir(dir, { withFileTypes: true })
}

async function walkFiles(rootDir) {
  const out = []
  async function rec(curDir) {
    const entries = await listDirEntries(curDir)
    for (const ent of entries) {
      const p = path.join(curDir, ent.name)
      if (ent.isDirectory()) {
        await rec(p)
      } else if (ent.isFile()) {
        out.push(p)
      }
    }
  }
  await rec(rootDir)
  return out
}

function extractDiffLines(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  for (const line of lines) {
    if (!line) continue
    const ch = line[0]
    if (ch === '+' || ch === '-' || ch === ' ') {
      out.push({ prefix: ch, content: line.slice(1) })
    }
  }
  return out
}

function normalizeBlockIndent(blockLines, baseIndent = '  ') {
  if (blockLines.length === 0) return ''
  const leading = (s) => {
    const m = /^(\s*)/.exec(s)
    return m ? m[1].length : 0
  }
  const firstIndent = leading(blockLines[0])
  const normalized = blockLines.map((ln) => {
    const cut = ln.startsWith(' '.repeat(firstIndent)) ? ln.slice(firstIndent) : ln.trimStart()
    return baseIndent + cut
  })
  return normalized.join('\n')
}

function parseRulesEntriesFromExtractedDiff(text) {
  const diffLines = extractDiffLines(text)
  const adds = new Map()
  const dels = new Set()

  const keyRe = /^\s*"([^"]+)"\s*:/
  const isEntryCloserAtIndent = (content, startIndentLen) => {
    const m = /^(\s*)/.exec(content)
    const indentLen = m ? m[1].length : 0
    const t = content.trim()
    return indentLen === startIndentLen && t.startsWith('}') && t.endsWith(',')
  }

  // hostname -> { hasPlusKey, hasMinusKey }
  const keySeen = new Map()
  for (const dl of diffLines) {
    const m = keyRe.exec(dl.content)
    if (!m) continue
    const host = m[1]
    const cur = keySeen.get(host) ?? { hasPlusKey: false, hasMinusKey: false }
    if (dl.prefix === '+') cur.hasPlusKey = true
    if (dl.prefix === '-') cur.hasMinusKey = true
    keySeen.set(host, cur)
  }

  for (let i = 0; i < diffLines.length; i++) {
    const { prefix, content } = diffLines[i]
    const m = keyRe.exec(content)
    if (!m) continue

    const hostname = m[1]
    const startIndentLen = (content.match(/^(\s*)/)?.[1]?.length ?? 0)

    const block = [{ prefix, content }]

    // Capture forward until we hit this entry’s closer at the same indent, or
    // until we hit another key at the same indent (fallback for truncated diffs).
    if (!content.trimEnd().endsWith(',')) {
      for (let j = i + 1; j < diffLines.length; j++) {
        const nl = diffLines[j]
        const keyM = keyRe.exec(nl.content)
        if (keyM) {
          const indentLen = (nl.content.match(/^(\s*)/)?.[1]?.length ?? 0)
          if (indentLen === startIndentLen) break
        }
        block.push({ prefix: nl.prefix, content: nl.content })
        if (isEntryCloserAtIndent(nl.content, startIndentLen)) {
          i = j
          break
        }
      }
    }

    const hasChangeLine = block.some((b, idx) => idx > 0 && (b.prefix === '+' || b.prefix === '-'))
    const finalLines = block.filter((b) => b.prefix !== '-').map((b) => b.content)

    const seen = keySeen.get(hostname) ?? { hasPlusKey: false, hasMinusKey: false }
    const isDeleted = prefix === '-' && !seen.hasPlusKey
    if (isDeleted) {
      dels.add(hostname)
      continue
    }

    // If key line is context but inner lines changed, treat as modified.
    if (prefix === '+' || (prefix === ' ' && hasChangeLine)) {
      adds.set(hostname, finalLines)
    }
  }

  return { adds, dels }
}

function parseCookieHandlerCasesFromExtractedDiff(text) {
  const diffLines = extractDiffLines(text)
  const adds = new Map()
  const dels = new Set()

  const caseRe = /^\s*case\s+"([^"]+)"\s*:\s*$/
  const leading = (s) => (s.match(/^(\s*)/)?.[1]?.length ?? 0)
  const isDefaultAtIndent = (s, indentLen) => leading(s) === indentLen && s.trim() === 'default:'

  const caseSeen = new Map()
  for (const dl of diffLines) {
    const m = caseRe.exec(dl.content)
    if (!m) continue
    const host = m[1]
    const cur = caseSeen.get(host) ?? { hasPlusCase: false, hasMinusCase: false }
    if (dl.prefix === '+') cur.hasPlusCase = true
    if (dl.prefix === '-') cur.hasMinusCase = true
    caseSeen.set(host, cur)
  }

  for (let i = 0; i < diffLines.length; i++) {
    const { prefix, content } = diffLines[i]
    const m = caseRe.exec(content)
    if (!m) continue

    const hostname = m[1]
    const startIndentLen = leading(content)
    const block = [{ prefix, content }]

    for (let j = i + 1; j < diffLines.length; j++) {
      const nl = diffLines[j]
      const nextContent = nl.content
      const m2 = caseRe.exec(nextContent)
      const nextIndent = leading(nextContent)
      if (m2 && nextIndent === startIndentLen) break
      if (isDefaultAtIndent(nextContent, startIndentLen)) break
      // If we hit the end of the switch (indent decreases and line closes a block), stop.
      if (nextIndent < startIndentLen && nextContent.trim().startsWith('}')) break
      block.push({ prefix: nl.prefix, content: nextContent })
    }

    const hasChangeLine = block.some((b, idx) => idx > 0 && (b.prefix === '+' || b.prefix === '-'))
    const finalLines = block.filter((b) => b.prefix !== '-').map((b) => b.content)
    const seen = caseSeen.get(hostname) ?? { hasPlusCase: false, hasMinusCase: false }
    const isDeleted = prefix === '-' && !seen.hasPlusCase
    if (isDeleted) {
      dels.add(hostname)
      continue
    }

    if (prefix === '+' || (prefix === ' ' && hasChangeLine)) {
      adds.set(hostname, finalLines)
    }
  }

  return { adds, dels }
}

function compareByPrNumber(a, b) {
  return a.prNumber - b.prNumber
}

function emitMergedRulesJs(hostToEntry, sourceSummaryLines) {
  const hostnames = Array.from(hostToEntry.keys()).sort((a, b) => a.localeCompare(b))
  const bodyLines = []
  for (const host of hostnames) {
    const entryLines = hostToEntry.get(host)
    bodyLines.push(normalizeBlockIndent(entryLines, '  '))
  }

  const header = [
    '// Generated from extracted PR diffs (unmerged PRs only).',
    ...(sourceSummaryLines.length ? ['// Sources:', ...sourceSummaryLines.map((s) => `// - ${s}`)] : []),
    '',
    'export const rules = {',
  ].join('\n')

  const footer = ['}', ''].join('\n')

  return [header, bodyLines.join('\n'), footer].join('\n')
}

function emitMergedCookieHandlerJs(hostToCaseBlock, sourceSummaryLines) {
  const hostnames = Array.from(hostToCaseBlock.keys()).sort((a, b) => a.localeCompare(b))
  const cases = []
  for (const host of hostnames) {
    const block = hostToCaseBlock.get(host)
    // Re-indent all lines to 4 spaces inside switch for readability.
    const normalized = normalizeBlockIndent(block, '    ')
    cases.push(normalized)
  }

  const header = [
    '// Generated from extracted PR diffs (unmerged PRs only).',
    ...(sourceSummaryLines.length ? ['// Sources:', ...sourceSummaryLines.map((s) => `// - ${s}`)] : []),
    '',
    'export function getCookieHandlerOverride(hostname) {',
    '  switch (hostname) {',
  ].join('\n')

  const footer = ['    default:', '      return null', '  }', '}', ''].join('\n')

  return [header, cases.join('\n'), footer].join('\n')
}

function emitConcatenatedDiff(chunks) {
  const out = []
  out.push('// Generated from extracted PR diffs (unmerged PRs only).')
  out.push('// Note: this file is a concatenation of extracted unified-diff excerpts.')
  out.push('')
  for (const ch of chunks) {
    out.push(`/* ===== PR_${ch.prNumber} :: ${ch.relativePath} ===== */`)
    out.push(ch.text.trimEnd())
    out.push('')
  }
  return out.join('\n')
}

async function main() {
  if (!(await pathExists(PRS_DIR))) {
    console.error(`PRs directory not found: ${PRS_DIR}`)
    process.exitCode = 2
    return
  }

  const prEntries = await listDirEntries(PRS_DIR)
  const prDirs = prEntries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .map((name) => ({ name, prNumber: parsePrNumberFromDirname(name) }))
    .filter((x) => x.prNumber != null)
    .sort((a, b) => a.prNumber - b.prNumber)

  let scanned = 0
  let skippedMerged = 0

  // relativePath -> [{ prNumber, relativePath, absPath, text }]
  const grouped = new Map()

  for (const pr of prDirs) {
    scanned++
    const prDir = path.join(PRS_DIR, pr.name)
    const metaPath = path.join(prDir, 'meta.json')
    let meta = null
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
    } catch {
      // If meta is missing/corrupt, treat as unmerged and continue.
      meta = { merged: false }
    }
    if (meta?.merged === true) {
      skippedMerged++
      continue
    }

    const srcDir = path.join(prDir, 'src')
    if (!(await pathExists(srcDir))) continue

    const files = await walkFiles(srcDir)
    for (const absPath of files) {
      const relativePath = path.relative(prDir, absPath).split(path.sep).join('/')
      const text = await fs.readFile(absPath, 'utf8')
      if (!grouped.has(relativePath)) grouped.set(relativePath, [])
      grouped.get(relativePath).push({ prNumber: pr.prNumber, relativePath, absPath, text })
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true })

  const outputs = []
  for (const [relativePath, chunks] of grouped.entries()) {
    chunks.sort(compareByPrNumber)

    const outPath = path.join(OUT_DIR, relativePath)
    await fs.mkdir(path.dirname(outPath), { recursive: true })

    const sourceSummaryLines = chunks.map((c) => `PR_${c.prNumber}/${relativePath}`)

    if (relativePath === 'src/data/rules.js') {
      // hostname -> { prNumber, entryLines } where latest PR wins
      const merged = new Map()
      for (const ch of chunks) {
        const { adds, dels } = parseRulesEntriesFromExtractedDiff(ch.text)
        for (const [host, entryLines] of adds.entries()) {
          const prev = merged.get(host)
          if (!prev || ch.prNumber >= prev.prNumber) {
            merged.set(host, { prNumber: ch.prNumber, entryLines })
          }
        }
        for (const host of dels.values()) {
          if (adds.has(host)) continue // modified in same PR
          const prev = merged.get(host)
          if (!prev || ch.prNumber >= prev.prNumber) {
            merged.delete(host)
          }
        }
      }

      const hostToEntry = new Map()
      for (const [host, v] of merged.entries()) {
        hostToEntry.set(host, v.entryLines)
      }

      const outText = emitMergedRulesJs(hostToEntry, sourceSummaryLines)
      await fs.writeFile(outPath, outText, 'utf8')
      outputs.push({ relativePath, outPath, kind: 'merged-rules', count: hostToEntry.size })
      continue
    }

    if (relativePath === 'src/data/js/6_cookieHandler.js') {
      const merged = new Map()
      for (const ch of chunks) {
        const { adds, dels } = parseCookieHandlerCasesFromExtractedDiff(ch.text)
        for (const [host, caseLines] of adds.entries()) {
          const prev = merged.get(host)
          if (!prev || ch.prNumber >= prev.prNumber) {
            merged.set(host, { prNumber: ch.prNumber, caseLines })
          }
        }
        for (const host of dels.values()) {
          if (adds.has(host)) continue
          const prev = merged.get(host)
          if (!prev || ch.prNumber >= prev.prNumber) {
            merged.delete(host)
          }
        }
      }

      const hostToCaseBlock = new Map()
      for (const [host, v] of merged.entries()) {
        hostToCaseBlock.set(host, v.caseLines)
      }

      const outText = emitMergedCookieHandlerJs(hostToCaseBlock, sourceSummaryLines)
      await fs.writeFile(outPath, outText, 'utf8')
      outputs.push({
        relativePath,
        outPath,
        kind: 'merged-cookiehandler',
        count: hostToCaseBlock.size,
      })
      continue
    }

    const outText = emitConcatenatedDiff(chunks)
    await fs.writeFile(outPath, outText, 'utf8')
    outputs.push({ relativePath, outPath, kind: 'concat-diff', count: chunks.length })
  }

  outputs.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  console.log(`Scanned PR dirs: ${scanned}`)
  console.log(`Skipped merged PR dirs: ${skippedMerged}`)
  console.log(`Combined output dir: ${OUT_DIR}`)
  console.log('')
  for (const o of outputs) {
    const suffix =
      o.kind === 'merged-rules' || o.kind === 'merged-cookiehandler'
        ? `${o.count} merged entries`
        : `${o.count} chunks`
    console.log(`- ${o.relativePath} -> ${path.relative(ROOT_DIR, o.outPath)} (${o.kind}, ${suffix})`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

