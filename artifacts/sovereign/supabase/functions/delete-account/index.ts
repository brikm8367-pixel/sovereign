import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 🔥 رؤوس CORS الثابتة
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

serve(async (req) => {
  // 🔥 التعامل مع طلب OPTIONS (ما قبل CORS)
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 1. حذف الرسائل
    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`);
    if (messagesError) console.error("Messages delete error:", messagesError);

    // 2. حذف بطاقات الصفقات
    const { error: dealsError } = await supabase
      .from("deal_cards")
      .delete()
      .or(`sender_id.eq.${user_id},celebrity_id.eq.${user_id}`);
    if (dealsError) console.error("Deals delete error:", dealsError);

    // 3. حذف روابط المديرين
    const { error: linksError } = await supabase
      .from("manager_links")
      .delete()
      .or(`manager_id.eq.${user_id},celebrity_id.eq.${user_id}`);
    if (linksError) console.error("Links delete error:", linksError);

    // 4. حذف مفاتيح التشفير (device_keys)
    try {
      const { error: deviceKeysError } = await supabase
        .from("device_keys")
        .delete()
        .eq("user_id", user_id);
      if (deviceKeysError) console.error("Device keys delete error:", deviceKeysError);
    } catch (e) {
      console.error("Device keys delete exception:", e);
    }

    // 5. حذف اشتراكات الإشعارات (push_subscriptions)
    try {
      const { error: pushSubsError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user_id);
      if (pushSubsError) console.error("Push subscriptions delete error:", pushSubsError);
    } catch (e) {
      console.error("Push subscriptions delete exception:", e);
    }

    // 6. حذف حدود الرسائل (message_limits)
    try {
      const { error: msgLimitsError } = await supabase
        .from("message_limits")
        .delete()
        .eq("user_id", user_id);
      if (msgLimitsError) console.error("Message limits delete error:", msgLimitsError);
    } catch (e) {
      console.error("Message limits delete exception:", e);
    }

    // 7. حذف المحادثات المثبتة (pinned_conversations)
    try {
      const { error: pinnedConvError } = await supabase
        .from("pinned_conversations")
        .delete()
        .eq("user_id", user_id);
      if (pinnedConvError) console.error("Pinned conversations delete error:", pinnedConvError);
    } catch (e) {
      console.error("Pinned conversations delete exception:", e);
    }

    // 8. حذف الوصول المباشر (direct_access)
    try {
      const { error: directAccessError } = await supabase
        .from("direct_access")
        .delete()
        .or(`owner_id.eq.${user_id},allowed_user_id.eq.${user_id}`);
      if (directAccessError) console.error("Direct access delete error:", directAccessError);
    } catch (e) {
      console.error("Direct access delete exception:", e);
    }

    // 9. حذف دعوات المديرين (manager_invitations)
    try {
      const { error: mgrInvError } = await supabase
        .from("manager_invitations")
        .delete()
        .or(`celebrity_id.eq.${user_id},manager_id.eq.${user_id}`);
      if (mgrInvError) console.error("Manager invitations delete error:", mgrInvError);
    } catch (e) {
      console.error("Manager invitations delete exception:", e);
    }

    // 10. حذف جلسات التشفير (ratchet_sessions)
    try {
      const { error: ratchetError } = await supabase
        .from("ratchet_sessions")
        .delete()
        .or(`user_id.eq.${user_id},partner_id.eq.${user_id}`);
      if (ratchetError) console.error("Ratchet sessions delete error:", ratchetError);
    } catch (e) {
      console.error("Ratchet sessions delete exception:", e);
    }

    // 11. حذف الملف الشخصي
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", user_id);
    if (profileError) console.error("Profile delete error:", profileError);

    // 12. حذف المستخدم
    const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (userError) throw userError;

    return new Response(
      JSON.stringify({ success: true, message: "Account deleted successfully" }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
