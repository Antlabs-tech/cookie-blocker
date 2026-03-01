import { defineManifest } from '@crxjs/vite-plugin'
import packageData from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_appName__',
  description: '__MSG_shortDesc__',
  default_locale: 'en',
  version: packageData.version,
  icons: {
    16: 'src/img/logo-16.png',
    32: 'src/img/logo-32.png',
    48: 'src/img/logo-48.png',
    128: 'src/img/logo-128.png',
  },
  author: 'Anton Zhirkov',
  permissions: [
    'tabs',
    'storage',
    'notifications',
    'webRequest',
    'declarativeNetRequestWithHostAccess',
    'webNavigation',
    'scripting',
  ],
  host_permissions: ['http://*/*', 'https://*/*'],
  background: {
    service_worker: 'src/background/index.js',
    type: 'module',
  },
  options_page: 'src/options.html',
  action: {
    default_popup: 'src/popup.html',
    default_icon: 'src/img/logo-48.png',
  },
  declarative_net_request: {
    rule_resources: [
      {
        id: 'ruleset_1',
        enabled: true,
        path: 'src/rules.json',
      },
    ],
  },
})
