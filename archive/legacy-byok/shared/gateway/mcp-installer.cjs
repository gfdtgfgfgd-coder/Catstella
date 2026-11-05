const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PLUGIN_DIR_NAME = "catstella-byok";
const MANAGED_MARKER = ".catstella-managed";

function defaultGeminiPluginsDir() {
  if (process.env.CATSTELLA_GEMINI_PLUGINS_DIR) {
    return process.env.CATSTELLA_GEMINI_PLUGINS_DIR;
  }
  return path.join(os.homedir(), ".gemini", "config", "plugins");
}

function getMcpPluginStatus(options = {}) {
  const pluginsDir = options.pluginsDir || defaultGeminiPluginsDir();
  const targetDir = path.join(pluginsDir, PLUGIN_DIR_NAME);
  const installed =
    fs.existsSync(path.join(targetDir, "plugin.json")) &&
    fs.existsSync(path.join(targetDir, "mcp_config.json"));
  return {
    installed,
    pluginDir: targetDir,
    customizationUri: `customization://${PLUGIN_DIR_NAME}`
  };
}

function installMcpPlugin(options = {}) {
  const pluginsDir = options.pluginsDir || defaultGeminiPluginsDir();
  const targetDir = path.join(pluginsDir, PLUGIN_DIR_NAME);
  const skillDir = path.join(targetDir, "skills", "byok-council");
  const mcpServerScript = options.mcpServerScript || path.join(__dirname, "mcp-server.cjs");
  const modelsPath = options.modelsPath || "";
  const nodeExec = options.execPath || process.execPath;

  fs.mkdirSync(skillDir, { recursive: true });

  const pluginJson = {
    name: PLUGIN_DIR_NAME,
    version: "1.1.0",
    description: "Catstella 星语第三方模型网关 (BYOK) 会诊桥：支持调用 DeepSeek、Claude、OpenAI、OpenRouter、SiliconFlow 与本地 Ollama 进行代码审查与多模型并发会诊。"
  };

  const args = [mcpServerScript];
  if (modelsPath) args.push(`--models-path=${modelsPath}`);

  const mcpConfig = {
    mcpServers: {
      "byok-gateway": {
        command: nodeExec,
        args,
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          ...(modelsPath ? { CATSTELLA_MODELS_PATH: modelsPath } : {})
        }
      }
    }
  };

  const skillMarkdown = `---
name: byok-council
description: Use Catstella's local BYOK model gateway MCP tools (byok_list_models, byok_chat, byok_council) whenever the user asks to consult an external/third-party model (DeepSeek, Claude, OpenAI, OpenRouter, SiliconFlow, Ollama), wants a multi-model council or second-opinion code review, or wants to offload reasoning subtasks to their own API keys.
---

# Catstella BYOK Multi-Model Council Guide

1. **Discover active models**: Call \`byok_list_models\` if you do not yet know which BYOK providers and models the user has enabled.
2. **Save context tokens with \`context_files\`**: When asking an external model to review or debug workspace files, pass file paths (e.g. \`["src/index.js#L1-L120"]\`) in \`context_files\` instead of copying large code blocks into \`prompt\`.
3. **Single external consultation**: Use \`byok_chat\` for targeted second opinions or reasoning checks (e.g. \`model: "deepseek:deepseek-reasoner"\`).
4. **Parallel council**: Use \`byok_council\` when comparing trade-offs across 2–4 distinct models simultaneously.
`;

  fs.writeFileSync(path.join(targetDir, MANAGED_MARKER), "catstella-byok\n", "utf8");
  fs.writeFileSync(path.join(targetDir, "plugin.json"), JSON.stringify(pluginJson, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(targetDir, "mcp_config.json"), JSON.stringify(mcpConfig, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMarkdown, "utf8");

  return getMcpPluginStatus({ pluginsDir });
}

function uninstallMcpPlugin(options = {}) {
  const pluginsDir = options.pluginsDir || defaultGeminiPluginsDir();
  const targetDir = path.join(pluginsDir, PLUGIN_DIR_NAME);
  if (!fs.existsSync(targetDir)) {
    return { removed: false, pluginDir: targetDir };
  }
  // Safety guardrail: only delete if created by Catstella
  if (!fs.existsSync(path.join(targetDir, MANAGED_MARKER))) {
    return { removed: false, skippedUnmanaged: true, pluginDir: targetDir };
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  return { removed: true, pluginDir: targetDir };
}

module.exports = {
  PLUGIN_DIR_NAME,
  defaultGeminiPluginsDir,
  getMcpPluginStatus,
  installMcpPlugin,
  uninstallMcpPlugin
};
