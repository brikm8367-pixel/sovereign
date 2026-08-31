import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
      });
    }

    const { error: messagesError } = await supabase
      .from("messages")
      .delete()
      .or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`);
    if (messagesError) console.error("Messages delete error:", messagesError);

    const { error: dealsError } = await supabase
      .from("deal_cards")
      .delete()
      .or(`sender_id.eq.${user_id},celebrity_id.eq.${user_id}`);
    if (dealsError) console.error("Deals delete error:", dealsError);

    const { error: linksError } = await supabase
      .from("manager_links")
      .delete()
      .or(`manager_id.eq.${user_id},celebrity_id.eq.${user_id}`);
    if (linksError) console.error("Links delete error:", linksError);

    const { error: userError } = await supabase.auth.admin.deleteUser(user_id);
    if (userError) throw userError;

    return new Response(
      JSON.stringify({ success: true, message: "Account deleted successfully" }),
      { status: 200 }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
