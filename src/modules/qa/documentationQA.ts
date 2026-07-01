import dotenv from "dotenv";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { createLLM } from "../../config/models.js";
import { getVectorStore } from "../../shared/vectorStore.js";
import { chat, ChatHandler } from "../../utils/chat.js";

dotenv.config();

// Module 2 — Documentation Q&A
//
// Active: basic vector store retrieval + generation + chat history
//
// Upgrade path (requires @langchain/community):
//   import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";
//   import { LLMChainExtractor } from "langchain/retrievers/document_compressors";
//   const compressor = LLMChainExtractor.fromLLM(llmFlash);
//   const compressedRetriever = new ContextualCompressionRetriever({
//     baseCompressor: compressor,
//     baseRetriever,
//   });
//   → reduces token payload by ~60% before generation
//
// FREE TIER:  createLLM("flash") → gemini-1.5-flash for all steps
// PAID TIER:
//   Retriever compression → createLLM("flash") → gemini-2.5-flash
//   Generation            → createLLM("pro")   → gemini-2.5-pro

const llmFlash = createLLM("flash");
const llmGen   = createLLM("flash"); // PAID: change to createLLM("pro")

const vectorStore   = await getVectorStore();
const baseRetriever = vectorStore.asRetriever({
  filter: { type: { $in: ["meeting", "doc", "error"] } },
  k: 4,
});

// Formats retrieved documents into a single string for the prompt
const formatDocuments = (docs: Document[]): string =>
  docs.map((d) => d.pageContent).join("\n\n---\n\n");

const generationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a technical assistant for a software development team.
Answer questions using the context provided below. Be thorough and descriptive — include all relevant details, steps, and explanations from the context.
If the context does not contain enough information, say so explicitly — do not fabricate.
When answering, structure your response clearly: explain the concept, provide steps if applicable, and mention any important constraints or notes.
Cite the source ticket or document when available.

Context:
{context}`,
  ],
  new MessagesPlaceholder("chat_history"),
  ["human", "{question}"],
]);

const qcPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Given the chat history and the user's latest question, rewrite the question so it can be
understood without the chat history. Return only the rewritten question, nothing else.`,
  ],
  new MessagesPlaceholder("chat_history"),
  ["human", "{question}"],
]);

const outputParser = new StringOutputParser();
const qcChain      = RunnableSequence.from([qcPrompt, llmFlash, outputParser]);

const retrievalChain = RunnableSequence.from([
  (input: { question: string }) => input.question,
  baseRetriever,
  formatDocuments,
]);

const generationChain = RunnableSequence.from([
  {
    question:     (input: { question: string; chat_history: BaseMessage[] }) => input.question,
    context:      retrievalChain,
    chat_history: (input: { question: string; chat_history: BaseMessage[] }) => input.chat_history,
  },
  generationPrompt,
  llmGen,
  outputParser,
]);

const chatHistory: BaseMessage[] = [];

const chatHandler: ChatHandler = async (question: string) => {
  let contextualQuestion = question;

  if (chatHistory.length > 0) {
    contextualQuestion = await qcChain.invoke({ question, chat_history: chatHistory });
    console.log(`Contextualized: ${contextualQuestion}`);
  }

  return {
    answer: generationChain.stream({ question: contextualQuestion, chat_history: chatHistory }),
    answerCallBack: async (answerText: string) => {
      chatHistory.push(new HumanMessage(contextualQuestion));
      chatHistory.push(new AIMessage(answerText));
    },
  };
};

console.log("=== Documentation Q&A ===");
console.log('Ask a question about the project. Type "exit" to quit.\n');
chat(chatHandler);
