import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  corsHeaders,
  jsonResponse,
  signSession,
  verifySession,
} from "./helpers.ts";

type ManageAction = "insert" | "approve" | "reject" | "update" | "delete";

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() || "";
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    topic: row.topic,
    content: row.content,
    status: row.status,
    source: row.source,
    feedbackId: row.feedback_id || null,
    upvotes: row.upvotes || 0,
    downvotes: row.downvotes || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function topicFromCorrection(correctionText: string, questionText = "") {
  const fromCorrection = String(correctionText || "").trim().split(/[.!?\n]/)[0];
  if (fromCorrection && fromCorrection.length >= 8) {
    return fromCorrection.slice(0, 120);
  }
  const fromQuestion = String(questionText || "").trim().slice(0, 120);
  return fromQuestion || "User correction";
}

function adminClient() {
  const url = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function manageKnowledge(
  supabase: ReturnType<typeof adminClient>,
  payload: {
    action: ManageAction;
    id?: string | null;
    topic?: string | null;
    content?: string | null;
    status?: string | null;
    source?: string | null;
    feedbackId?: string | null;
  },
) {
  const teamSecret = requireEnv("TEAM_WRITE_SECRET");
  const { data, error } = await supabase.rpc("manage_knowledge", {
    p_secret: teamSecret,
    p_action: payload.action,
    p_id: payload.id || null,
    p_topic: payload.topic ?? null,
    p_content: payload.content ?? null,
    p_status: payload.status ?? null,
    p_source: payload.source ?? "teach",
    p_feedback_id: payload.feedbackId ?? null,
  });
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  try {
    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "login") {
      const username = String(body?.username || "").trim();
      const password = String(body?.password || "");
      const expectedUser = requireEnv("APP_USERNAME");
      const expectedPass = requireEnv("APP_PASSWORD");
      if (username !== expectedUser || password !== expectedPass) {
        return jsonResponse({ error: "Invalid username or password." }, 401, req);
      }
      const session = await signSession(username, requireEnv("SESSION_SIGNING_KEY"));
      return jsonResponse(session, 200, req);
    }

    const session = await verifySession(
      req.headers.get("Authorization"),
      requireEnv("SESSION_SIGNING_KEY"),
    );
    if (!session) {
      return jsonResponse({ error: "Unauthorized" }, 401, req);
    }

    const supabase = adminClient();

    if (action === "listKnowledge") {
      const { data, error } = await supabase
        .from("knowledge_entries")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ entries: (data || []).map(mapRow) }, 200, req);
    }

    if (action === "submitFeedback") {
      const rating = body?.rating === "up" ? "up" : body?.rating === "down" ? "down" : null;
      if (!rating) return jsonResponse({ error: "rating must be up or down" }, 400, req);

      const feedbackRow = {
        rating,
        question_text: String(body?.questionText || ""),
        answer_text: String(body?.answerText || ""),
        correction_text: body?.correctionText ? String(body.correctionText) : null,
        provider: body?.provider ? String(body.provider) : null,
        client_id: String(body?.clientId || "anonymous"),
      };

      const { data: feedback, error } = await supabase
        .from("answer_feedback")
        .insert(feedbackRow)
        .select()
        .single();
      if (error) throw error;

      let pendingKnowledge = null;
      if (rating === "down" && feedbackRow.correction_text) {
        const { data: pending, error: pendingError } = await supabase
          .from("knowledge_entries")
          .insert({
            topic: topicFromCorrection(
              feedbackRow.correction_text,
              feedbackRow.question_text,
            ),
            content: feedbackRow.correction_text,
            status: "pending",
            source: "correction",
            feedback_id: feedback.id,
          })
          .select()
          .single();
        if (pendingError) throw pendingError;
        pendingKnowledge = mapRow(pending as Record<string, unknown>);
      }

      return jsonResponse({ feedback, pendingKnowledge }, 200, req);
    }

    if (action === "saveKnowledge") {
      const topic = String(body?.topic || "");
      const content = String(body?.content || "");
      const status = body?.status === "pending" ? "pending" : "approved";
      const source = String(body?.source || "teach");
      const feedbackId = body?.feedbackId || null;

      if (status === "pending") {
        const { data, error } = await supabase
          .from("knowledge_entries")
          .insert({
            topic,
            content,
            status: "pending",
            source,
            feedback_id: feedbackId,
          })
          .select()
          .single();
        if (error) throw error;
        return jsonResponse({ entry: mapRow(data as Record<string, unknown>) }, 200, req);
      }

      const entry = await manageKnowledge(supabase, {
        action: "insert",
        topic,
        content,
        status: "approved",
        source,
        feedbackId,
      });
      return jsonResponse({ entry }, 200, req);
    }

    if (action === "approve" || action === "reject" || action === "update" || action === "delete") {
      const id = body?.id;
      if (!id) return jsonResponse({ error: "id required" }, 400, req);
      const entry = await manageKnowledge(supabase, {
        action,
        id,
        topic: body?.topic ?? null,
        content: body?.content ?? null,
        status: body?.status ?? null,
      });
      return jsonResponse({ entry }, 200, req);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("kb-api error", message);
    return jsonResponse({ error: message }, 500, req);
  }
});
