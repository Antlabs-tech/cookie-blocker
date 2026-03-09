const toggle = document.getElementById('toggle')
const refresh = document.getElementById('refresh')
const report = document.getElementById('report')
const options = document.getElementById('options')
const statsLineContainer = document.getElementById('stats-line-container')
const refreshHostname = document.getElementById('refresh-hostname')
const protectionToggle = document.getElementById('protection-toggle')
const protectionStatus = document.getElementById('protection-status')
const protectionOffHint = document.getElementById('protection-off-hint')
const footerDot = document.getElementById('footer-dot')
const footerStatus = document.getElementById('footer-status')
const restrictedPageMessage = document.getElementById('restricted-page-message')

let currentTab = false

function showRestrictedPageMessage() {
  if (!restrictedPageMessage) return
  restrictedPageMessage.classList.remove('hidden')
  clearTimeout(restrictedPageMessage._hideTimer)
  restrictedPageMessage._hideTimer = setTimeout(() => {
    restrictedPageMessage.classList.add('hidden')
  }, 4000)
}

protectionToggle.addEventListener('change', function () {
  chrome.storage.sync.get(['settings'], (result) => {
    const settings = result.settings || {}
    settings.enabled = protectionToggle.checked
    chrome.storage.sync.set({ settings }, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage sync failed:', chrome.runtime.lastError.message)
        protectionToggle.checked = !settings.enabled
        applyEnabledUI(!settings.enabled)
        return
      }
      chrome.runtime.sendMessage('update_settings')
      applyEnabledUI(settings.enabled)
    })
    chrome.runtime.sendMessage(
      {
        command: 'refresh_page',
        tabId: currentTab.id,
      },
      (response) => {
        if (response?.error === 'restricted_page') {
          showRestrictedPageMessage()
        }
        reloadMenu()
      },
    )
  })
})

toggle.addEventListener('click', function () {
  chrome.runtime.sendMessage(
    {
      command: 'toggle_extension',
      tabId: currentTab.id,
    },
    (response) => {
      if (response?.error === 'restricted_page') {
        showRestrictedPageMessage()
      }
      reloadMenu()
    },
  )
})

refresh.querySelector('button').addEventListener('click', function () {
  chrome.runtime.sendMessage(
    {
      command: 'refresh_page',
      tabId: currentTab.id,
    },
    (response) => {
      if (response?.error === 'restricted_page') {
        showRestrictedPageMessage()
      } else {
        window.close()
      }
    },
  )
})

options.addEventListener('click', function () {
  chrome.sidePanel.open({ windowId: currentTab?.windowId })
  window.close()
})

if (report) {
  report.addEventListener('click', function () {
    chrome.runtime.sendMessage({ command: 'open_report_form', tabId: currentTab?.id }, () =>
      window.close(),
    )
  })
}

document
  .getElementById('error_back_button')
  .addEventListener('click', () => switchMenu('menu_main'))

function applyEnabledUI(enabled) {
  protectionToggle.checked = enabled
  protectionStatus.textContent = enabled ? 'Enabled' : 'Disabled'
  if (protectionOffHint) {
    protectionOffHint.classList.toggle('hidden', enabled)
  }
  if (footerDot) {
    footerDot.classList.toggle('bg-emerald-600', enabled)
    footerDot.classList.toggle('bg-slate-400', !enabled)
  }
  if (footerStatus) {
    footerStatus.textContent = enabled ? 'System Ready' : 'Protection off'
  }
  if (!enabled) {
    toggle.style.display = 'none'
    refresh.style.display = 'none'
    if (statsLineContainer) statsLineContainer.style.display = 'none'
  } else if (statsLineContainer) {
    statsLineContainer.style.display = ''
  }
  const statsEl = document.getElementById('stats-line')
  if (statsEl && !enabled) statsEl.textContent = '—'
}

function reloadMenu(enableRefreshButton) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.runtime.sendMessage(
      {
        command: 'get_active_tab',
        tabId: tabs[0].id,
      },
      function (message) {
        message = message || {}
        currentTab = message.tab ? message.tab : false
        const enabled = message.enabled !== false

        applyEnabledUI(enabled)

        // Apply dark mode from stored settings
        chrome.storage.sync.get({ settings: { darkMode: false } }, ({ settings }) => {
          document.documentElement.classList.toggle('dark', settings.darkMode)
        })

        if (enabled && message.tab && message.tab.hostname) {
          toggle.querySelector('p').textContent = message.tab.whitelisted
            ? `Resume on this site`
            : `Pause on this site`
          toggle.querySelector('#toggle-icon').textContent = message.tab.whitelisted
            ? 'play_circle'
            : 'pause_circle'

          toggle.style.display = 'flex'
          if (message.tab.whitelisted) {
            statsLineContainer.style.display = 'none'
            protectionOffHint.classList.toggle('hidden', false)
          } else {
            statsLineContainer.style.display = ''
            protectionOffHint.classList.toggle('hidden', true)
          }
        } else if (enabled) {
          toggle.querySelector('p').textContent = ''
          toggle.style.display = 'none'
        }

        if (report) {
          const isRestrictedPage = message?.tab && !message?.tab?.hostname
          report.style.display = enabled && !isRestrictedPage ? '' : 'none'
        }

        if (typeof enableRefreshButton != 'undefined' && enabled) {
          refreshHostname.textContent = message.tab?.hostname || ''
          refresh.style.display = 'block'
          toggle.style.display = 'none'
          statsLineContainer.style.display = 'none'
        }

        const statsEl = document.getElementById('stats-line')
        if (statsEl && enabled) {
          const n = message.dismissedCount
          if (typeof n === 'number' && n > 0) {
            statsEl.textContent =
              n === 1 ? '1 banner dismissed on this page' : `${n} banners dismissed on this page`
          } else {
            statsEl.textContent = 'Cookie banners auto-dismissed'
          }
        }
      },
    )
  })
}

function switchMenu(id) {
  const menus = document.getElementsByClassName('menu')
  for (let i = 0; i < menus.length; i++) {
    if (menus[i].id != id) {
      menus[i].classList.add('menu-hidden')
    } else {
      menus[i].classList.remove('menu-hidden')
    }
  }
}

const RATING_STORAGE_KEY = 'userRating'

function restoreRating() {
  chrome.storage.local.get([RATING_STORAGE_KEY], (result) => {
    const rating = result[RATING_STORAGE_KEY]
    if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
      const radio = document.getElementById(`fst-${rating}`)
      if (radio) radio.checked = true
    }
  })
}

function initRatingLinks() {
  document.querySelectorAll('.full-stars .rating-group label a').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault()
      const label = anchor.closest('label')
      const forId = label?.getAttribute('for')
      const rating = forId ? parseInt(forId.replace('fst-', ''), 10) : NaN
      if (rating >= 1 && rating <= 5) {
        chrome.storage.local.set({ [RATING_STORAGE_KEY]: rating }, () => {
          const radio = document.getElementById(`fst-${rating}`)
          if (radio) radio.checked = true
          if (anchor.href) window.open(anchor.href, '_blank', 'noopener,noreferrer')
        })
      } else if (anchor.href) {
        window.open(anchor.href, '_blank', 'noopener,noreferrer')
      }
    })
  })
}

chrome.storage?.sync?.get({ settings: { darkMode: false } }, ({ settings }) => {
  if (settings?.darkMode) document.documentElement.classList.add('dark')
})

initRatingLinks()
restoreRating()
reloadMenu()
