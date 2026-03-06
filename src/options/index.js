const defaultSettings = {
  whitelistedDomains: {},
  statusIndicators: true,
  defaultAction: 'reject',
  enabled: true,
  darkMode: false,
}

function applyDarkMode(enabled) {
  document.documentElement.classList.toggle('dark', enabled)
}

function saveOptions() {
  const whitelist = document.getElementById('whitelist').value.split('\n')
  const defaultActionEl = document.querySelector('input[name="default_action"]:checked')

  chrome.storage.sync.get({ settings: defaultSettings }, (result) => {
    const settings = {
      ...result.settings,
      whitelistedDomains: {},
      statusIndicators: document.getElementById('status_indicators').checked,
      defaultAction: defaultActionEl ? defaultActionEl.value : 'reject',
      darkMode: document.getElementById('dark_mode').checked,
    }

    whitelist.forEach((line) => {
      line = line
        .trim()
        .replace(/^\w*:?\/+/i, '')
        .replace(/^w{2,3}\d*\./i, '')
        .split('/')[0]
        .split(':')[0]

      if (line.length > 0 && line.length < 100) {
        settings.whitelistedDomains[line] = true
      }
    })

    chrome.storage.sync.set({ settings }, () => {
      const statusEl = document.getElementById('status_saved')
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || ''
        const isQuota = /quota|QUOTA/i.test(msg)
        statusEl.textContent = isQuota
          ? 'Sync quota exceeded. Try fewer whitelisted domains.'
          : `Save failed: ${msg}`
        statusEl.style.display = 'inline'
        setTimeout(() => { statusEl.style.display = 'none' }, 5000)
        return
      }
      statusEl.textContent = 'Saved successfully'
      statusEl.style.display = 'inline'
      setTimeout(function () {
        statusEl.style.display = 'none'
      }, 2000)
      chrome.runtime.sendMessage('update_settings')
    })
  })
}

function restoreOptions() {
  chrome.storage.sync.get({ settings: defaultSettings }, ({ settings }) => {
    document.getElementById('whitelist').value = Object.keys(settings.whitelistedDomains)
      .sort()
      .join('\n')
    document.getElementById('status_indicators').checked = settings.statusIndicators
    const action = settings.defaultAction === 'accept' ? 'accept' : 'reject'
    document.getElementById(`default_action_${action}`).checked = true
    document.getElementById('dark_mode').checked = settings.darkMode
    applyDarkMode(settings.darkMode)
  })
}

document.getElementById('save').setAttribute('value', 'Save settings')
document.getElementById('status_saved').textContent = 'Saved successfully'

document.addEventListener('DOMContentLoaded', restoreOptions)
document.getElementById('save').addEventListener('click', saveOptions)

// Apply dark mode instantly on toggle (no need to wait for Save)
document.getElementById('dark_mode').addEventListener('change', (e) => {
  applyDarkMode(e.target.checked)
  saveOptions()
})

chrome.storage?.sync?.get({ settings: { darkMode: false } }, ({ settings }) => {
  if (settings?.darkMode) document.documentElement.classList.add('dark')
})
