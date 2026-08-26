import { createClient } from "npm:@supabase/supabase-js@2";
import { setVapidDetails, sendNotification } from "npm:web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    // Check VAPID keys early - return 200 if not configured
    if (!vapidPublicKey || !vapidPrivateKey) {
      return jsonResponse({ sent: 0, message: "VAPID not configured" }, 200);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const body = await req.json();
    const { receiverId, senderName, messageType, content, conversationId, dealId } = body;

    if (!receiverId || !senderName || !content) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", receiverId);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return jsonResponse({ error: "Failed to fetch subscriptions" }, 500);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ sent: 0, message: "No subscriptions found" }, 200);
    }

    setVapidDetails(
      "mailto:support@sovereign.app",
      vapidPublicKey,
      vapidPrivateKey
    );

    const senderId = user.id;
    const notificationData = {
      conversationId: conversationId || null,
      dealId: dealId || null,
      senderId,
      url: `/chat/${senderId}?dealId=${dealId || ""}`,
    };

    const payload = JSON.stringify({
      title: senderName,
      body: content,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: `message-${conversationId || "general"}`,
      data: notificationData,
      actions: [
        { action: "reply", title: "↩️ Reply" },
        { action: "view", title: "👁️ View" },
      ],
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
    });

    let sentCount = 0;
    const sendPromises = subscriptions.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        await sendNotification(pushSubscription, payload);
        sentCount++;
      } catch (err: any) {
        console.error("Failed to send to subscription:", err);
        // Clean up invalid subscriptions (410 Gone, 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          try {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          } catch (cleanupErr) {
            console.error("Failed to cleanup invalid subscription:", cleanupErr);
          }
        }
        // Continue on failure - don't throw, just log
      }
    });

    await Promise.all(sendPromises);

    return jsonResponse({ sent: sentCount }, 200);
  } catch (error: any) {
    console.error("Edge function error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});
