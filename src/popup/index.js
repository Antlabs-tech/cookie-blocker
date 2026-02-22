const toggle = document.getElementById('toggle')
const refresh = document.getElementById('refresh')
const report = document.getElementById('report')
const options = document.getElementById('options')
const statsLineContainer = document.getElementById('stats-line-container')
const refreshHostname = document.getElementById('refresh-hostname')

let currentTab = false

toggle.addEventListener('click', function () {
  chrome.runtime.sendMessage(
    {
      command: 'toggle_extension',
      tabId: currentTab.id,
    },
    () => reloadMenu(true),
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
  chrome.runtime.sendMessage(
    {
      command: 'open_options_page',
    },
    () => window.close(),
  )
})

document
  .getElementById('error_back_button')
  .addEventListener('click', () => switchMenu('menu_main'))

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

        if (message.tab && message.tab.hostname) {
          toggle.querySelector('p').textContent = message.tab.whitelisted
            ? `Resume on this site`
            : `Pause on this site`
          toggle.querySelector('#toggle-icon').textContent = message.tab.whitelisted
            ? 'play_circle'
            : 'pause_circle'

          toggle.style.display = 'flex'
          if (message.tab.whitelisted) {
            statsLineContainer.style.display = 'none'
          }
        } else {
          toggle.querySelector('p').textContent = ''
          toggle.style.display = 'none'
        }

        if (typeof enableRefreshButton != 'undefined') {
          refreshHostname.textContent = message.tab.hostname
          refresh.style.display = 'block'
          toggle.style.display = 'none'
          statsLineContainer.style.display = 'none'
        }

        const statsEl = document.getElementById('stats-line')
        if (statsEl) {
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
