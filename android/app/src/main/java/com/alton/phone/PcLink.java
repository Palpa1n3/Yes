package com.alton.phone;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sends each new phone message straight to the paired PC (over the same address the app uses,
 * usually Tailscale, with the phone's pairing token), so the PC can read it out, even with
 * Alton closed. Then, for a few minutes, it checks whether the user replied from the PC and
 * sends that reply through the message's own notification. Nothing goes anywhere but the PC.
 */
final class PcLink {
    private static final String PREFS = "alton_pclink";
    private static volatile long pollUntil = 0;
    private static volatile boolean polling = false;

    private PcLink() {}

    static void save(Context ctx, String base, String token, boolean on) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("base", base == null ? "" : base.replaceAll("/+$", ""))
            .putString("token", token == null ? "" : token)
            .putBoolean("on", on)
            .apply();
    }

    static boolean ready(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return p.getBoolean("on", false) && !p.getString("base", "").isEmpty() && !p.getString("token", "").isEmpty();
    }

    private static String http(Context ctx, String method, String path, String body) throws Exception {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        HttpURLConnection c = (HttpURLConnection) new URL(p.getString("base", "") + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(8000);
        c.setReadTimeout(10000);
        c.setRequestProperty("Authorization", "Bearer " + p.getString("token", ""));
        c.setRequestProperty("Accept", "application/json");
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) {
                o.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = c.getResponseCode();
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        if (in != null) {
            byte[] b = new byte[4096];
            int n;
            while ((n = in.read(b)) > 0) buf.write(b, 0, n);
            in.close();
        }
        c.disconnect();
        if (code >= 400) throw new Exception("PC said " + code);
        return buf.toString("UTF-8");
    }

    /** Send one message to the PC (in the background). Returns a log line now. */
    static String send(final Context ctx, final JSONObject msg) {
        if (!ready(ctx)) return "not sent to PC (off, or not paired)";
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                http(app, "POST", "/api/phone-messages", msg.toString());
                MsgLog.add(app, "Sent to the PC: " + msg.optString("from"));
                pollUntil = System.currentTimeMillis() + 5 * 60_000L;
                startPolling(app);
            } catch (Exception e) {
                MsgLog.add(app, "Couldn't reach the PC: " + e.getMessage());
            }
        }).start();
        return "sending to the PC";
    }

    /** Check for replies typed or said on the PC, every 10 s for 5 minutes after a message. */
    private static synchronized void startPolling(final Context ctx) {
        if (polling) return;
        polling = true;
        new Thread(() -> {
            try {
                while (System.currentTimeMillis() < pollUntil) {
                    try {
                        JSONArray a = new JSONObject(http(ctx, "GET", "/api/phone-replies", null)).optJSONArray("replies");
                        for (int i = 0; a != null && i < a.length(); i++) {
                            JSONObject r = a.getJSONObject(i);
                            String err = MessageListener.reply(ctx, r.optString("id"), r.optString("text"));
                            MsgLog.add(ctx, err == null ? "Reply from the PC sent to " + r.optString("to") : "Reply from the PC failed: " + err);
                            JSONObject res = new JSONObject().put("id", r.optString("rid")).put("ok", err == null);
                            if (err != null) res.put("error", err);
                            http(ctx, "POST", "/api/phone-replies/result", res.toString());
                        }
                    } catch (Exception ignored) {}
                    Thread.sleep(10_000);
                }
            } catch (InterruptedException ignored) {
            } finally {
                polling = false;
            }
        }).start();
    }

    /** The app is open and wants replies checked now (it polls as well while open). */
    static void pollSoon(Context ctx) {
        if (!ready(ctx)) return;
        pollUntil = Math.max(pollUntil, System.currentTimeMillis() + 60_000L);
        startPolling(ctx.getApplicationContext());
    }
}
