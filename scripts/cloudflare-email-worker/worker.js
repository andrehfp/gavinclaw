/**
 * Cloudflare Email Worker — gavin@tinysaas.com.br
 * 
 * Receives inbound emails, parses them, and forwards to OpenClaw via webhook.
 * Also stores raw email in R2 for archival.
 */

export default {
  async email(message, env, ctx) {
    const { from, to, headers } = message;
    const subject = headers.get("subject") || "(no subject)";
    const date = headers.get("date") || new Date().toISOString();
    const messageId = headers.get("message-id") || crypto.randomUUID();

    // Read the email body
    const rawEmail = await new Response(message.raw).text();
    
    // Extract plain text body (simplified — handles most cases)
    let body = "";
    try {
      const textMatch = rawEmail.match(/Content-Type: text\/plain[\s\S]*?\n\n([\s\S]*?)(?=\n--|\n\.\n|$)/i);
      if (textMatch) {
        body = textMatch[1].trim();
      } else {
        // Fallback: grab everything after headers
        const parts = rawEmail.split("\n\n");
        if (parts.length > 1) {
          body = parts.slice(1).join("\n\n").substring(0, 5000);
        }
      }
    } catch (e) {
      body = "(could not parse body)";
    }

    // Prepare payload for OpenClaw webhook
    const payload = {
      event: "email.received",
      from: from,
      to: to,
      subject: subject,
      body: body.substring(0, 3000), // Limit body size
      date: date,
      messageId: messageId,
    };

    console.log(`📧 Email from ${from}: ${subject}`);

    // Forward to OpenClaw via Telegram (using Bot API directly)
    // This sends a notification to André's Telegram
    try {
      const telegramMessage = `📧 *Email recebido*\n\n*De:* ${from}\n*Para:* ${to}\n*Assunto:* ${subject}\n*Data:* ${date}\n\n${body.substring(0, 500)}`;
      
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          message_thread_id: env.TELEGRAM_THREAD_ID,
          text: telegramMessage,
          parse_mode: "Markdown",
        }),
      });
    } catch (e) {
      console.error("Failed to notify Telegram:", e);
    }

    // Store in R2 for archival (if bucket is configured)
    if (env.EMAIL_BUCKET) {
      try {
        const key = `emails/${new Date().toISOString().split("T")[0]}/${messageId}.eml`;
        await env.EMAIL_BUCKET.put(key, rawEmail);
      } catch (e) {
        console.error("Failed to store in R2:", e);
      }
    }

    // Forward to a fallback address (optional)
    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (e) {
        console.error("Failed to forward:", e);
      }
    }
  },
};
