import { GoogleGenerativeAI } from '@google/generative-ai';
import { LOGIWA_API_CONTEXT } from '../constants/logiwaContext';

export async function generateConsultantResponse(apiKey, chatHistory) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: LOGIWA_API_CONTEXT 
    });
    
    let promptText = "--- Conversation History ---\n";
    for (const msg of chatHistory) {
      const roleName = msg.role === 'user' ? 'User' : 'Consultant';
      promptText += `${roleName}: ${msg.content}\n`;
    }
    promptText += "Consultant: ";

    const result = await model.generateContent(promptText);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to communicate with the AI consultant.");
  }
}
