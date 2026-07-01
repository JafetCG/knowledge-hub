import dotenv from "dotenv";
import { DynamicTool } from "@langchain/core/tools";
import { HumanMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { createLLM } from "../../config/models.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readlinePromises from "readline/promises";

dotenv.config();

// Module 4 — Deployment Status Agent
// Implements the ReAct tool-calling loop manually using llm.bindTools():
//   1. LLM receives the user message
//   2. LLM decides which tool to call (get_deployed_branch, send_slack_notification)
//   3. Tool executes and returns the result
//   4. Result is fed back to the LLM for a final response
//
// FREE TIER:  createLLM("flash") → gemini-1.5-flash
// PAID TIER:  createLLM("flash") → gemini-2.5-flash
// (deployment queries are deterministic — Pro model not needed)

const llm = createLLM("flash");

// ── Tool: get_deployed_branch ─────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const statePath = join(__dirname, "../../../data/deployment-state.json");

const getDeployedBranch = new DynamicTool({
  name: "get_deployed_branch",
  description:
    "Returns the branch currently deployed for a given service and environment. " +
    "Input must be a JSON string with 'service' and 'environment' (DEV or SQA) fields.",
  func: async (input: string) => {
    try {
      const { service, environment } = JSON.parse(input) as {
        service: string;
        environment: string;
      };

      const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
        services: Record<string, Record<string, { branch: string; deployedAt: string }>>;
      };

      const serviceData = state.services[service.toLowerCase()];
      if (!serviceData) {
        const available = Object.keys(state.services).join(", ");
        return `Service "${service}" not found. Available: ${available}`;
      }

      const envData = serviceData[environment.toUpperCase()];
      if (!envData) {
        return `Environment "${environment}" not found for "${service}". Use DEV or SQA.`;
      }

      return JSON.stringify({ service, environment, ...envData });
    } catch {
      return "Invalid input. Provide JSON with 'service' and 'environment' fields.";
    }
  },
});

// ── Tool: send_slack_notification ─────────────────────────────────────────────

const sendSlackNotification = new DynamicTool({
  name: "send_slack_notification",
  description:
    "Sends a deployment status message to Slack. " +
    "Input must be a JSON string with 'channel' and 'message' fields.",
  func: async (input: string) => {
    try {
      const { channel, message } = JSON.parse(input) as {
        channel: string;
        message: string;
      };

      const webhookUrl = process.env.SLACK_WEBHOOK_URL;

      if (!webhookUrl) {
        console.log(`\n[Slack → ${channel}]: ${message}`);
        return "Slack webhook not configured. Message logged to console.";
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `*${channel}*\n${message}` }),
      });

      return response.ok ? "Notification delivered." : `Slack error: ${response.statusText}`;
    } catch {
      return "Invalid input. Provide JSON with 'channel' and 'message' fields.";
    }
  },
});

// ── Agent loop ────────────────────────────────────────────────────────────────
// Manual ReAct loop using llm.bindTools() — replaces createToolCallingAgent
// which was removed in langchain v1.5+. This is the recommended pattern
// for tool-calling in @langchain/core without additional dependencies.

const tools = [getDeployedBranch, sendSlackNotification];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const llmWithTools = (llm as any).bindTools(tools);

const SYSTEM_PROMPT = `You are a deployment assistant for a software team.
Use the available tools to answer questions about deployed branches and environments.
After getting the deployment info, offer to notify the team via Slack if appropriate.`;

async function runAgent(userInput: string): Promise<string> {
  const messages: BaseMessage[] = [
    new HumanMessage(`${SYSTEM_PROMPT}\n\nUser: ${userInput}`),
  ];

  // Tool-calling loop (max 5 iterations to prevent infinite loops)
  for (let i = 0; i < 5; i++) {
    const response: any = await llmWithTools.invoke(messages);
    messages.push(response);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const content = response.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content.map((c: any) => (typeof c === "string" ? c : c.text ?? "")).join("");
      }
      return String(content);
    }

    // Execute each tool call and feed results back
    for (const call of toolCalls) {
      const tool = toolMap[call.name];
      const input = typeof call.args === "string" ? call.args : JSON.stringify(call.args);
      const raw: any = tool ? await tool.func(input) : `Tool "${call.name}" not found.`;
      const result: string = String(raw);
      messages.push(new ToolMessage({ tool_call_id: call.id ?? "", content: result }));
    }
  }

  return "Agent reached maximum iterations without a final response.";
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });

console.log("=== Deployment Status Agent ===");
console.log("Example: What branch is deployed in DEV for api-gateway?");
console.log('Type "exit" to quit.\n');

while (true) {
  const input = (await rl.question("You: ")).trim();
  if (input.toLowerCase() === "exit") break;

  const answer = await runAgent(input);
  console.log(`\nAgent: ${answer}\n`);
}

rl.close();
