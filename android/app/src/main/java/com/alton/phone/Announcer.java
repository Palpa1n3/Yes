package com.alton.phone;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reads new messages out loud, even with Alton closed (it runs from the message listener).
 * Settings come from the app: off / only with headphones or car Bluetooth / always, plus quiet
 * hours. Uses the phone's own text-to-speech voice.
 */
public class Announcer {

    static final String PREFS = "alton";
    private static TextToSpeech tts;
    private static boolean ready = false;
    private static final List<String> waiting = new ArrayList<>();
    private static final Map<String, String> lastSaid = new HashMap<>();

    public static void save(Context ctx, String mode, int quietFrom, int quietTo, float rate) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("announce", mode)
            .putInt("quietFrom", quietFrom)
            .putInt("quietTo", quietTo)
            .putFloat("rate", rate)
            .apply();
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

    /** Says a new message, if the user's settings allow it right now. */
    public static void message(Context ctx, String key, String app, String from, String text) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String mode = p.getString("announce", "off");
        if ("off".equals(mode)) return;
        if (quiet(p.getInt("quietFrom", 23), p.getInt("quietTo", 7))) return;
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        boolean phones = headphones(am);
        if ("headphones".equals(mode) && !phones) return;
        // "Always": still not out loud through the speaker when the phone is on silent/vibrate.
        if (!phones && am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return;
        String t = text.length() > 300 ? text.substring(0, 300) + "…" : text;
        if (t.equals(lastSaid.get(key))) return; // the same notification updated again
        lastSaid.put(key, t);
        say(ctx, "Message from " + from + (app.isEmpty() ? "" : " on " + app) + ". " + t, p.getFloat("rate", 1f));
    }

    private static synchronized void say(Context ctx, final String text, final float rate) {
        if (tts != null && ready) {
            tts.setSpeechRate(rate);
            tts.speak(text, TextToSpeech.QUEUE_ADD, null, "alton-" + System.currentTimeMillis());
            return;
        }
        waiting.add(text);
        if (tts != null) return;
        tts = new TextToSpeech(ctx.getApplicationContext(), status -> {
            synchronized (Announcer.class) {
                if (status != TextToSpeech.SUCCESS) {
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
