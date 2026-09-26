const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function rest(path: string, token: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anonKey, Authorization: token },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Bạn cần đăng nhập." }, 401);
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) return json({ error: "OPENAI_API_KEY chưa được cấu hình cho Edge Function." }, 503);
    const { planId } = await request.json();
    if (!planId || typeof planId !== "string") return json({ error: "planId không hợp lệ." }, 400);

    const encodedPlanId = encodeURIComponent(planId);
    const [plans, assessments, bugs, tests, lessons] = await Promise.all([
      rest(`learning_plans?id=eq.${encodedPlanId}&select=title,current_band,target_band,weekly_minutes,exam_date`, authorization),
      rest(`diagnostic_assessments?plan_id=eq.${encodedPlanId}&select=listening_raw,reading_raw,writing_band,speaking_band,estimated_band,difficult_skills&order=completed_at.desc&limit=1`, authorization),
      rest(`bugs?plan_id=eq.${encodedPlanId}&status=eq.OPEN&select=skill,cause,correction&order=detected_on.desc&limit=30`, authorization),
      rest(`test_results?plan_id=eq.${encodedPlanId}&select=label,test_date,listening_band,reading_band,writing_band,speaking_band,overall_band,conclusion&order=test_date.desc&limit=10`, authorization),
      rest(`daily_lessons?plan_id=eq.${encodedPlanId}&select=skill,status,duration_minutes,title&order=lesson_date.desc&limit=40`, authorization),
    ]);
    if (!plans.length) return json({ error: "Không tìm thấy lộ trình hoặc bạn không có quyền truy cập." }, 404);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
        store: false,
        instructions: "Bạn là IELTS learning coach. Phân tích dữ liệu người học, ưu tiên lỗi lặp lại và kỹ năng yếu. Đề xuất đúng 3 bài học cụ thể, khả thi, bằng tiếng Việt. Không khẳng định band chính thức từ dữ liệu tự đánh giá.",
        input: JSON.stringify({ plan: plans[0], assessment: assessments[0] ?? null, openBugs: bugs, recentTests: tests, recentLessons: lessons }),
        text: {
          format: {
            type: "json_schema",
            name: "learning_recommendations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      reason: { type: "string" },
                      skill: { type: "string", enum: ["Listening", "Reading", "Writing", "Speaking", "Grammar / Vocab", "Review"] },
                      duration: { type: "integer", minimum: 15, maximum: 120 },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["title", "reason", "skill", "duration", "priority"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["recommendations"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) return json({ error: `OpenAI API: ${await response.text()}` }, 502);
    const result = await response.json();
    const outputText = result.output
      ?.flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? [])
      .find((item: { type: string }) => item.type === "output_text")?.text;
    if (!outputText) return json({ error: "OpenAI không trả về nội dung đề xuất." }, 502);
    return json(JSON.parse(outputText));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Lỗi không xác định." }, 500);
  }
});
