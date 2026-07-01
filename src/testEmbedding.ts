import dotenv from "dotenv";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

dotenv.config();

console.log("Testing embedding model...");
console.log("API Key:", process.env.GOOGLE_API_KEY?.slice(0, 10) + "...");

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: "gemini-embedding-001",
  apiKey: process.env.GOOGLE_API_KEY,
});

try {
  const result = await embeddings.embedQuery("hello world");
  console.log("Success! Vector length:", result.length);
  console.log("First 3 values:", result.slice(0, 3));
} catch (e: any) {
  console.error("Error:", e.message);
}
