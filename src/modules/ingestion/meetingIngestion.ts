import dotenv from "dotenv";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { createLLM, createEmbeddings } from "../../config/models.js";
import readlinePromises from "readline/promises";

dotenv.config();

// Module 1 — Meeting Ingestion Chain
// Extracts structured data from a raw session transcript and stores it
// in the vector store with metadata for later retrieval.

// FREE TIER:  createLLM("flash") → gemini-1.5-flash
// PAID TIER:  createLLM("flash") → gemini-2.5-flash (extraction doesn't need Pro)
const llm = createLLM("flash");

const extractionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a technical analyst. Extract structured information from the meeting transcript below.

Return ONLY a valid JSON object with this exact structure (use empty arrays if a field has no data):
{{
  "tickets": ["list of ticket IDs mentioned, e.g. TICKET-123"],
  "initiative": "main initiative or epic discussed",
  "decisions": ["list of technical decisions made"],
  "acceptanceCriteria": ["list of acceptance criteria identified"],
  "actionItems": ["list of action items or follow-ups"]
}}

Rules:
- Extract only what is explicitly mentioned. Do not infer or invent.
- If no tickets are found, use an empty array and set initiative to "general".
- Do not include markdown, code blocks, or any text outside the JSON object.`,
  ],
  ["human", "Transcript:\n{transcript}"],
]);

const parser = new JsonOutputParser();

const ingestionChain = RunnableSequence.from([extractionPrompt, llm, parser]);

async function ingestTranscript(transcript: string): Promise<void> {
  if (!transcript.trim()) {
    console.log("Error: transcript is empty.");
    return;
  }

  // Pre-chunk long transcripts to avoid context window limits
  const MAX_CHARS = 50_000;
  const chunks =
    transcript.length > MAX_CHARS
      ? transcript.match(/.{1,50000}/gs) ?? [transcript]
      : [transcript];

  const results = [];

  for (const chunk of chunks) {
    const extracted = await ingestionChain.invoke({ transcript: chunk });
    results.push(extracted);
  }

  // Merge results from multiple chunks
  const merged: any = {
    tickets:            results.flatMap((r) => r.tickets ?? []),
    initiative:         results[0]?.initiative ?? "general",
    decisions:          results.flatMap((r) => r.decisions ?? []),
    acceptanceCriteria: results.flatMap((r) => r.acceptanceCriteria ?? []),
    actionItems:        results.flatMap((r) => r.actionItems ?? []),
  };

  console.log("\nExtracted:\n", JSON.stringify(merged, null, 2));

  // Store in Pinecone
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX!);

  const doc = new Document({
    pageContent: JSON.stringify(merged),
    metadata: {
      type:       "meeting",
      tickets:    merged.tickets.join(", "),
      initiative: merged.initiative,
      date:       new Date().toISOString(),
    },
  });

  await PineconeStore.fromDocuments([doc], createEmbeddings(), { pineconeIndex });

  console.log("\nStored in vector store. Metadata:", doc.metadata);
}

// Run standalone
const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });

console.log("=== Meeting Ingestion ===");
console.log("Paste the meeting transcript below. Type END on a new line when done.\n");

const lines: string[] = [];
while (true) {
  const line = await rl.question("");
  if (line.trim() === "END") break;
  lines.push(line);
}

rl.close();
await ingestTranscript(lines.join("\n"));
