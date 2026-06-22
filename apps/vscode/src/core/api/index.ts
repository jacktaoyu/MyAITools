import { ApiConfiguration, ModelInfo, QwenApiRegions } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { ClineTool } from "@/shared/tools"
import { ApiStream, ApiStreamUsageChunk } from "./transform/stream"

export type CommonApiHandlerOptions = {
	onRetryAttempt?: ApiConfiguration["onRetryAttempt"]
}
export interface ApiHandler {
	createMessage(systemPrompt: string, messages: ClineStorageMessage[], tools?: ClineTool[], useResponseApi?: boolean): ApiStream
	getModel(): ApiHandlerModel
	getApiStreamUsage?(): Promise<ApiStreamUsageChunk | undefined>
	abort?(): void
}

export interface ApiHandlerModel {
	id: string
	info: ModelInfo
}

export interface ApiProviderInfo {
	providerId: string
	model: ApiHandlerModel
	mode: Mode
	customPrompt?: string // "compact"
}

export interface SingleCompletionHandler {
	completePrompt(prompt: string): Promise<string>
}

async function createHandlerForProvider(
	apiProvider: string | undefined,
	options: Omit<ApiConfiguration, "apiProvider">,
	mode: Mode,
): Promise<ApiHandler> {
	switch (apiProvider) {
		case "anthropic":
			const { AnthropicHandler } = await import("./providers/anthropic")
			return new AnthropicHandler({
				onRetryAttempt: options.onRetryAttempt,
				apiKey: options.apiKey,
				anthropicBaseUrl: options.anthropicBaseUrl,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "openrouter":
			const { OpenRouterHandler } = await import("./providers/openrouter")
			return new OpenRouterHandler({
				onRetryAttempt: options.onRetryAttempt,
				openRouterApiKey: options.openRouterApiKey,
				openRouterModelId: mode === "plan" ? options.planModeOpenRouterModelId : options.actModeOpenRouterModelId,
				openRouterModelInfo: mode === "plan" ? options.planModeOpenRouterModelInfo : options.actModeOpenRouterModelInfo,
				openRouterProviderSorting: options.openRouterProviderSorting,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				enableParallelToolCalling: options.enableParallelToolCalling,
			})
		case "bedrock":
			const { AwsBedrockHandler } = await import("./providers/bedrock")
			return new AwsBedrockHandler({
				onRetryAttempt: options.onRetryAttempt,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				awsAccessKey: options.awsAccessKey,
				awsSecretKey: options.awsSecretKey,
				awsSessionToken: options.awsSessionToken,
				awsRegion: options.awsRegion,
				awsAuthentication: options.awsAuthentication,
				awsBedrockApiKey: options.awsBedrockApiKey,
				awsUseCrossRegionInference: options.awsUseCrossRegionInference,
				awsUseGlobalInference: options.awsUseGlobalInference,
				awsBedrockUsePromptCache: options.awsBedrockUsePromptCache,
				awsUseProfile: options.awsUseProfile,
				awsProfile: options.awsProfile,
				awsBedrockEndpoint: options.awsBedrockEndpoint,
				awsBedrockCustomSelected:
					mode === "plan" ? options.planModeAwsBedrockCustomSelected : options.actModeAwsBedrockCustomSelected,
				awsBedrockCustomModelBaseId:
					mode === "plan" ? options.planModeAwsBedrockCustomModelBaseId : options.actModeAwsBedrockCustomModelBaseId,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "vertex":
			const { VertexHandler } = await import("./providers/vertex")
			return new VertexHandler({
				onRetryAttempt: options.onRetryAttempt,
				vertexProjectId: options.vertexProjectId,
				vertexRegion: options.vertexRegion,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				geminiApiKey: options.geminiApiKey,
				geminiBaseUrl: options.geminiBaseUrl,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				ulid: options.ulid,
			})
		case "openai":
			const { OpenAiHandler } = await import("./providers/openai")
			return new OpenAiHandler({
				onRetryAttempt: options.onRetryAttempt,
				openAiApiKey: options.openAiApiKey,
				openAiBaseUrl: options.openAiBaseUrl,
				azureApiVersion: options.azureApiVersion,
				azureIdentity: options.azureIdentity,
				openAiHeaders: options.openAiHeaders,
				openAiModelId: mode === "plan" ? options.planModeOpenAiModelId : options.actModeOpenAiModelId,
				openAiModelInfo: mode === "plan" ? options.planModeOpenAiModelInfo : options.actModeOpenAiModelInfo,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
			})
		case "ollama":
			const { OllamaHandler } = await import("./providers/ollama")
			return new OllamaHandler({
				onRetryAttempt: options.onRetryAttempt,
				ollamaBaseUrl: options.ollamaBaseUrl,
				ollamaApiKey: options.ollamaApiKey,
				ollamaModelId: mode === "plan" ? options.planModeOllamaModelId : options.actModeOllamaModelId,
				ollamaApiOptionsCtxNum: options.ollamaApiOptionsCtxNum,
				requestTimeoutMs: options.requestTimeoutMs,
			})
		case "lmstudio":
			const { LmStudioHandler } = await import("./providers/lmstudio")
			return new LmStudioHandler({
				onRetryAttempt: options.onRetryAttempt,
				lmStudioBaseUrl: options.lmStudioBaseUrl,
				lmStudioModelId: mode === "plan" ? options.planModeLmStudioModelId : options.actModeLmStudioModelId,
				lmStudioMaxTokens: options.lmStudioMaxTokens,
			})
		case "gemini":
			const { GeminiHandler } = await import("./providers/gemini")
			return new GeminiHandler({
				onRetryAttempt: options.onRetryAttempt,
				vertexProjectId: options.vertexProjectId,
				vertexRegion: options.vertexRegion,
				geminiApiKey: options.geminiApiKey,
				geminiBaseUrl: options.geminiBaseUrl,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				ulid: options.ulid,
			})
		case "openai-native":
			const { OpenAiNativeHandler } = await import("./providers/openai-native")
			return new OpenAiNativeHandler({
				onRetryAttempt: options.onRetryAttempt,
				openAiNativeApiKey: options.openAiNativeApiKey,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "openai-codex":
			const { OpenAiCodexHandler } = await import("./providers/openai-codex")
			return new OpenAiCodexHandler({
				onRetryAttempt: options.onRetryAttempt,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "deepseek":
			const { DeepSeekHandler } = await import("./providers/deepseek")
			return new DeepSeekHandler({
				onRetryAttempt: options.onRetryAttempt,
				deepSeekApiKey: options.deepSeekApiKey,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "requesty":
			const { RequestyHandler } = await import("./providers/requesty")
			return new RequestyHandler({
				onRetryAttempt: options.onRetryAttempt,
				requestyBaseUrl: options.requestyBaseUrl,
				requestyApiKey: options.requestyApiKey,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				requestyModelId: mode === "plan" ? options.planModeRequestyModelId : options.actModeRequestyModelId,
				requestyModelInfo: mode === "plan" ? options.planModeRequestyModelInfo : options.actModeRequestyModelInfo,
			})
		case "fireworks":
			const { FireworksHandler } = await import("./providers/fireworks")
			return new FireworksHandler({
				onRetryAttempt: options.onRetryAttempt,
				fireworksApiKey: options.fireworksApiKey,
				fireworksModelId: mode === "plan" ? options.planModeFireworksModelId : options.actModeFireworksModelId,
			})
		case "together":
			const { TogetherHandler } = await import("./providers/together")
			return new TogetherHandler({
				onRetryAttempt: options.onRetryAttempt,
				togetherApiKey: options.togetherApiKey,
				togetherModelId: mode === "plan" ? options.planModeTogetherModelId : options.actModeTogetherModelId,
			})
		case "qwen":
			const { QwenHandler } = await import("./providers/qwen")
			return new QwenHandler({
				onRetryAttempt: options.onRetryAttempt,
				qwenApiKey: options.qwenApiKey,
				qwenApiLine:
					options.qwenApiLine === QwenApiRegions.INTERNATIONAL ? QwenApiRegions.INTERNATIONAL : QwenApiRegions.CHINA,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "qwen-code":
			const { QwenCodeHandler } = await import("./providers/qwen-code")
			return new QwenCodeHandler({
				onRetryAttempt: options.onRetryAttempt,
				qwenCodeOauthPath: options.qwenCodeOauthPath,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "doubao":
			const { DoubaoHandler } = await import("./providers/doubao")
			return new DoubaoHandler({
				onRetryAttempt: options.onRetryAttempt,
				doubaoApiKey: options.doubaoApiKey,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "mistral":
			const { MistralHandler } = await import("./providers/mistral")
			return new MistralHandler({
				onRetryAttempt: options.onRetryAttempt,
				mistralApiKey: options.mistralApiKey,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "vscode-lm":
			const { VsCodeLmHandler } = await import("./providers/vscode-lm")
			return new VsCodeLmHandler({
				onRetryAttempt: options.onRetryAttempt,
				vsCodeLmModelSelector:
					mode === "plan" ? options.planModeVsCodeLmModelSelector : options.actModeVsCodeLmModelSelector,
			})
		case "cline": {
			const clineModelId =
				(mode === "plan" ? options.planModeClineModelId : options.actModeClineModelId) ||
				(mode === "plan" ? options.planModeOpenRouterModelId : options.actModeOpenRouterModelId)
			const clineModelInfo =
				(mode === "plan" ? options.planModeClineModelInfo : options.actModeClineModelInfo) ||
				(mode === "plan" ? options.planModeOpenRouterModelInfo : options.actModeOpenRouterModelInfo)
			const { ClineHandler } = await import("./providers/cline")
			return new ClineHandler({
				onRetryAttempt: options.onRetryAttempt,
				clineAccountId: options.clineAccountId,
				clineApiKey: options.clineApiKey,
				ulid: options.ulid,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				openRouterProviderSorting: options.openRouterProviderSorting,
				openRouterModelId: clineModelId,
				openRouterModelInfo: clineModelInfo,
				enableParallelToolCalling: options.enableParallelToolCalling,
			})
		}
		case "litellm":
			const { LiteLlmHandler } = await import("./providers/litellm")
			return new LiteLlmHandler({
				onRetryAttempt: options.onRetryAttempt,
				liteLlmApiKey: options.liteLlmApiKey,
				liteLlmBaseUrl: options.liteLlmBaseUrl,
				liteLlmModelId: mode === "plan" ? options.planModeLiteLlmModelId : options.actModeLiteLlmModelId,
				liteLlmModelInfo: mode === "plan" ? options.planModeLiteLlmModelInfo : options.actModeLiteLlmModelInfo,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				liteLlmUsePromptCache: options.liteLlmUsePromptCache,
				ulid: options.ulid,
			})
		case "moonshot":
			const { MoonshotHandler } = await import("./providers/moonshot")
			return new MoonshotHandler({
				onRetryAttempt: options.onRetryAttempt,
				moonshotApiKey: options.moonshotApiKey,
				moonshotApiLine: options.moonshotApiLine,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "huggingface":
			const { HuggingFaceHandler } = await import("./providers/huggingface")
			return new HuggingFaceHandler({
				onRetryAttempt: options.onRetryAttempt,
				huggingFaceApiKey: options.huggingFaceApiKey,
				huggingFaceModelId: mode === "plan" ? options.planModeHuggingFaceModelId : options.actModeHuggingFaceModelId,
				huggingFaceModelInfo:
					mode === "plan" ? options.planModeHuggingFaceModelInfo : options.actModeHuggingFaceModelInfo,
			})
		case "nebius":
			const { NebiusHandler } = await import("./providers/nebius")
			return new NebiusHandler({
				onRetryAttempt: options.onRetryAttempt,
				nebiusApiKey: options.nebiusApiKey,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "asksage":
			const { AskSageHandler } = await import("./providers/asksage")
			return new AskSageHandler({
				onRetryAttempt: options.onRetryAttempt,
				asksageApiKey: options.asksageApiKey,
				asksageApiUrl: options.asksageApiUrl,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "xai":
			const { XAIHandler } = await import("./providers/xai")
			return new XAIHandler({
				onRetryAttempt: options.onRetryAttempt,
				xaiApiKey: options.xaiApiKey,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "sambanova":
			const { SambanovaHandler } = await import("./providers/sambanova")
			return new SambanovaHandler({
				onRetryAttempt: options.onRetryAttempt,
				sambanovaApiKey: options.sambanovaApiKey,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "cerebras":
			const { CerebrasHandler } = await import("./providers/cerebras")
			return new CerebrasHandler({
				onRetryAttempt: options.onRetryAttempt,
				cerebrasApiKey: options.cerebrasApiKey,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "groq":
			const { GroqHandler } = await import("./providers/groq")
			return new GroqHandler({
				onRetryAttempt: options.onRetryAttempt,
				groqApiKey: options.groqApiKey,
				groqModelId: mode === "plan" ? options.planModeGroqModelId : options.actModeGroqModelId,
				groqModelInfo: mode === "plan" ? options.planModeGroqModelInfo : options.actModeGroqModelInfo,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "baseten":
			const { BasetenHandler } = await import("./providers/baseten")
			return new BasetenHandler({
				onRetryAttempt: options.onRetryAttempt,
				basetenApiKey: options.basetenApiKey,
				basetenModelId: mode === "plan" ? options.planModeBasetenModelId : options.actModeBasetenModelId,
				basetenModelInfo: mode === "plan" ? options.planModeBasetenModelInfo : options.actModeBasetenModelInfo,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "sapaicore":
			const { SapAiCoreHandler } = await import("./providers/sapaicore")
			return new SapAiCoreHandler({
				onRetryAttempt: options.onRetryAttempt,
				sapAiCoreClientId: options.sapAiCoreClientId,
				sapAiCoreClientSecret: options.sapAiCoreClientSecret,
				sapAiCoreTokenUrl: options.sapAiCoreTokenUrl,
				sapAiResourceGroup: options.sapAiResourceGroup,
				sapAiCoreBaseUrl: options.sapAiCoreBaseUrl,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				deploymentId: mode === "plan" ? options.planModeSapAiCoreDeploymentId : options.actModeSapAiCoreDeploymentId,
				sapAiCoreUseOrchestrationMode: options.sapAiCoreUseOrchestrationMode,
			})
		case "claude-code":
			const { ClaudeCodeHandler } = await import("./providers/claude-code")
			return new ClaudeCodeHandler({
				onRetryAttempt: options.onRetryAttempt,
				claudeCodePath: options.claudeCodePath,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "huawei-cloud-maas":
			const { HuaweiCloudMaaSHandler } = await import("./providers/huawei-cloud-maas")
			return new HuaweiCloudMaaSHandler({
				onRetryAttempt: options.onRetryAttempt,
				huaweiCloudMaasApiKey: options.huaweiCloudMaasApiKey,
				huaweiCloudMaasModelId:
					mode === "plan" ? options.planModeHuaweiCloudMaasModelId : options.actModeHuaweiCloudMaasModelId,
				huaweiCloudMaasModelInfo:
					mode === "plan" ? options.planModeHuaweiCloudMaasModelInfo : options.actModeHuaweiCloudMaasModelInfo,
			})
		case "dify": // Add Dify.ai handler
			const { DifyHandler } = await import("./providers/dify")
			return new DifyHandler({
				difyApiKey: options.difyApiKey,
				difyBaseUrl: options.difyBaseUrl,
			})
		case "vercel-ai-gateway":
			const { VercelAIGatewayHandler } = await import("./providers/vercel-ai-gateway")
			return new VercelAIGatewayHandler({
				onRetryAttempt: options.onRetryAttempt,
				vercelAiGatewayApiKey: options.vercelAiGatewayApiKey,
				openRouterModelId:
					mode === "plan" ? options.planModeVercelAiGatewayModelId : options.actModeVercelAiGatewayModelId,
				openRouterModelInfo:
					mode === "plan" ? options.planModeVercelAiGatewayModelInfo : options.actModeVercelAiGatewayModelInfo,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "zai":
			const { ZAiHandler } = await import("./providers/zai")
			return new ZAiHandler({
				onRetryAttempt: options.onRetryAttempt,
				zaiApiLine: options.zaiApiLine,
				zaiApiKey: options.zaiApiKey,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "oca":
			const { OcaHandler } = await import("./providers/oca")
			return new OcaHandler({
				ocaMode: options.ocaMode || "internal",
				ocaBaseUrl: options.ocaBaseUrl,
				ocaModelId: mode === "plan" ? options.planModeOcaModelId : options.actModeOcaModelId,
				ocaModelInfo: mode === "plan" ? options.planModeOcaModelInfo : options.actModeOcaModelInfo,
				ocaReasoningEffort: mode === "plan" ? options.planModeOcaReasoningEffort : options.actModeOcaReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				ocaUsePromptCache:
					mode === "plan"
						? options.planModeOcaModelInfo?.supportsPromptCache
						: options.actModeOcaModelInfo?.supportsPromptCache,
				taskId: options.ulid,
			})
		case "aihubmix":
			const { AIhubmixHandler } = await import("./providers/aihubmix")
			return new AIhubmixHandler({
				onRetryAttempt: options.onRetryAttempt,
				apiKey: options.aihubmixApiKey,
				baseURL: options.aihubmixBaseUrl,
				appCode: options.aihubmixAppCode,
				modelId: mode === "plan" ? (options as any).planModeAihubmixModelId : (options as any).actModeAihubmixModelId,
				modelInfo:
					mode === "plan" ? (options as any).planModeAihubmixModelInfo : (options as any).actModeAihubmixModelInfo,
			})
		case "minimax":
			const { MinimaxHandler } = await import("./providers/minimax")
			return new MinimaxHandler({
				onRetryAttempt: options.onRetryAttempt,
				minimaxApiKey: options.minimaxApiKey,
				minimaxApiLine: options.minimaxApiLine,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "hicap":
			const { HicapHandler } = await import("./providers/hicap")
			return new HicapHandler({
				onRetryAttempt: options.onRetryAttempt,
				hicapApiKey: options.hicapApiKey,
				hicapModelId: mode === "plan" ? options.planModeHicapModelId : options.actModeHicapModelId,
			})
		case "nousResearch":
			const { NousResearchHandler } = await import("./providers/nousresearch")
			return new NousResearchHandler({
				onRetryAttempt: options.onRetryAttempt,
				nousResearchApiKey: options.nousResearchApiKey,
				apiModelId: mode === "plan" ? options.planModeNousResearchModelId : options.actModeNousResearchModelId,
			})
		case "wandb":
			const { WandbHandler } = await import("./providers/wandb")
			return new WandbHandler({
				onRetryAttempt: options.onRetryAttempt,
				wandbApiKey: options.wandbApiKey,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
			})
		default: {
			const { AnthropicHandler } = await import("./providers/anthropic")
			return new AnthropicHandler({
				onRetryAttempt: options.onRetryAttempt,
				apiKey: options.apiKey,
				anthropicBaseUrl: options.anthropicBaseUrl,
				apiModelId: mode === "plan" ? options.planModeApiModelId : options.actModeApiModelId,
				reasoningEffort: mode === "plan" ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		}
	}
}

export async function buildApiHandler(configuration: ApiConfiguration, mode: Mode): Promise<ApiHandler> {
	const { planModeApiProvider, actModeApiProvider, ...options } = configuration

	const apiProvider = mode === "plan" ? planModeApiProvider : actModeApiProvider

	// Validate thinking budget tokens against model's maxTokens to prevent API errors
	// wrapped in a try-catch for safety, but this should never throw
	try {
		const thinkingBudgetTokens = mode === "plan" ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens
		if (thinkingBudgetTokens && thinkingBudgetTokens > 0) {
			const handler = await createHandlerForProvider(apiProvider, options, mode)

			const modelInfo = handler.getModel().info
			if (modelInfo?.maxTokens && modelInfo.maxTokens > 0 && thinkingBudgetTokens > modelInfo.maxTokens) {
				const clippedValue = modelInfo.maxTokens - 1
				if (mode === "plan") {
					options.planModeThinkingBudgetTokens = clippedValue
				} else {
					options.actModeThinkingBudgetTokens = clippedValue
				}
			} else {
				return handler // don't rebuild unless its necessary
			}
		}
	} catch (error) {
		Logger.error("buildApiHandler error:", error)
	}

	return await createHandlerForProvider(apiProvider, options, mode)
}
