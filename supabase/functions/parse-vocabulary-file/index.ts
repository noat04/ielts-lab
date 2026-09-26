import readXlsxFile from "npm:read-excel-file@5/browser";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Không tìm thấy file Excel." }, 400);
    if (file.size > 10 * 1024 * 1024) return json({ error: "File vượt quá giới hạn 10 MB." }, 413);
    if (!/\.xlsx$/i.test(file.name)) return json({ error: "Edge Function chỉ nhận file .xlsx." }, 400);
    const rows = await readXlsxFile(file);
    return json({ rows });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Không thể đọc file Excel." }, 400);
  }
});
