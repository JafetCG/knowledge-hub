import dotenv from "dotenv";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

dotenv.config();

// ============================================================
// FREE TIER — active configuration
// LLM:       gemini-1.5-flash  (used for all tasks)
// Embedding: text-embedding-004 (768 dimensions)
// Limits:    15 RPM on chat model · 1,500 RPM on embeddings
// ============================================================

const FREE_LLM_MODEL       = "gemini-2.5-flash";
const FREE_EMBEDDING_MODEL = "gemini-embedding-001"; // 3072 dimensions — Pinecone index must match

// ============================================================
// PAID TIER — per-task assignment (see TDD §6.1)
// Flash → router, ingestion, compression, error KB, deployment
// Pro   → Q&A generation (user-facing, quality-critical)
// Embedding: gemini-embedding-001 (3072 dims)
// IMPORTANT: Pinecone index must be recreated with 3072 dims
//
// const FLASH_MODEL          = "gemini-2.5-flash";
// const PRO_MODEL            = "gemini-2.5-pro";
// const PAID_EMBEDDING_MODEL = "gemini-embedding-001";
// ============================================================

export type ModelRole = "flash" | "pro";

export function createLLM(role: ModelRole = "flash"): ChatGoogleGenerativeAI {
  // FREE TIER: same model regardless of role
  const model = FREE_LLM_MODEL;

  // PAID TIER: uncomment to activate per-task assignment
  // const model = role === "pro" ? PRO_MODEL : FLASH_MODEL;

  return new ChatGoogleGenerativeAI({ model, temperature: 0 });
}

export function createEmbeddings(): GoogleGenerativeAIEmbeddings {
  // Pinecone index must be 3072 dimensions to match gemini-embedding-001 output
  return new GoogleGenerativeAIEmbeddings({ model: FREE_EMBEDDING_MODEL });
}
