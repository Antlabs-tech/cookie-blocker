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

let currentTab = false

protectionToggle.addEventListener('change', function () {
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || {}
    settings.enabled = protectionToggle.checked
    chrome.storage.local.set({ settings }, () => {
      chrome.runtime.sendMessage('update_settings')
      applyEnabledUI(settings.enabled)
    })
    chrome.runtime.sendMessage(
      {
        command: 'refresh_page',
        tabId: currentTab.id,
      },

      () => reloadMenu(),
    )
  })
})

toggle.addEventListener('click', function () {
  chrome.runtime.sendMessage(
    {
      command: 'toggle_extension',
      tabId: currentTab.id,
    },
    () => reloadMenu(),
  )
})

refresh.querySelector('button').addEventListener('click', function () {
  chrome.runtime.sendMessage(
    {
      command: 'refresh_page',
      tabId: currentTab.id,
    },
    () => window.close(),
  )
})

options.addEventListener('click', function () {
  chrome.sidePanel.open({ windowId: currentTab?.windowId })
  window.close()
})

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

reloadMenu()
