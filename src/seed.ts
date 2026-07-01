import dotenv from "dotenv";
import { Document } from "@langchain/core/documents";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { createEmbeddings } from "./config/models.js";

dotenv.config();

// Quick seed script — loads sample documents into Pinecone so Q&A works immediately.
// Run once with: npm run seed

const docs = [
  new Document({
    pageContent:
      "The deployment pipeline uses AWS CDK. Services are deployed independently to DEV and SQA environments. " +
      "Each microservice has its own CloudFormation stack. To list stacks: aws cloudformation list-stacks. " +
      "The free tier allows up to 200 stacks per account.",
    metadata: { type: "doc", category: "infrastructure", date: new Date().toISOString() },
  }),
  new Document({
    pageContent:
      "The authentication service handles login, token refresh, and session management. " +
      "It uses JWT tokens with a 1-hour expiry. Refresh tokens are stored in Redis with a 7-day TTL. " +
      "SSO login is handled via a separate portal-frontend service.",
    metadata: { type: "doc", category: "backend", date: new Date().toISOString() },
  }),
  new Document({
    pageContent:
      "The API gateway routes requests to downstream microservices. " +
      "Rate limiting is set to 100 requests per minute per user. " +
      "All endpoints require a valid Authorization header with a Bearer token.",
    metadata: { type: "doc", category: "backend", date: new Date().toISOString() },
  }),
  new Document({
    pageContent:
      "CloudFormation max stacks error: AWS accounts have a default limit of 200 stacks. " +
      "Resolution: (1) Run 'aws cloudformation list-stacks --stack-status-filter DELETE_COMPLETE' to find deletable stacks. " +
      "(2) Delete unused stacks with 'aws cloudformation delete-stack --stack-name STACK_NAME'. " +
      "(3) Request a limit increase via AWS Support if needed.",
    metadata: { type: "error", service: "infrastructure", severity: "high", date: new Date().toISOString() },
  }),
  new Document({
    pageContent:
      "Sprint refinement session — June 30 2026. " +
      "Tickets discussed: TICKET-101 (API gateway rate limiting), TICKET-234 (auth token refresh bug). " +
      "Decision: rate limiting will be configurable per environment. " +
      "Action item: backend team to add environment variable for rate limit threshold by next sprint.",
    metadata: { type: "meeting", ticket: "TICKET-101, TICKET-234", initiative: "platform", date: new Date().toISOString() },
  }),
];

console.log("Connecting to Pinecone...");
const pinecone      = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX!, process.env.PINECONE_HOST);

console.log(`Loading ${docs.length} documents...`);
await PineconeStore.fromDocuments(docs, createEmbeddings(), { pineconeIndex });

console.log("Done. You can now run: npm run qa");
