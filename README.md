# WeChat Media Agent

[English](./README.md) | [简体中文](./README.zh-CN.md)

Bridge WeChat direct messages to any ACP-compatible AI agent.

`wechat-media-agent` logs in with the WeChat iLink bot API, polls incoming 1:1 messages, forwards them to an ACP agent over stdio, and sends the agent reply back to WeChat.

## Fork Notice

This repository is based on the original `wechat-acp` project and is distributed under the MIT License.

This fork keeps the original license and attribution, and adds local media persistence so the agent can work with files received from WeChat, including images, videos, and voice messages.

Fork repository: [EPSON-LEE/wechat-media-agent](https://github.com/EPSON-LEE/wechat-media-agent)

<img src="./resources/2.jpg" alt="wechat-media-agent screenshot" width="400" />

## Features

- WeChat QR login with terminal QR rendering
- One ACP agent session per WeChat user
- Built-in ACP agent presets for common CLIs
- Custom raw agent command support
- Auto-allow permission requests from the agent
- Save incoming images, videos, and voice messages to local storage
- Pass saved local media paths to the agent for follow-up actions
- Direct message only; group chats are ignored
- Background daemon mode

## Requirements

- Node.js 20+
- A WeChat environment that can use the iLink bot API
- An ACP-compatible agent available locally or through `npx`

## Quick Start

Start with a built-in agent preset:

```bash
npx wechat-media-agent --agent copilot
```

Or use a raw custom command:

```bash
npx wechat-media-agent --agent "npx my-agent --acp"
```

On first run, the bridge will:

1. Start WeChat QR login
2. Render a QR code in the terminal
3. Save the login token under `~/.wechat-media-agent`
4. Begin polling direct messages

## Built-in Agent Presets

List the bundled presets:

```bash
npx wechat-media-agent agents
```

Current presets:

- `copilot`
- `claude`
- `gemini`
- `qwen`
- `codex`
- `opencode`

These presets resolve to concrete `command + args` pairs internally, so users do not need to type long `npx ...` commands.

## CLI Usage

```text
wechat-media-agent --agent <preset|command> [options]
wechat-media-agent agents
wechat-media-agent stop
wechat-media-agent status
```

Options:

- `--agent <value>`: built-in preset name or raw agent command
- `--cwd <dir>`: working directory for the agent process
- `--login`: force QR re-login and replace the saved token
- `--daemon`: run in background after startup
- `--config <file>`: load JSON config file
- `--idle-timeout <minutes>`: session idle timeout, default `1440` (use `0` for unlimited)
- `--max-sessions <count>`: maximum concurrent user sessions, default `10`
- `--show-thoughts`: forward agent thinking to WeChat (default: off)
- `-h, --help`: show help

Examples:

```bash
npx wechat-media-agent --agent copilot
npx wechat-media-agent --agent claude --cwd D:\code\project
npx wechat-media-agent --agent "npx @github/copilot --acp"
npx wechat-media-agent --agent gemini --daemon
```

## Configuration File

You can provide a JSON config file with `--config`.

Example:

```json
{
  "agent": {
    "preset": "copilot",
    "cwd": "D:/code/project"
  },
  "session": {
    "idleTimeoutMs": 86400000,
    "maxConcurrentUsers": 10
  }
}
```

You can also override or add agent presets:

```json
{
  "agent": {
    "preset": "my-agent"
  },
  "agents": {
    "my-agent": {
      "label": "My Agent",
      "description": "Internal team agent",
      "command": "npx",
      "args": ["my-agent-cli", "--acp"]
    }
  }
}
```

## Runtime Behavior

- Each WeChat user gets a dedicated ACP session and subprocess.
- Messages are processed serially per user.
- Incoming images, videos, and voice messages can be downloaded, decrypted, and saved locally before being forwarded to the agent.
- Saved local media paths are included in the prompt so the agent can reference real files on disk.
- Replies are formatted for WeChat before sending.
- Typing indicators are sent when supported by the WeChat API.
- Sessions are cleaned up after inactivity (set `idleTimeoutMs` to `0` to disable idle cleanup).

## Storage

By default, runtime files are stored under:

```text
~/.wechat-media-agent
```

This directory is used for:

- saved login token
- daemon pid file
- daemon log file
- sync state
- incoming images, videos, and voice messages saved under `media/YYYY-MM-DD/`

## Current Limitations

- Direct messages only; group chats are ignored
- MCP servers are not used
- Permission requests are auto-approved
- Agent communication is subprocess-only over stdio
- Some preset agents may require separate authentication before they can respond successfully

## Development

For local development:

```bash
npm install
npm run build
```

Run the built CLI locally:

```bash
node dist/bin/wechat-media-agent.js --help
```

Watch mode:

```bash
npm run dev
```

## License

MIT.

Please keep the original copyright notice and this license text in any redistributed or modified copies of the project.
