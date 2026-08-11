// Service Worker：实现 PWA 离线可打开（仅缓存同源的应用外壳与静态资源）
// 出于隐私考虑，不缓存跨域的 GitHub API 请求（含私有数据 + PAT），离线时仅能打开外壳、数据需联网加载。
//
// SW_VERSION 会在每次构建时被注入为构建时间戳（见 vite.config.js 的 inject-sw-version 插件），
// 使浏览器能检测到「有新版本」。新版就绪后**不再由 SW 自行强制刷新页面**，
// 而是等待前端 main.jsx 发送 SKIP_WAITING，由前端在「更新进度提示」中平滑接管并重启，
// 避免无提示的突然刷新、并能在更新时向用户展示进度。
const SW_VERSION = '1786419686796'
const CACHE = 'ep-shell-v2'
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
  const data = event.data || {}
  if (data.type === 'SKIP_WAITING') self.skipWaiting()
  else if (data.type === 'keepalive') {
    // 收到心跳即唤醒 SW（事件本身让 SW 保持活跃）；回执给发送方以确认链路通畅
    if (event.source && event.source.postMessage) {
      try {
        event.source.postMessage({ type: 'keepalive_ack', t: data.t })
      } catch (_) {
        /* ignore */
      }
    }
  }
})

// 点击通知：聚焦已打开的 PWA 窗口（或新开一个），并跳转到问题清单
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.path) || '/?view=inbox'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) {
          try {
            await c.focus()
            if (c.navigate) c.navigate(target)
          } catch (_) {}
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })()
  )
})

// Web Push 推送到达：Worker 发的是「空载荷」信号，展示本地化通用通知；
// 若日后携带载荷（event.data 不为空），优先解析 title/body。
self.addEventListener('push', (event) => {
  let title = '印章业务信息管理系统'
  let body = '有新的问题清单待处理，请打开应用查看'
  try {
    if (event.data) {
      const p = event.data.json()
      if (p && p.title) title = p.title
      if (p && p.body) body = p.body
    }
  } catch (_) {
    /* 解析失败则用默认文案 */
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'ep-inbox',
      renotify: true,
      data: { path: '/?view=inbox' },
    })
  )
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

  // 非哈希配置文件（inbox-config.js）：network-first，确保配置变更（如附件服务器地址）
  // 即时生效，不被 cache-first 的陈旧缓存卡住；离线时回退已缓存版本。
  if (url.pathname.endsWith('/inbox-config.js')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req))
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
