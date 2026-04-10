/**
 * Cookie Blocker - Session storage handler for cookie consent blocking
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

/*  Session storage handler */
/*  Use this handler if it's possible to remove the warning using the session storage and can't be handeld using css*/

function getItem(hostname) {
  switch (hostname) {
    case 'pepephone.com':
      return { strict: true, key: 'cookiesChosen', value: 'done' }
  }

  const parts = hostname.split('.')

  if (parts.length > 2) {
    parts.shift()
    return getItem(parts.join('.'))
  }

  return false
}

;(function () {
  const hostname = document.location.hostname.replace(/^w{2,3}\d*\./i, '')
  const item = getItem(hostname)

  if (item) {
    const value = sessionStorage.getItem(item.key)

    if (value == null || (item.strict && value != item.value)) {
      sessionStorage.setItem(item.key, item.value)
      document.location.reload()
    }
  }
})()
