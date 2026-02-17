import esbuild from 'esbuild'
import { readdir, readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buildDir = join(__dirname, '..', 'build')

async function minifyJs(filePath) {
  const code = await readFile(filePath, 'utf8')
  const result = await esbuild.transform(code, {
    loader: 'js',
    minify: true,
  })
  await writeFile(filePath, result.code)
}

async function minifyCss(filePath) {
  const code = await readFile(filePath, 'utf8')
  const result = await esbuild.transform(code, {
    loader: 'css',
    minify: true,
  })
  await writeFile(filePath, result.code)
}

async function minifyData() {
  const dataJsDir = join(buildDir, 'data', 'js')
  const dataCssDir = join(buildDir, 'data', 'css')

  try {
    const jsFiles = await readdir(dataJsDir)
    for (const name of jsFiles) {
      if (name.endsWith('.js')) {
        const path = join(dataJsDir, name)
        await minifyJs(path)
        console.log('Minified:', path)
      }
    }
  } catch (err) {
    console.warn('data/js minify:', err.message)
  }

  const cssPath = join(dataCssDir, 'common.css')
  try {
    await minifyCss(cssPath)
    console.log('Minified:', cssPath)
  } catch (err) {
    console.warn('data/css/common.css minify:', err.message)
  }

  const rulesPath = join(buildDir, 'src', 'rules.json')
  try {
    const json = await readFile(rulesPath, 'utf8')
    const compact = JSON.stringify(JSON.parse(json))
    await writeFile(rulesPath, compact)
    console.log('Minified:', rulesPath)
  } catch (err) {
    console.warn('rules.json minify:', err.message)
  }
}

minifyData()
