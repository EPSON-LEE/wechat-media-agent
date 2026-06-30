# Docker Deployment

Docker is an optional deployment path for long-running bridge/admin usage. For first-time setup and local agent CLI authentication, the native Node.js flow is usually simpler.

## Start With Compose

From the repository root:

```bash
docker compose up --build
```

The admin pages will be available at:

```text
http://127.0.0.1:8787
```

On first run, scan the QR code printed in the container logs.

## Choose An Agent

The Compose file uses the `copilot` preset by default. Override it with `WECHAT_AGENT`:

```bash
WECHAT_AGENT=codex docker compose up --build
```

For a raw command, quote the value:

```bash
WECHAT_AGENT="npx my-agent --acp" docker compose up --build
```

## Data And Workspace

Runtime data is stored in the named Docker volume:

```text
wechat-media-agent-data -> /home/node/.wechat-media-agent
```

This includes the WeChat login token, media files, chat records, logs, and sync state.

The local `./workspace` directory is mounted at:

```text
/workspace
```

The agent process uses `/workspace` as its working directory by default.

## Admin Port

Change the host admin port with `ADMIN_PORT`:

```bash
ADMIN_PORT=9876 docker compose up
```

Then open:

```text
http://127.0.0.1:9876
```

## Notes And Limits

- Agent CLIs run inside the container. If a preset needs authentication, authenticate inside the container or use an agent command that works in that environment.
- Host-installed CLIs are not automatically available inside Docker.
- Media and chat data stay in the Docker volume unless you remove it.
- For active development, prefer the native Node.js workflow so rebuilds and local credentials are easier to manage.
