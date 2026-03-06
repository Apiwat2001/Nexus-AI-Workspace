import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiService = {
  async getTaskSuggestions(projectDescription: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Given this project description: "${projectDescription}", suggest 5 high-priority tasks with titles and brief descriptions.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              priority: { type: Type.STRING, enum: ["low", "medium", "high"] }
            },
            required: ["title", "description", "priority"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  },

  async analyzeProductivity(tasks: any[]) {
    const taskSummary = tasks.map(t => `${t.title} (${t.status})`).join(", ");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following tasks and provide a brief productivity insight (max 2 sentences): ${taskSummary}`,
    });
    return response.text;
  }
};
