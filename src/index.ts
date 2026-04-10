/**
 * wechat-media-agent — public API
 */

export { WeChatAcpBridge } from "./bridge.js";
export type {
	AgentCommandConfig,
	AgentPreset,
	ResolvedAgentConfig,
	WeChatAcpConfig,
} from "./config.js";
export {
	BUILT_IN_AGENTS,
	defaultConfig,
	listBuiltInAgents,
	parseAgentCommand,
	resolveAgentSelection,
} from "./config.js";
