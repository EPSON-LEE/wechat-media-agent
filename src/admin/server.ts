import fs from "node:fs";
import http, { type ServerResponse } from "node:http";
import path from "node:path";
import { URL } from "node:url";
import {
  defaultAdminSettings,
  loadAdminSettings,
  loadMediaRecords,
  saveAdminSettings,
  type AdminSettings,
} from "./settings.js";
import { buildChatInsights } from "../analytics/chat-store.js";

export interface AdminServerOptions {
  storageDir: string;
  host: string;
  port: number;
  log: (msg: string) => void;
}

export async function startAdminServer(opts: AdminServerOptions): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, opts).catch((err) => {
      sendJson(res, 500, { error: String(err) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;
  opts.log(`Admin pages listening at http://${opts.host}:${port}`);
  return server;
}

async function handleRequest(
  req: http.IncomingMessage,
  res: ServerResponse,
  opts: AdminServerOptions,
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (method === "GET" && url.pathname === "/") {
    redirect(res, "/media");
    return;
  }

  if (method === "GET" && url.pathname === "/settings") {
    sendHtml(res, settingsPage());
    return;
  }

  if (method === "GET" && url.pathname === "/media") {
    sendHtml(res, mediaPage());
    return;
  }

  if (method === "GET" && url.pathname === "/insights") {
    sendHtml(res, insightsPage());
    return;
  }

  if (method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, {
      settings: loadAdminSettings(opts.storageDir),
      storageDir: opts.storageDir,
    });
    return;
  }

  if ((method === "POST" || method === "PUT") && url.pathname === "/api/settings") {
    const body = await readJson(req);
    const settings = sanitizeSettings(body?.settings ?? body);
    saveAdminSettings(opts.storageDir, settings);
    sendJson(res, 200, { settings });
    return;
  }

  if (method === "GET" && url.pathname === "/api/media") {
    sendJson(res, 200, { records: loadMediaRecords(opts.storageDir) });
    return;
  }

  if (method === "GET" && url.pathname === "/api/insights") {
    sendJson(res, 200, buildChatInsights(opts.storageDir));
    return;
  }

  const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)\/file$/);
  if (method === "GET" && mediaMatch) {
    await sendMediaFile(res, opts.storageDir, decodeURIComponent(mediaMatch[1]));
    return;
  }

  sendText(res, 404, "Not found");
}

async function sendMediaFile(res: ServerResponse, storageDir: string, id: string): Promise<void> {
  const record = loadMediaRecords(storageDir).find((item) => item.id === id);
  if (!record) {
    sendText(res, 404, "Media not found");
    return;
  }

  const filePath = path.resolve(record.localPath);
  if (!fs.existsSync(filePath)) {
    sendText(res, 404, "Media file is missing");
    return;
  }

  res.writeHead(200, {
    "Content-Type": guessMimeType(filePath),
    "Content-Length": fs.statSync(filePath).size,
    "Cache-Control": "private, max-age=60",
  });
  fs.createReadStream(filePath).pipe(res);
}

function sanitizeSettings(input: unknown): AdminSettings {
  const defaults = defaultAdminSettings();
  const media = typeof input === "object" && input && "media" in input
    ? (input as Partial<AdminSettings>).media
    : undefined;

  return {
    media: {
      localDir: stringValue(media?.localDir),
      publicBaseUrl: stringValue(media?.publicBaseUrl),
      ossProvider: stringValue(media?.ossProvider),
      ossBucket: stringValue(media?.ossBucket),
      ossEndpoint: stringValue(media?.ossEndpoint),
      ossPrefix: stringValue(media?.ossPrefix),
      includePublicUrlInPrompt: media?.includePublicUrlInPrompt ?? defaults.media.includePublicUrlInPrompt,
    },
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/aac",
    amr: "audio/amr",
  };
  return map[ext] ?? "application/octet-stream";
}

