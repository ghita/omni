import { defineTool } from '@github/copilot-sdk';
import { z } from 'zod';

export const jokeTool = defineTool('joke_tool', {
  description: 'Returns a short, friendly joke',
  parameters: z.object({}),
  handler: async () => {
    const jokes = [
      "Why did the programmer quit his job? Because he didn't get arrays.",
      "There are only 10 kinds of people in the world: those who understand binary and those who don't.",
      "I would tell you a UDP joke, but you might not get it.",
      'A SQL query walks into a bar, walks up to two tables and asks: "Can I join you?"',
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  },
});