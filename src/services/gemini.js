import { GoogleGenerativeAI } from '@google/generative-ai';
import { LOGIWA_API_BASE_INSTRUCTIONS } from '../constants/logiwaContext';
import { getRelevantArticles, getRelevantSwagger } from '../constants/contextFilter';

export async function generateConsultantResponse(keys, chatHistory) {
  const { geminiKey, deepseekKey } = keys;
  try {
    if (!geminiKey) throw new Error("Gemini API key is required as primary.");
    
    const genAI = new GoogleGenerativeAI(geminiKey);
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
    const relevantArticles = getRelevantArticles(lastUserMessage, 3);
    const relevantSwagger = getRelevantSwagger(lastUserMessage, 5);

    promptText += `\n--- DYNAMIC CONTEXT INJECTED BY SYSTEM ---\n`;
    promptText += `### RELEVANT HELP CENTER ARTICLES:\n${JSON.stringify(relevantArticles)}\n\n`;
    promptText += `### RELEVANT SWAGGER API PATHS:\n${JSON.stringify(relevantSwagger)}\n\n`;
    promptText += "Consultant: ";

    const result = await model.generateContent(promptText);
    const response = await result.response;
    return response.text();
  } catch (error) {
    const errorMsg = error.message || "";
    if (errorMsg.includes("429") || errorMsg.includes("Quota exceeded") || errorMsg.includes("QuotaFailure")) {
      console.warn("Gemini Quota Exceeded. Falling back to DeepSeek...");
      if (!deepseekKey) {
        throw new Error("Gemini quota exceeded (429). Please provide a DeepSeek API key in the top right to use the fallback.");
      }
      return await generateDeepSeekResponse(deepseekKey, chatHistory);
    }
    console.error("Gemini API Error:", error);
    throw new Error(errorMsg || "Failed to communicate with the AI consultant.");
  }
}

async function generateDeepSeekResponse(apiKey, chatHistory) {
  const lastUserMessage = chatHistory[chatHistory.length - 1].content;
  const relevantArticles = getRelevantArticles(lastUserMessage, 3);
  const relevantSwagger = getRelevantSwagger(lastUserMessage, 5);

  const systemPrompt = LOGIWA_API_BASE_INSTRUCTIONS + `\n\n--- DYNAMIC CONTEXT ---\n` +
    `HELP CENTER ARTICLES:\n${JSON.stringify(relevantArticles)}\n\n` +
    `SWAGGER API:\n${JSON.stringify(relevantSwagger)}`;

  const messages = [
    { role: "system", content: systemPrompt }
  ];
  
  for (const msg of chatHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: messages,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`DeepSeek API Error: ${response.status} - ${errData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
