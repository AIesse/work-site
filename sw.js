// Service Worker：实现 PWA 离线可打开（仅缓存同源的应用外壳与静态资源）
// 出于隐私考虑，不缓存跨域的 GitHub API 请求（含私有数据 + PAT），离线时仅能打开外壳、数据需联网加载。
//
// SW_VERSION 会在每次构建时被注入为构建时间戳（见 vite.config.js 的 inject-sw-version 插件），
// 使浏览器能检测到「有新版本」。新版就绪后**不再由 SW 自行强制刷新页面**，
// 而是等待前端 main.jsx 发送 SKIP_WAITING，由前端在「更新进度提示」中平滑接管并重启，
// 避免无提示的突然刷新、并能在更新时向用户展示进度。
const SW_VERSION = '1.0.267+202610100402'
const CACHE = 'ep-shell-v3'
// 双入口：index.html（shadcn 新版）与 classic.html（经典原版）都要预缓存，
// 否则离线时切到另一套入口会打不开。
const APP_SHELL = ['./', './index.html', './classic.html']
// 首屏必需资源清单：构建时由 vite.config.js 的 `inject-precache-manifest` 插件注入（占位为空数组）。
//
// 为什么必须有它：index.html 走 network-first（总能拿到最新），而 JS/CSS 走 cache-first（只在访问过时才缓存）。
// 一旦出现「缓存里 index.html 是新版、但它引用的 main-<新hash>.js 还没进缓存」，离线打开时这个 JS 请求
// 既没命中缓存、又发不出网络请求 → 主包加载失败 → React 根本起不来 → **白屏**（且顶层 ErrorBoundary
// 也救不了，因为它连 JS 都没执行到）。
// 把「同一次构建产出的 index.html + JS/CSS」作为一个整体在安装阶段一次性预缓存，版本永远一致。
const PRECACHE_MANIFEST = ["./","./index.html","./classic.html","./inbox-config.js","./manifest.webmanifest","./icon-192.png","./assets/main-Cm7zdDpp.js","./assets/theme-CZ3xfSgk.js","./assets/main-Dzh1p5iG.css","./assets/classic-AHm-UwLX.js","./assets/classic-DLg97I_f.css"]

// 第三方统计/分析脚本的域名清单（见 fetch 事件里的说明：加超时短路，避免阻塞应用主包）
const THIRD_PARTY_ANALYTICS = [
  'static.cloudflareinsights.com',
  'cloudflareinsights.com',
  'performance.radar.cloudflare.com',
]
const emptyScript = () =>
  new Response('/* offline: analytics skipped */', {
    status: 200,
    headers: { 'Content-Type': 'application/javascript' },
  })

self.addEventListener('install', (event) => {
  const list = PRECACHE_MANIFEST.length ? PRECACHE_MANIFEST : APP_SHELL
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(list))
      .catch(() => {
        // 预缓存部分失败（如网络中断）也不阻断安装：否则 SW 永远停在旧版本、用户更用不上新功能。
        // 缺的资源会在之后联网访问时由 cache-first 分支补进缓存。
        return caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
      })
  )
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

  // 第三方统计脚本（Cloudflare Web Analytics 等在边缘注入的 beacon.min.js）：
  // 它是跨域资源 → 按设计不进缓存 → 离线时必然拿不到。若让它自然超时（DNS / 连接超时可达数十秒），
  // 而它在文档里的位置又排在应用主包之前，defer 脚本按文档顺序执行就会把主包一起卡住 → **白屏**。
  // 处理：一律走「最多等 1.5 秒，超时或失败就短路成空 JS」。
  // 这里**刻意不用 navigator.onLine 判断**：iOS 上 SW 里的 navigator.onLine 并不总可靠，
  // 一旦误判为在线就会放过这个注定失败的请求，白屏依旧。改成无条件超时兜底，各平台行为一致。
  // 代价只是网络差时丢掉访问统计，业务不受影响。
  if (THIRD_PARTY_ANALYTICS.indexOf(url.hostname) !== -1) {
    event.respondWith(
      Promise.race([
        fetch(req).catch(() => emptyScript()),
        new Promise((resolve) => setTimeout(() => resolve(emptyScript()), 1500)),
      ])
    )
    return
  }

  // 只处理同源请求；跨域（api.github.com 等）直接放行，不缓存
  if (url.origin !== self.location.origin) return

  // 导航请求：stale-while-revalidate（有缓存先用、后台静默更新）。
  //
  // 为什么不用 network-first：离线（或网络极慢、隧道抖动）时 network-first 要等网络超时才回退缓存，
  // 期间页面一片空白；更糟的是若网络请求恰好「部分成功」，可能出现缓存里的 index.html 是新版、
  // 它引用的 hash JS 却还没进缓存的组合 → 主包加载失败 → 白屏。
  // 改成 SWR 后：① 有缓存就立即返回，秒开且离线一定打得开；② 后台拉取新版并写回缓存，
  // 下一次进入（或前端检测到新 SW 后提示刷新）即生效——与已有的「更新进度提示」机制衔接。
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // 离线回退顺序：与本次导航地址相同的入口（classic.html / index.html）→ 兜底 index.html → './'
        // 保证经典原版入口离线时不会被打回 shadcn 界面形成来回跳转。
        const cached =
          (await caches.match(url.pathname)) ||
          (await caches.match('./index.html')) ||
          (await caches.match('./'))
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              // 同时按「请求 URL」和「./index.html」两个键写入，
              // 这样无论下次导航到 '/' 还是 '/index.html' 都能命中到刚更新的版本。
              const copy = res.clone()
              caches
                .open(CACHE)
                .then((c) => c.put(req, copy).catch(() => {}).then(() => c.put('./index.html', res.clone()).catch(() => {})))
                .catch(() => {})
            }
            return res
          })
          .catch(() => null)
        if (cached) return cached
        const res = await network
        return (
          res ||
          new Response('<!doctype html><meta charset="utf-8"><title>离线</title>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        )
      })()
    )
    return
  }

  // Service Worker 自身（sw.js）：network-first，确保①读取版本号(getCurrentVersion)
  // 能拿到线上最新文本、②SW 自身更新不被旧缓存卡住；离线时回退已缓存版本。
  if (url.pathname.endsWith('/sw.js')) {
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
