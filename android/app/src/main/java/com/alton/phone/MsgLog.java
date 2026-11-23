package com.alton.phone;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;

/**
 * The messages step log: each message notification seen, whether it counted as a message,
 * and why it was or wasn't read out / sent to the PC. Kept in this app's private storage
 * (last 80 lines) so it survives with Alton closed. Shown in Settings › Phone › Messages.
 */
final class MsgLog {
    private static final String PREFS = "alton_msglog";
    private static final int MAX = 80;

    private MsgLog() {}

    static synchronized void add(Context ctx, String line) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray a = new JSONArray(p.getString("log", "[]"));
            String t = new SimpleDateFormat("EEE HH:mm:ss", Locale.UK).format(new Date());
            a.put(t + "  " + (line.length() > 300 ? line.substring(0, 300) + "…" : line));
            JSONArray out = new JSONArray();
            for (int i = Math.max(0, a.length() - MAX); i < a.length(); i++) out.put(a.get(i));
            p.edit().putString("log", out.toString()).apply();
        } catch (Exception ignored) {}
    }

    static String text(Context ctx) {
        try {
            JSONArray a = new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("log", "[]"));
            StringBuilder sb = new StringBuilder();
            for (int i = a.length() - 1; i >= 0; i--) sb.append(a.getString(i)).append('\n');
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /** Hide one-time codes and passwords (same rules as src/shared/messages.ts hideCodes). */
    static String hideCodes(String text) {
        if (text == null) return "";
        if (!java.util.regex.Pattern.compile(
                "\\b(code|otp|passcode|password|pin|verification|verify|2fa|one[- ]?time|security|login|sign[- ]?in|authenticat\\w*)\\b",
                java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text).find()) return text;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\b(?=[A-Z0-9-]*\\d)[A-Z0-9]+(?:-[A-Z0-9]+)*\\b").matcher(text);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String tok = m.group();
            boolean hide = tok.replace("-", "").length() >= 4;
            m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(hide ? "[code hidden]" : tok));
        }
        m.appendTail(sb);
        return sb.toString().replaceAll("(?i)((?:password|passcode|pin)\\s*(?:is|:)\\s*)(\\S+)", "$1[hidden]");
    }
}
