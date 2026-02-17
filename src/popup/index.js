const toggle = document.getElementById('toggle')
const refresh = document.getElementById('refresh')
const report = document.getElementById('report')
const options = document.getElementById('options')

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

refresh.addEventListener('click', function () {
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
          toggle.textContent = message.tab.whitelisted
            ? `Enable extension on ${message.tab.hostname}`
            : `Disable extension on ${message.tab.hostname}`

          toggle.style.display = 'block'
        } else {
          toggle.textContent = ''
          toggle.style.display = 'none'
        }

        if (typeof enableRefreshButton != 'undefined') {
          refresh.style.display = 'block'
          toggle.style.display = 'none'
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