function shell(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WeChat Media Agent</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1b1d22;
      --muted: #6b7280;
      --line: #d7dee8;
      --surface: #f7f9fb;
      --panel: #ffffff;
      --accent: #107c41;
      --accent-ink: #ffffff;
      --warn: #b45309;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--surface);
      font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }
    .wrap {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
    }
    .topbar {
      min-height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0;
    }
    nav {
      display: flex;
      gap: 8px;
    }
    nav a {
      color: var(--ink);
      text-decoration: none;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid transparent;
    }
    nav a[aria-current="page"] {
      border-color: var(--line);
      background: #eef6f0;
      color: #0f6b39;
    }
    main {
      padding: 24px 0 48px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0;
    }
    .muted {
      color: var(--muted);
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      padding: 20px;
    }
    label {
      display: grid;
      gap: 6px;
      color: #374151;
      font-weight: 600;
    }
    input, select {
      width: 100%;
      min-height: 38px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      font: inherit;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }
    .check input {
      width: 18px;
      min-height: 18px;
    }
    .actions {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: 4px;
    }
    button {
      min-height: 38px;
      border: 0;
      border-radius: 6px;
      padding: 8px 14px;
      background: var(--accent);
      color: var(--accent-ink);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .status {
      color: var(--accent);
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: #4b5563;
      background: #fbfcfd;
      font-size: 12px;
      text-transform: uppercase;
    }
    .preview {
      width: 84px;
      height: 64px;
      border: 1px solid var(--line);
      border-radius: 6px;
      object-fit: cover;
      background: #eef2f7;
      display: block;
    }
    .path {
      max-width: 520px;
      overflow-wrap: anywhere;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .empty {
      padding: 28px;
      color: var(--muted);
      text-align: center;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .metric strong {
      display: block;
      font-size: 24px;
      line-height: 1.2;
    }
    .split {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr);
      gap: 16px;
      align-items: start;
    }
    .section {
      margin-bottom: 16px;
    }
    .section h3 {
      margin: 0;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      font-size: 15px;
    }
    .summary {
      margin: 0;
      padding: 14px 18px 18px 32px;
    }
    .summary li {
      margin: 7px 0;
    }
    .timeline {
      display: grid;
    }
    .message {
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .message:last-child {
      border-bottom: 0;
    }
    .message-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
    }
    .message-text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .tagrow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 14px 16px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fbfcfd;
      font-size: 12px;
    }
    .bars {
      display: grid;
      gap: 10px;
      padding: 14px 16px;
    }
    .bar {
      display: grid;
      grid-template-columns: 90px minmax(0, 1fr) 40px;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .bar-track {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: #e5eaf1;
    }
    .bar-fill {
      height: 100%;
      background: var(--accent);
    }
    @media (max-width: 760px) {
      .topbar, .toolbar {
        align-items: flex-start;
        flex-direction: column;
      }
      .form {
        grid-template-columns: 1fr;
      }
      .metrics, .split {
        grid-template-columns: 1fr;
      }
      table, thead, tbody, tr, th, td {
        display: block;
      }
      thead {
        display: none;
      }
      tr {
        border-bottom: 1px solid var(--line);
      }
      td {
        border-bottom: 0;
        padding: 8px 12px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap topbar">
      <h1>WeChat Media Agent</h1>
      <nav>
        <a href="/media" data-nav="media">媒体</a>
        <a href="/insights" data-nav="insights">洞察</a>
        <a href="/settings" data-nav="settings">设置</a>
      </nav>
    </div>
  </header>
  <main class="wrap" id="app"></main>
  <script>
    for (const link of document.querySelectorAll("nav a")) {
      if (link.getAttribute("href") === location.pathname) {
        link.setAttribute("aria-current", "page");
      }
    }
  </script>`;
}

function settingsPage(): string {
  return `${shell()}
  <script>
    const app = document.querySelector("#app");
    app.innerHTML = \`
      <div class="toolbar">
        <div>
          <h2>媒体存储设置</h2>
          <div class="muted">保存本地目录、OSS/公开访问前缀，以及传给 agent 的媒体 URL。</div>
        </div>
      </div>
      <section class="panel">
        <form class="form" id="settings-form">
          <label class="wide">
            本地媒体目录
            <input name="localDir" placeholder="留空则使用默认 ~/.wechat-media-agent/media">
          </label>
          <label>
            OSS/公开访问基础 URL
            <input name="publicBaseUrl" placeholder="https://bucket.oss-cn-region.aliyuncs.com">
          </label>
          <label>
            OSS Key 前缀
            <input name="ossPrefix" placeholder="wechat-media">
          </label>
          <label>
            OSS Provider
            <select name="ossProvider">
              <option value="">未配置</option>
              <option value="aliyun">Aliyun OSS</option>
              <option value="tencent">Tencent COS</option>
              <option value="qiniu">Qiniu Kodo</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Bucket
            <input name="ossBucket" placeholder="bucket-name">
          </label>
          <label class="wide">
            Endpoint
            <input name="ossEndpoint" placeholder="oss-cn-hangzhou.aliyuncs.com">
          </label>
          <label class="check wide">
            <input type="checkbox" name="includePublicUrlInPrompt">
            保存后把公开 URL 一起传给 agent
          </label>
          <div class="actions">
            <button type="submit">保存设置</button>
            <span class="status" id="status"></span>
          </div>
        </form>
      </section>
    \`;

    const form = document.querySelector("#settings-form");
    const statusEl = document.querySelector("#status");

    async function load() {
      const res = await fetch("/api/settings");
      const data = await res.json();
      const media = data.settings.media;
      form.localDir.value = media.localDir || "";
      form.publicBaseUrl.value = media.publicBaseUrl || "";
      form.ossProvider.value = media.ossProvider || "";
      form.ossBucket.value = media.ossBucket || "";
      form.ossEndpoint.value = media.ossEndpoint || "";
      form.ossPrefix.value = media.ossPrefix || "";
      form.includePublicUrlInPrompt.checked = Boolean(media.includePublicUrlInPrompt);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      statusEl.textContent = "保存中...";
      const settings = {
        media: {
          localDir: form.localDir.value,
          publicBaseUrl: form.publicBaseUrl.value,
          ossProvider: form.ossProvider.value,
          ossBucket: form.ossBucket.value,
          ossEndpoint: form.ossEndpoint.value,
          ossPrefix: form.ossPrefix.value,
          includePublicUrlInPrompt: form.includePublicUrlInPrompt.checked,
        },
      };
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) {
        statusEl.textContent = "保存失败";
        return;
      }
      statusEl.textContent = "已保存";
      setTimeout(() => statusEl.textContent = "", 1800);
    });

    load();
  </script>
</body>
</html>`;
}

function mediaPage(): string {
  return `${shell()}
  <script>
    const app = document.querySelector("#app");
    app.innerHTML = \`
      <div class="toolbar">
        <div>
          <h2>媒体展示</h2>
          <div class="muted">显示微信消息保存下来的图片、视频和语音文件。</div>
        </div>
        <button id="refresh">刷新</button>
      </div>
      <section class="panel" id="media-panel">
        <div class="empty">加载中...</div>
      </section>
    \`;

    const panel = document.querySelector("#media-panel");
    document.querySelector("#refresh").addEventListener("click", load);

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\\"": "&quot;",
        "'": "&#039;",
      }[char]));
    }

    function preview(record) {
      const src = "/api/media/" + encodeURIComponent(record.id) + "/file";
      if (record.type === "image") return \`<img class="preview" src="\${src}" alt="\${escapeHtml(record.fileName)}">\`;
      if (record.type === "video") return \`<video class="preview" src="\${src}" muted controls></video>\`;
      if (record.type === "voice") return \`<audio src="\${src}" controls></audio>\`;
      return \`<span class="muted">无预览</span>\`;
    }

    function formatSize(bytes) {
      if (!Number.isFinite(bytes)) return "-";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1024 / 1024).toFixed(1) + " MB";
    }

    async function load() {
      const res = await fetch("/api/media");
      const data = await res.json();
      const records = data.records || [];
      if (!records.length) {
        panel.innerHTML = '<div class="empty">还没有保存的媒体。收到微信图片、视频或语音后会显示在这里。</div>';
        return;
      }
      panel.innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>预览</th>
              <th>类型</th>
              <th>文件</th>
              <th>大小</th>
              <th>时间</th>
              <th>公开 URL</th>
            </tr>
          </thead>
          <tbody>
            \${records.map((record) => \`
              <tr>
                <td>\${preview(record)}</td>
                <td>\${escapeHtml(record.type)}</td>
                <td><div class="path">\${escapeHtml(record.localPath)}</div></td>
                <td>\${formatSize(record.size)}</td>
                <td>\${escapeHtml(new Date(record.createdAt).toLocaleString())}</td>
                <td><div class="path">\${record.publicUrl ? '<a href="' + escapeHtml(record.publicUrl) + '" target="_blank" rel="noreferrer">' + escapeHtml(record.publicUrl) + '</a>' : '<span class="muted">未配置</span>'}</div></td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
      \`;
    }

    load();
  </script>
</body>
</html>`;
}

function insightsPage(): string {
  return `${shell()}
  <script>
    const app = document.querySelector("#app");
    app.innerHTML = \`
      <div class="toolbar">
        <div>
          <h2>聊天洞察</h2>
          <div class="muted">记录聊天轨迹、热力词、资源发送情况和基础分析。</div>
        </div>
        <button id="refresh">刷新</button>
      </div>
      <div id="insights-root">
        <div class="empty panel">加载中...</div>
      </div>
    \`;

    const root = document.querySelector("#insights-root");
    document.querySelector("#refresh").addEventListener("click", load);

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\\"": "&quot;",
        "'": "&#039;",
      }[char]));
    }

    function formatSize(bytes) {
      if (!Number.isFinite(bytes)) return "-";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1024 / 1024).toFixed(1) + " MB";
    }

    function metric(label, value, hint) {
      return \`
        <div class="metric">
          <strong>\${escapeHtml(value)}</strong>
          <span>\${escapeHtml(label)}</span>
          <div class="muted">\${escapeHtml(hint || "")}</div>
        </div>
      \`;
    }

    function keywordBars(keywords) {
      if (!keywords.length) return '<div class="empty">还没有足够文本生成热力词。</div>';
      const max = Math.max(...keywords.map((item) => item.count), 1);
      return \`
        <div class="bars">
          \${keywords.slice(0, 12).map((item) => \`
            <div class="bar">
              <span title="\${escapeHtml(item.word)}">\${escapeHtml(item.word)}</span>
              <div class="bar-track"><div class="bar-fill" style="width: \${Math.max(8, item.count / max * 100)}%"></div></div>
              <span>\${item.count}</span>
            </div>
          \`).join("")}
        </div>
      \`;
    }

    function resourceTags(resources) {
      const entries = Object.entries(resources.byType || {});
      if (!entries.length) return '<div class="empty">还没有资源记录。</div>';
      return \`
        <div class="tagrow">
          \${entries.map(([type, count]) => \`
            <span class="tag">\${escapeHtml(type)} <strong>\${count}</strong></span>
          \`).join("")}
          <span class="tag">公开 URL <strong>\${resources.publicUrlCount}</strong></span>
          <span class="tag">总大小 <strong>\${formatSize(resources.totalBytes)}</strong></span>
        </div>
      \`;
    }

    function dailyBars(daily) {
      if (!daily.length) return '<div class="empty">还没有趋势数据。</div>';
      const max = Math.max(...daily.map((item) => item.inbound + item.outbound + item.resources), 1);
      return \`
        <div class="bars">
          \${daily.map((item) => {
            const total = item.inbound + item.outbound + item.resources;
            return \`
              <div class="bar">
                <span>\${escapeHtml(item.date.slice(5))}</span>
                <div class="bar-track"><div class="bar-fill" style="width: \${Math.max(6, total / max * 100)}%"></div></div>
                <span>\${total}</span>
              </div>
            \`;
          }).join("")}
        </div>
      \`;
    }

    function timeline(messages) {
      if (!messages.length) return '<div class="empty">还没有聊天轨迹。</div>';
      return \`
        <div class="timeline">
          \${messages.slice(0, 50).map((message) => \`
            <article class="message">
              <div class="message-head">
                <span>\${message.direction === "inbound" ? "用户" : "Agent"} · \${escapeHtml(message.messageType)} · \${escapeHtml(message.userId)}</span>
                <span>\${escapeHtml(new Date(message.createdAt).toLocaleString())}</span>
              </div>
              <div class="message-text">\${escapeHtml(message.text || "[empty]")}</div>
              \${message.mediaTypes?.length ? '<div class="tagrow">' + message.mediaTypes.map((type) => '<span class="tag">' + escapeHtml(type) + '</span>').join("") + '</div>' : ""}
            </article>
          \`).join("")}
        </div>
      \`;
    }

    async function load() {
      const res = await fetch("/api/insights");
      const data = await res.json();
      root.innerHTML = \`
        <div class="metrics">
          \${metric("总消息", data.totals.messages, "已持久化的聊天记录")}
          \${metric("用户消息", data.totals.inbound, "来自微信私聊")}
          \${metric("Agent 回复", data.totals.outbound, "已发送回微信")}
          \${metric("资源", data.resources.total, formatSize(data.resources.totalBytes))}
        </div>
        <div class="split">
          <div>
            <section class="panel section">
              <h3>聊天轨迹</h3>
              \${timeline(data.messages || [])}
            </section>
          </div>
          <div>
            <section class="panel section">
              <h3>智能分析</h3>
              <ul class="summary">
                \${(data.summary || []).map((item) => '<li>' + escapeHtml(item) + '</li>').join("")}
              </ul>
            </section>
            <section class="panel section">
              <h3>聊天热力词</h3>
              \${keywordBars(data.keywords || [])}
            </section>
            <section class="panel section">
              <h3>资源情况</h3>
              \${resourceTags(data.resources || { byType: {}, totalBytes: 0, publicUrlCount: 0 })}
            </section>
            <section class="panel section">
              <h3>近 14 天趋势</h3>
              \${dailyBars(data.daily || [])}
            </section>
          </div>
        </div>
      \`;
    }

    load();
  </script>
</body>
</html>`;
}
