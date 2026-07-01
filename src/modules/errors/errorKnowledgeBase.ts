import dotenv from "dotenv";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser, StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { createLLM, createEmbeddings } from "../../config/models.js";
import { getVectorStore } from "../../shared/vectorStore.js";
import readlinePromises from "readline/promises";

dotenv.config();

// Module 3 — Error Knowledge Base
//
// Upgrade path (requires @langchain/community):
//   import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";
//   import { LLMChainExtractor } from "langchain/retrievers/document_compressors";
//   const compressor = LLMChainExtractor.fromLLM(llm);
//   const compressedRetriever = new ContextualCompressionRetriever({ baseCompressor: compressor, baseRetriever });
//
// FREE TIER:  createLLM("flash") → gemini-1.5-flash
// PAID TIER:  createLLM("flash") → gemini-2.5-flash

const llm = createLLM("flash");

// ── SAVE ──────────────────────────────────────────────────────────────────────

const structurePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a technical documentation assistant. Structure the following error report into a JSON object.

Return ONLY a valid JSON object with this structure:
{{
  "title":      "short descriptive title",
  "signature":  "the error message or key identifier",
  "rootCause":  "one-line root cause",
  "resolution": ["step 1", "step 2"],
  "service":    "infrastructure | backend | frontend | database",
  "severity":   "low | medium | high | critical",
  "tags":       ["tag1", "tag2"]
}}

Return only the JSON object. No markdown, no extra text.`,
  ],
  ["human", "Error: {error}\n\nSolution: {solution}"],
]);

const jsonParser = new JsonOutputParser();
const structureChain = RunnableSequence.from([structurePrompt, llm, jsonParser]);

export async function saveError(error: string, solution: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const structured: any = await structureChain.invoke({ error, solution });
  console.log("\nStructured entry:\n", JSON.stringify(structured, null, 2));

  const pinecone      = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX!);

  const content = [
    structured.title,
    structured.signature,
    structured.rootCause,
    (structured.resolution ?? []).join(" "),
  ].join("\n");

  const doc = new Document({
    pageContent: content,
    metadata: {
      type:     "error",
      service:  structured.service  ?? "unknown",
      severity: structured.severity ?? "medium",
      tags:     (structured.tags ?? []).join(", "),
      date:     new Date().toISOString(),
    },
  });

  await PineconeStore.fromDocuments([doc], createEmbeddings(), { pineconeIndex });
  console.log("\nError saved. Metadata:", doc.metadata);
}

// ── QUERY ─────────────────────────────────────────────────────────────────────

const answerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a technical support assistant. Using the error records below, help resolve the reported issue.
Include the root cause and resolution steps. If nothing matches, say so clearly.

Error records:
{context}`,
  ],
  ["human", "Developer reports: {question}"],
]);

const stringParser = new StringOutputParser();

export async function queryErrors(question: string): Promise<void> {
  const vectorStore = await getVectorStore();

  const retriever = vectorStore.asRetriever({
    filter: { type: { $eq: "error" } },
    k: 3,
  });

  const docs    = await retriever.invoke(question);
  const context = docs.map((d: Document) => d.pageContent).join("\n\n---\n\n");

  const chain  = RunnableSequence.from([answerPrompt, llm, stringParser]);
  const answer = await chain.invoke({ question, context });

  console.log("\nAI:", answer);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });

console.log("=== Error Knowledge Base ===");
console.log('Commands: "save" · "query" · "exit"\n');

while (true) {
  const command = (await rl.question("Command: ")).trim().toLowerCase();

  if (command === "exit") break;

  if (command === "save") {
    const error    = await rl.question("Error description: ");
    const solution = await rl.question("Solution / resolution steps: ");
    await saveError(error, solution);

  } else if (command === "query") {
    const question = await rl.question("Describe the error you're facing: ");
    await queryErrors(question);

  } else {
    console.log('Unknown command. Use "save", "query", or "exit".');
  }

  console.log();
}

rl.close();
