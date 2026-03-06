/*  Google handler */
/*  Handler is only used for Google */

;(function () {
  function _sl(selector, container) {
    return (container || document).querySelector(selector)
  }

  const readLocalStorage = async (key) => {
    return new Promise((resolve) => {
      try {
        if (!chrome?.storage?.sync) {
          resolve(undefined)
          return
        }
        chrome.storage.sync.get([key], function (result) {
          try {
            if (chrome.runtime?.id === undefined) {
              resolve(undefined)
              return
            }
            resolve(result[key])
          } catch (_) {
            resolve(undefined)
          }
        })
      } catch (_) {
        resolve(undefined)
      }
    })
  }

  const mainInterval = setInterval(function () {
  const html = _sl('html')

  if (!html || /idc8_343/.test(html.className)) {
    return
  }

  clearInterval(mainInterval)

  html.className += ' idc8_343'

  let counter = 0
  const interval = setInterval(
    async function () {
      let element

      if (document.location.hostname.split('.')[0] == 'consent') {
        if (document.location.pathname == '/m') {
          element = _sl(
            'form[action*="//consent."][action$="/s"] button, form[action*="//consent."][action$="/save"] button',
          )

          if (element) {
            element.click()
            counter = 299
          }
        }

        // Mobile only, ie google.co.uk (or in FF Nightly, on google.com search results)
        else if (document.location.pathname == '/ml') {
          element = _sl('.saveButtonContainerNarrowScreen > form:last-child .button')

          if (element) {
            element.click()
            counter = 299
          }
        }
      }

      // https://www.google.com/finance/
      else if (
        document.location.hostname == 'ogs.google.com' &&
        document.location.pathname == '/widget/callout'
      ) {
        if (
          document
            .evaluate(
              '//span[contains(text(), "This site uses cookies")]',
              document,
              null,
              XPathResult.ANY_TYPE,
              null,
            )
            .iterateNext()
        ) {
          _sl('button').click()
          counter = 299
        }
      } else {
        // The latest cookie popup, desktop and mobile

        const container = _sl('div[aria-modal="true"][style*="block"]')
        let settings = await readLocalStorage('settings')
        const wantReject = settings?.defaultAction === 'reject'

        if (container && _sl('a[href*="policies.google.com/technologies/cookies"]', container)) {
          // First button = Reject all, second = Accept all
          const btn = wantReject ? _sl('button', container) : _sl('button + button', container)
          if (btn) btn.click()
          else _sl('button + button', container).click()
          _sl('button + button', container).click()

          // Autofocus on the search field
          element = _sl(
            'form[role="search"][action="/search"]:not([id]) input[aria-autocomplete="both"]',
          )
          if (element) element.focus()

          counter = 299
        }

        // General privacy reminder
        element = _sl(
          'form[action^="/signin/privacyreminder"] > div > span > div:not([role]) > div:not([tabindex]) span + div',
        )
        if (element) element.click()

        // #cns=1
        if (document.location.hash == '#cns=1') {
          document.location.hash = '#cns=0'
        }
      }

      counter++

      if (counter == 300) {
        clearInterval(interval)
      }
    },
    250 + counter * 10,
  )
}, 250)
})()
