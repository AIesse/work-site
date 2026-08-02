// Service Worker：实现 PWA 离线可打开（仅缓存同源的应用外壳与静态资源）
// 出于隐私考虑，不缓存跨域的 GitHub API 请求（含私有数据 + PAT），离线时仅能打开外壳、数据需联网加载。
//
// SW_VERSION 会在每次构建时被注入为构建时间戳（见 vite.config.js 的 inject-sw-version 插件），
// 使浏览器能检测到「有新版本」。新版本激活后，会强制刷新所有已打开的 PWA 窗口，
// 确保安装版始终运行最新代码，避免出现「浏览器已更新、PWA 仍跑旧代码（如保存失效）」的不一致。
const SW_VERSION = '1785661182553'
const CACHE = 'ep-shell-v1'
const APP_SHELL = ['./', './index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清理非当前版本的旧缓存（避免静态资源无限累积）
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      // 立即接管所有已打开的页面（包括尚未重新加载的 PWA 窗口）
      await self.clients.claim()
      // 强制刷新所有已打开的窗口，使其加载最新代码（旧版 PWA 也能借此自愈）
      const cls = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      for (const c of cls) {
        try {
          await c.navigate(c.url)
        } catch (_) {
          /* 某些客户端不支持 navigate，忽略 */
        }
      }
    })()
  )
})

// 允许页面主动要求跳过等待（配合前端的 reg.update()）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 只处理同源请求；跨域（api.github.com 等）直接放行，不缓存
  if (url.origin !== self.location.origin) return

  // 导航请求：优先网络，失败时回退已缓存的 index.html（支持离线打开）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    )
    return
  }

  // 静态资源（带 hash 的 assets）：cache-first，命中即返回，后台静默更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
