import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "1";

test("authenticated user can read reminder settings and learning plans", { skip: !enabled }, async () => {
  const url = process.env.SUPABASE_TEST_URL;
  const key = process.env.SUPABASE_TEST_ANON_KEY;
  const email = process.env.SUPABASE_TEST_EMAIL;
  const password = process.env.SUPABASE_TEST_PASSWORD;
  assert.ok(url && key && email && password, "Missing SUPABASE_TEST_* variables");
  const client = createClient(url, key);
  const auth = await client.auth.signInWithPassword({ email, password });
  assert.equal(auth.error, null);
  const [plans, reminders] = await Promise.all([
    client.from("learning_plans").select("id").limit(1),
    client.from("study_reminder_settings").select("user_id,push_notifications,email_notifications").maybeSingle(),
  ]);
  assert.equal(plans.error, null);
  assert.equal(reminders.error, null);
  await client.auth.signOut();
});
