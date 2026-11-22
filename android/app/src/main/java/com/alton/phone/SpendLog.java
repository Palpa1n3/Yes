package com.alton.phone;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Spending: keeps notifications from the bank apps the user picked (Settings › Phone ›
 * Spending) that mention an amount in pounds, so Alton can say what was spent since payday.
 * Stored only in this app's private storage on the phone (last 400), never sent anywhere.
 * The JS side (src/shared/spending.ts) turns them into payments.
 */
public final class SpendLog {
    static final String PREFS = "alton_spend";
    private static final int MAX = 400;
    private static final Pattern MONEY = Pattern.compile("(£|GBP)\\s?\\d");

    private SpendLog() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void setApps(Context ctx, JSONArray pkgs) {
        prefs(ctx).edit().putString("apps", pkgs.toString()).apply();
    }

    static boolean watched(Context ctx, String pkg) {
        try {
            JSONArray a = new JSONArray(prefs(ctx).getString("apps", "[]"));
            for (int i = 0; i < a.length(); i++) if (pkg.equals(a.optString(i))) return true;
        } catch (Exception ignored) {}
        return false;
    }

    /** Called for every posted notification; keeps the ones from picked bank apps. */
    static void note(Context ctx, StatusBarNotification sbn, String appLabel) {
        try {
            if (sbn == null || !watched(ctx, sbn.getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            if (ex == null) return;
            CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (text == null) text = ex.getCharSequence(Notification.EXTRA_TEXT);
            String t = title == null ? "" : title.toString();
            String b = text == null ? "" : text.toString();
            if (!MONEY.matcher(t + " " + b).find()) return;
            SharedPreferences p = prefs(ctx);
            JSONArray log = new JSONArray(p.getString("log", "[]"));
            // The same notification updated (or re-posted) isn't a second payment.
            for (int i = Math.max(0, log.length() - 20); i < log.length(); i++) {
                JSONObject o = log.optJSONObject(i);
                if (o != null && t.equals(o.optString("title")) && b.equals(o.optString("text"))
                    && Math.abs(o.optLong("at") - sbn.getPostTime()) < 10 * 60_000L) return;
            }
            JSONObject o = new JSONObject();
            o.put("app", appLabel);
            o.put("title", t.length() > 120 ? t.substring(0, 120) : t);
            o.put("text", b.length() > 300 ? b.substring(0, 300) : b);
            o.put("at", sbn.getPostTime());
            log.put(o);
            JSONArray out = new JSONArray();
            for (int i = Math.max(0, log.length() - MAX); i < log.length(); i++) out.put(log.get(i));
            p.edit().putString("log", out.toString()).apply();
        } catch (Exception ignored) {}
    }

    static JSONArray log(Context ctx) {
        try {
            return new JSONArray(prefs(ctx).getString("log", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().remove("log").apply();
    }
}
