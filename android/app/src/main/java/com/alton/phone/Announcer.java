package com.alton.phone;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;

/**
 * Reads new messages out loud, even with Alton closed (it runs from the message listener).
 * Settings come from the app: off / only with headphones or car Bluetooth / always, quiet hours
 * and favourite people. Favourites (one-to-one) are read word for word straight away; group
 * chats and everyone else go into a short summary at most every 10 minutes. One-time codes and
 * passwords are never said in full. Every decision is written to the messages log.
 */
public class Announcer {

    static final String PREFS = "alton";
    private static final long BATCH_GAP = 10 * 60_000L;
    private static TextToSpeech tts;
    private static boolean ready = false;
    private static final List<String> waiting = new ArrayList<>();
    private static final Map<String, String> lastSaid = new HashMap<>();
    /** Waiting for the next summary: "chat or person" → count. */
    private static final Map<String, Integer> batch = new LinkedHashMap<>();
    private static long lastSummary = 0;
    private static boolean batchQueued = false;
    private static final Handler main = new Handler(Looper.getMainLooper());

    public static void save(Context ctx, String mode, int quietFrom, int quietTo, float rate, JSONArray favs) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("announce", mode)
            .putInt("quietFrom", quietFrom)
            .putInt("quietTo", quietTo)
            .putFloat("rate", rate)
            .putString("favs", favs == null ? "[]" : favs.toString())
            .apply();
    }

    static boolean isFavourite(Context ctx, String from, String chat) {
        if (chat != null && !chat.isEmpty()) return false;
        String who = from == null ? "" : from.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N} ]+", " ").trim();
        try {
            JSONArray a = new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("favs", "[]"));
            for (int i = 0; i < a.length(); i++) {
                String k = a.optString(i).toLowerCase(Locale.ROOT).trim();
                if (k.isEmpty()) continue;
                if (who.equals(k) || who.startsWith(k + " ")) return true;
                for (String w : who.split(" ")) if (w.equals(k)) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private static boolean headphones(AudioManager am) {
        if (Build.VERSION.SDK_INT < 23) return am.isBluetoothA2dpOn() || am.isWiredHeadsetOn();
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                || t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                || t == AudioDeviceInfo.TYPE_USB_HEADSET) return true;
            if (Build.VERSION.SDK_INT >= 31 && t == AudioDeviceInfo.TYPE_BLE_HEADSET) return true;
        }
        return false;
    }

    private static boolean quiet(int from, int to) {
        if (from == to) return false;
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return from < to ? h >= from && h < to : h >= from || h < to;
    }

    /** Why it can't speak right now (null = it can). */
    private static String blocked(Context ctx, SharedPreferences p) {
        String mode = p.getString("announce", "off");
        if ("off".equals(mode)) return "reading aloud is off (Settings › Phone › Messages)";
        if (quiet(p.getInt("quietFrom", 23), p.getInt("quietTo", 7))) return "quiet hours";
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return "no audio";
        boolean phones = headphones(am);
        if ("headphones".equals(mode) && !phones) return "set to headphones only, and none connected";
        // Through the speaker only when the phone isn't fully silent (vibrate is fine).
        if (!phones && am.getRingerMode() == AudioManager.RINGER_MODE_SILENT) return "phone on silent";
        return null;
    }

    /** A new message: read it, add it to the next summary, or say why not. Returns the reason. */
    public static String message(Context ctx, String key, String app, String from, String chat, String text) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String why = blocked(ctx, p);
        if (why != null) return "not read out: " + why;
        String t = MsgLog.hideCodes(text);
        if (t.length() > 300) t = t.substring(0, 300) + "…";
        if (t.equals(lastSaid.get(key))) return "not read out: same as last time (notification updated)";
        lastSaid.put(key, t);
        if (isFavourite(ctx, from, chat)) {
            say(ctx, from + " says: " + t, p.getFloat("rate", 1f));
            return "read out word for word (favourite)";
        }
        String k = chat != null && !chat.isEmpty() ? "in " + chat : "from " + from;
        synchronized (batch) {
            Integer n = batch.get(k);
            batch.put(k, n == null ? 1 : n + 1);
            if (!batchQueued) {
                batchQueued = true;
                long wait = Math.max(45_000L, lastSummary + BATCH_GAP - System.currentTimeMillis());
                main.postDelayed(() -> flush(ctx), wait);
                return "added to a summary in " + Math.round(wait / 60_000.0) + " min";
            }
        }
        return "added to the next summary";
    }

    /** Say the waiting summary: "3 new messages: 2 in Saturday crew, 1 from Dave." */
    private static void flush(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        StringBuilder sb = new StringBuilder();
        int total = 0;
        synchronized (batch) {
            batchQueued = false;
            int shown = 0;
            for (Map.Entry<String, Integer> e : batch.entrySet()) {
                total += e.getValue();
                if (shown++ < 4) sb.append(shown > 1 ? ", " : "").append(e.getValue()).append(' ').append(e.getKey());
            }
            if (batch.size() > 4) sb.append(", and more");
            batch.clear();
        }
        if (total == 0) return;
        lastSummary = System.currentTimeMillis();
        String why = blocked(ctx, p);
        if (why != null) {
            MsgLog.add(ctx, "Summary of " + total + " not read out: " + why);
            return;
        }
        String line = total + " new message" + (total == 1 ? "" : "s") + ": " + sb + ".";
        MsgLog.add(ctx, "Summary read out: " + line);
        say(ctx, line, p.getFloat("rate", 1f));
    }

    /** "Send a test announcement": says a line now (unless reading aloud is blocked), and why. */
    public static String test(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String why = blocked(ctx, p);
        if (why != null && !why.startsWith("reading aloud is off")) return "Not said: " + why;
        say(ctx, "This is Alton. New messages will be read like this.", p.getFloat("rate", 1f));
        return why == null ? "Said it (if you heard nothing, check the phone's text-to-speech)." : "Said it as a test, but " + why + ".";
    }

    private static synchronized void say(Context ctx, final String text, final float rate) {
        if (tts != null && ready) {
            tts.setSpeechRate(rate);
            tts.speak(text, TextToSpeech.QUEUE_ADD, null, "alton-" + System.currentTimeMillis());
            return;
        }
        waiting.add(text);
        if (tts != null) return;
        final Context app = ctx.getApplicationContext();
        tts = new TextToSpeech(app, status -> {
            synchronized (Announcer.class) {
                if (status != TextToSpeech.SUCCESS) {
                    MsgLog.add(app, "Text-to-speech didn't start (status " + status + ")");
                    tts = null;
                    waiting.clear();
                    return;
                }
                tts.setLanguage(Locale.UK);
                tts.setSpeechRate(rate);
                ready = true;
                for (String w : waiting) tts.speak(w, TextToSpeech.QUEUE_ADD, null, "alton-" + System.nanoTime());
                waiting.clear();
            }
        });
    }
}
