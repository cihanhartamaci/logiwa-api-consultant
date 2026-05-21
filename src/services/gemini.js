import { GoogleGenerativeAI } from '@google/generative-ai';
import { LOGIWA_API_BASE_INSTRUCTIONS } from '../constants/logiwaContext';
import { getRelevantArticles, getRelevantSwagger } from '../constants/contextFilter';

export async function generateConsultantResponse(apiKey, chatHistory) {
  try {
    if (!apiKey) throw new Error("Gemini API key is required.");
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: LOGIWA_API_BASE_INSTRUCTIONS 
    });
    
    let promptText = "--- Conversation History ---\n";
    for (const msg of chatHistory) {
      const roleName = msg.role === 'user' ? 'User' : 'Consultant';
      promptText += `${roleName}: ${msg.content}\n`;
    }
    
    // Inject Dynamic RAG Context at the very end
    const lastUserMessage = chatHistory[chatHistory.length - 1].content;
    const relevantArticles = getRelevantArticles(lastUserMessage, 5);
    const relevantSwagger = getRelevantSwagger(lastUserMessage, 15);

    promptText += `\n--- DYNAMIC CONTEXT INJECTED BY SYSTEM ---\n`;
    promptText += `### RELEVANT HELP CENTER ARTICLES:\n${JSON.stringify(relevantArticles)}\n\n`;
    promptText += `### RELEVANT SWAGGER API PATHS:\n${JSON.stringify(relevantSwagger)}\n\n`;
    promptText += "Consultant: ";

    const result = await model.generateContent(promptText);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to communicate with the AI consultant.");
  }
}
