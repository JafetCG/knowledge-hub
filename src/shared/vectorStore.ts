import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { createEmbeddings } from "../config/models.js";

dotenv.config();

export async function getVectorStore(): Promise<PineconeStore> {
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const pineconeIndex = pinecone.index(
    process.env.PINECONE_INDEX!,
    process.env.PINECONE_HOST
  );

  return PineconeStore.fromExistingIndex(createEmbeddings(), { pineconeIndex });
}
