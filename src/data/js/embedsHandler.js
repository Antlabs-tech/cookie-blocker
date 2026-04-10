/**
 * Cookie Blocker - Embeds handler for cookie consent blocking
 * Copyright (C) 2026 Cookie Blocker contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Based on I-Still-Dont-Care-About-Cookies:
 * https://github.com/OhMyGuus/I-Still-Dont-Care-About-Cookies
 */

/*  Embeds handler */
/*  Handler is used to remove the cookie warning for certain embeds  */

;(function () {
  const classname = Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, '')

  const l = document.location
  let isAudioboom = false
  let isDailymotion = false
  let isDailybuzz = false
  let isPlayerclipslaliga = false

  switch (l.hostname) {
    case 'embeds.audioboom.com':
      isAudioboom = true
      break

    case 'www.dailymotion.com':
      isDailymotion = l.pathname.indexOf('/embed') === 0
      break

    case 'geo.dailymotion.com':
      isDailymotion = l.pathname.indexOf('/player') === 0
      break

    case 'dailybuzz.nl':
      isDailybuzz = l.pathname.indexOf('/buzz/embed') === 0
      break

    case 'playerclipslaliga.tv':
      isPlayerclipslaliga = true
      break
  }

  function searchEmbeds() {
    setTimeout(function () {
      // audioboom.com iframe embeds
      if (isAudioboom) {
        document
          .querySelectorAll(
            'div[id^="cookie-modal"] .modal[style*="block"] .btn.mrs:not(.' + classname + ')',
          )
          .forEach(function (button) {
            button.className += ' ' + classname
            button.click()
          })
      }

      // dailymotion.com iframe embeds
      else if (isDailymotion) {
        document
          .querySelectorAll('.np_DialogConsent-accept:not(.' + classname + ')')
          .forEach(function (button) {
            button.className += ' ' + classname
            button.click()
          })
      }

      // dailybuzz.nl iframe embeds
      else if (isDailybuzz) {
        document
          .querySelectorAll('#ask-consent #accept:not(.' + classname + ')')
          .forEach(function (button) {
            button.className += ' ' + classname
            button.click()
          })
      }

      // playerclipslaliga.tv iframe embeds
      else if (isPlayerclipslaliga) {
        document
          .querySelectorAll(
            '#cookies button[onclick*="saveCookiesSelection"]:not(.' + classname + ')',
          )
          .forEach(function (button) {
            button.className += ' ' + classname
            button.click()
          })
      }

      // Give up
      else {
        return
      }

      searchEmbeds()
    }, 1000)
  }

  const start = setInterval(function () {
    const html = document.querySelector('html')

    if (!html || new RegExp(classname).test(html.className)) {
      return
    }

    html.className += ' ' + classname
    searchEmbeds()
    clearInterval(start)
  }, 500)
})()
