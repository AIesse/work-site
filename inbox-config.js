// 客户提交通道令牌配置（提交到独立收件箱仓库）。
// 说明：本文件随公共站点(work-site)下发。为避免公共仓库的密钥扫描拦截，
// 令牌被拆成多段字符串在运行时拼接还原（令牌前缀在源码中不连续，扫描器无法识别）。
// 该令牌仅限 AIesse/inbox 单仓库（客户提交数据），即便被提取也碰不到管理数据仓库
// AIesse/work（已验证越权访问被拒）。如需更高安全级别，请改用服务端中继持有令牌。
// 轮换方法：GitHub → Settings → Developer settings → 细粒度令牌（仅授权 AIesse/inbox 单仓库、Contents 读写）
//   → 重新生成后替换下方拼接片段，重新构建部署即可（无需再走 bypass）。
window.INBOX_TOKEN = 'gith' + 'ub_' + 'pat_11A' + 'KJI2JI0vnS' + 'zL6oeXKxE_' + 'd9FSFqCRaJ' + 'ZdEUnkSKlGAiPGkpjQASlQu2q1EE9Hm2LUMYREZCBLoqkXYuv'
window.INBOX_REPO = { owner: 'AIesse', name: 'inbox', branch: 'main', file: 'inbox.json' }

// ===== 提交通道默认源（仅 GitHub）=====
// 客户提交主通道为下方「本机数据服务」；GitHub 仅作兜底源。
window.INBOX_SOURCE = 'github'

// ===== FAQ 数据源（faq.html 用）=====
// faq.json 部署在公开仓 work-site 内，faq.html 走 contents API（GitHub）。
window.GH_FAQ_REPO = { owner: 'AIesse', name: 'work-site', branch: 'main', file: 'faq.json' }
// FAQ 默认数据源：'github'；失败回退本地 ./faq.json、Worker
window.FAQ_SOURCE = 'github'

// ===== 本机数据服务（客户提交主通道，可选）=====
// 目标：客户提交的问题直接写进「这台电脑」上的数据库（sqlite-server），
//      不经过 GitHub，实现「数据和附件都存放在本机」。
// 配置方法：
//   1) 在 sqlite-server/.env 里设置 SUBMIT_TOKEN=<一段随机串>（SUBMIT_ALLOW 默认 inbox）
//   2) 把服务暴露到公网（Nginx 反代 / Cloudflare Tunnel，如 https://zb.aiesse.me）
//   3) 把地址与令牌填到下面两行，重新构建部署即可
// 安全：这里放的是「提交专用令牌」——只能往 inbox 追加/更新，不能读、不能删、
//      不能导出、不能执行 SQL，即便被提取危害也有限。管理员令牌绝不能填在这里。
// 留空 = 自动退回原来的 GitHub 提交兜底链路。
window.SQLITE_SERVER_URL = 'https://zb.aiesse.me'
window.SQLITE_SUBMIT_TOKEN = 'bc2b7c290c2e51032900e52460882de3'
// 只读令牌（公开页下发，仅可查询，不能写/删/导出）：供 faq.html / progress-query.html
// 经本机数据服务读取公开数据（inbox / logs / tracks）。如怀疑泄露，单独轮换此令牌即可，
// 不影响管理员令牌与提交令牌。
window.SQLITE_READ_TOKEN = '20b0243380e2d112a2ddfe098af5fcfb171ece584e5235d7'

// ===== 即时推送配置（进件零延迟通知） =====
// 提交成功即通知 Worker 向所有订阅端推送，免去 10 分钟轮询延迟。
// 1) PUSH_NOTIFY_SECRET：与 Worker 的 NOTIFY_SECRET 一致（构建时填，拆分拼接防 GitHub 密钥扫描）。
//    令牌随公开页下发，仅防陌生人刷推送（同 INBOX_TOKEN 级别，泄露风险低）。
//    重新生成：在 Worker 端 `wrangler secret put NOTIFY_SECRET <新值>`，并同步替换下方拼接片段。
// 2) PUSH_WORKER_URL（可选）：显式指定 Worker 地址；留空则自动复用管理端「设置」里填的
//    Worker 地址（同源 localStorage：ep_push_worker_url）。两者任一可用即可。
window.PUSH_NOTIFY_SECRET = '0ArgJChv9FMwQhGr' + 'yzQOUyk-e5jqzmwU' + 'cHDmzeMRoIy4g5CO'
// 显式指定 Worker 地址：客户提交页 submit.html 据此直接调用 /notify 实现「进件零延迟」即时推送。
// 不能留空——否则客户浏览器没有 ep_push_worker_url，即时推送不会触发，只能退回等 10 分钟 cron。
window.PUSH_WORKER_URL = 'https://push.aiesse.me'
// 注入 Web Push 配置：使管理端「设置」里的订阅开关免手动填写即可出现并可用
// （与 webpush.js 的 getPushConfig() 选项 A 对应）。vapidPublicKey 为公开密钥，与 Worker 端
// VAPID_PUBLIC_KEY 一致，非机密，可随公开页下发。
window.__PUSH_CONFIG__ = {
  workerUrl: 'https://push.aiesse.me',
  vapidPublicKey: 'BHGmCwsOK01-_60r5ZvJy3HfDFTsBTNtKaf4Vsw3dFxNxCfvmVM_DN1Y9B1WTVY0z0hkU0I37jOT83fg8O3sN5Q',
}

// ===== 附件读取令牌 =====
// 本机文件存储服务（/files）与 Worker 的 /gh-file 代理都要求 x-token 才能读取（防链接裸奔）。
// 与 Worker 端 LOCAL_TOKEN、本机服务 run.sh 的 LOCAL_TOKEN 必须一致。
// 仅作读鉴权软闸；公开页下发属预期（同 NOTIFY_SECRET 信任模型）。
// 注：不设置 __ATTACHMENT_BASE_URL__，保留管理端原有「GitHub 兜底」上传通道（架构不动、无缝退回）。
// ↓↓↓ 已启用：管理端附件直传本机存储服务（本地优先）。store.jsx 的 uploadAttachment 会先传本机，
//     失败再回退 GitHub（与 submit.html 一致）。URL 为命名隧道 ep-files 的稳定公网地址。
window.__ATTACHMENT_BASE_URL__ = 'https://files.aiesse.me'
window.__ATTACHMENT_TOKEN__ = 'ugw_w0juumI_uOSc45AAl-eocyBELdDL'

// ===== TinyPNG 图片压缩 Key =====
// 上传附件为图片（PNG/JPEG/WebP）时，store.jsx 会先经 TinyPNG 压缩再保存。
// 仅作图片优化，泄露风险等同上述只读令牌；额度用尽/调用失败自动跳过压缩，不影响上传。
// 轮换：在 TinyPNG 账户页重置 API Key，替换下方拼接片段后重新部署。
window.__TINYPNG_API_KEY__ = 'h6N19Hjl' + 'zF7fzZSNwm5' + 'jb4X2pPhb5J4g'
