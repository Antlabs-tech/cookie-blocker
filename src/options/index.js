function saveOptions() {
  const whitelist = document.getElementById('whitelist').value.split('\n')
  const defaultActionEl = document.querySelector('input[name="default_action"]:checked')

  chrome.storage.local.get(
    { settings: { whitelistedDomains: {}, statusIndicators: true, defaultAction: 'reject', enabled: true } },
    (result) => {
      const settings = {
        ...result.settings,
        whitelistedDomains: {},
        statusIndicators: document.getElementById('status_indicators').checked,
        defaultAction: defaultActionEl ? defaultActionEl.value : 'reject',
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

      chrome.storage.local.set({ settings }, () => {
        document.getElementById('status_saved').style.display = 'inline'

        setTimeout(function () {
          document.getElementById('status_saved').style.display = 'none'
        }, 2000)

        chrome.runtime.sendMessage('update_settings')
      })
    },
  )
}

function restoreOptions() {
  chrome.storage.local.get(
    { settings: { whitelistedDomains: {}, statusIndicators: true, defaultAction: 'reject', enabled: true } },
    ({ settings }) => {
      document.getElementById('whitelist').value = Object.keys(settings.whitelistedDomains)
        .sort()
        .join('\n')
      document.getElementById('status_indicators').checked = settings.statusIndicators
      const action = settings.defaultAction === 'accept' ? 'accept' : 'reject'
      document.getElementById(`default_action_${action}`).checked = true
    },
  )
}

document.getElementById('save').setAttribute('value', 'Save settings')
document.getElementById('status_saved').textContent = 'Saved successfully'

document.addEventListener('DOMContentLoaded', restoreOptions)
document.getElementById('save').addEventListener('click', saveOptions)
