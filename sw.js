// Service Worker：实现 PWA 离线可打开（仅缓存同源的应用外壳与静态资源）
// 出于隐私考虑，不缓存跨域的 GitHub API 请求（含私有数据 + PAT），离线时仅能打开外壳、数据需联网加载。
//
// SW_VERSION 会在每次构建时被注入为构建时间戳（见 vite.config.js 的 inject-sw-version 插件），
// 使浏览器能检测到「有新版本」。新版就绪后**不再由 SW 自行强制刷新页面**，
// 而是等待前端 main.jsx 发送 SKIP_WAITING，由前端在「更新进度提示」中平滑接管并重启，
// 避免无提示的突然刷新、并能在更新时向用户展示进度。
const SW_VERSION = '1785720275916'
const CACHE = 'ep-shell-v1'
const APP_SHELL = ['./', './index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)))
  // 兜底：若 10s 内前端未发送 SKIP_WAITING（异常场景），自动跳过等待，
  // 确保更新最终生效。正常情况由前端在「更新就绪」提示后主动触发。
  event.waitUntil(
    new Promise((resolve) => {
      setTimeout(() => {
        self.skipWaiting()
        resolve()
      }, 10000)
    })
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
      // 不再强制 navigate 所有窗口：更新进度与刷新时机统一由前端 main.jsx 控制，
      // 避免与「更新完成 → 手动 reload」重复刷新造成闪烁。
    })()
  )
})

// 允许页面主动要求跳过等待（配合前端的 reg.update() + 更新进度提示）
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
