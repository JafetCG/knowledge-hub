import readlinePromises from "readline/promises";
import { ReadableStream } from "node:stream/web";

export type ChatHandler = (question: string) => Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answer: Promise<any> | AsyncIterable<any>;
  sources?: string[];
  answerCallBack?: (answerText: string) => Promise<void>;
}>;

export const chat = async (handler: ChatHandler) => {
  const rl = readlinePromises.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const question = await rl.question("You: ");
    if (question.trim().toLowerCase() === "exit") break;

    const response   = await handler(question);
    const answer     = await response.answer;
    let   answerText = "";

    if (answer instanceof ReadableStream) {
      process.stdout.write("AI: ");
      for await (const chunk of answer) {
        if (typeof chunk === "string") {
          process.stdout.write(chunk);
          answerText += chunk;
        }
      }
      console.log("\n");
    } else if (typeof answer === "string") {
      console.log(`AI: ${answer.trimStart()}\n`);
      answerText = answer;
    } else {
      console.log(`AI: ${JSON.stringify(answer)}\n`);
    }

    if (response.sources?.length) {
      console.log(`Sources:\n${response.sources.join("\n")}\n`);
    }

    if (response.answerCallBack) {
      await response.answerCallBack(answerText);
    }
  }

  rl.close();
};
