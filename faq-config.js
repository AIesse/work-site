// FAQ 页面数据源配置（公开文件，会被部署到 GitHub Pages，任何人可查看源码）。
//
// 方案：经 Cloudflare Worker 代理 /faq 获取实时问答数据——GitHub 令牌仅存于 Worker 服务端，
// 前端不持有任何令牌，杜绝令牌暴露风险。详见 deploy-push-worker/worker.js 的 /faq 端点。
//
// 只需填写 FAQ_WORKER_BASE（本推送 Worker 的部署地址），无需任何令牌字段。
// 留空（''）时，faq.html 自动回退到同目录预构建的 faq.json（由 scripts/gen-faq.mjs 生成）。
//
// 部署 Worker 前，需在 wrangler.toml 配置 FAQ_REPO/FAQ_BRANCH，并写入密钥
//   wrangler secret put FAQ_GITHUB_TOKEN   # 仅授权 AIesse/work 的只读 PAT
// （若该令牌同样覆盖 work 仓库，也可省略，/faq 会回退用 GITHUB_TOKEN）

// 推送 Worker 的部署地址（即 worker.js 的 fetch 根路径），/faq 端点在此持有 GitHub 令牌拉取问答数据。
window.FAQ_WORKER_BASE = 'https://enterprise-police-push.xiyiread.workers.dev'
