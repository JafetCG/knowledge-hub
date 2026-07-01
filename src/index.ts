import dotenv from "dotenv";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { createLLM } from "./config/models.js";
import readlinePromises from "readline/promises";
import { spawnSync } from "child_process";

dotenv.config();

// ── Router ────────────────────────────────────────────────────────────────────
// Classifies the user's input into one of five intents and delegates
// to the appropriate module script.
//
// FREE TIER:  createLLM("flash") → gemini-1.5-flash
// PAID TIER:  createLLM("flash") → gemini-2.5-flash
// (routing is a simple classification — Flash is more than sufficient)

const llm = createLLM("flash");

const routerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Classify the user's message into exactly one of these intents:
INGEST      — user wants to add/import a meeting transcript or session notes
QUERY       — user asks a question about the project, product, or documentation
ERROR_SAVE  — user wants to save/document an error and its solution
ERROR_QUERY — user is looking for help with an error or bug
DEPLOYMENT  — user asks about deployed branches, environments, or wants to notify Slack

Reply with only the intent label. Nothing else.`,
  ],
  ["human", "{input}"],
]);

const routerChain = RunnableSequence.from([
  routerPrompt,
  llm,
  new StringOutputParser(),
]);

type Intent = "INGEST" | "QUERY" | "ERROR_SAVE" | "ERROR_QUERY" | "DEPLOYMENT";

const MODULE_SCRIPTS: Record<Intent, string> = {
  INGEST: "src/modules/ingestion/meetingIngestion.ts",
  QUERY: "src/modules/qa/documentationQA.ts",
  ERROR_SAVE: "src/modules/errors/errorKnowledgeBase.ts",
  ERROR_QUERY: "src/modules/errors/errorKnowledgeBase.ts",
  DEPLOYMENT: "src/modules/deployment/deploymentAgent.ts",
};

function runModule(script: string): void {
  spawnSync("ts-node", ["--esm", script], { stdio: "inherit" });
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const rl = readlinePromises.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("╔══════════════════════════════════════╗");
console.log("║   Engineering Knowledge Hub           ║");
console.log("╚══════════════════════════════════════╝");
console.log("\nExamples:");
console.log('  "I have a meeting transcript to add"');
console.log('  "What is the billing flow?"');
console.log('  "Save this error: CloudFormation stack limit reached"');
console.log('  "We hit a max stacks error, how do we fix it?"');
console.log('  "What branch is in DEV for api-gateway?"');
console.log('\nType "exit" to quit.\n');

while (true) {
  const input = (await rl.question("You: ")).trim();
  if (input.toLowerCase() === "exit") break;

  const raw = await routerChain.invoke({ input });
  const intent = raw.trim().toUpperCase() as Intent;

  console.log(`\nRouting to: ${intent}\n`);

  const script = MODULE_SCRIPTS[intent];
  if (!script) {
    console.log("Could not classify intent. Try rephrasing.\n");
    continue;
  }

  rl.close();
  runModule(script);
  break;
}
