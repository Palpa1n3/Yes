package com.alton.phone;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Sees message notifications (texts, WhatsApp, Messenger...) so Alton can read them out, and
 * replies through the notification's own Reply button. Only works once the user turns on
 * Notification access for Alton. Nothing is stored on disk or sent anywhere by this class.
 */
public class MessageListener extends NotificationListenerService {

    private static final int MAX = 40;
    private static final Map<String, Entry> recent = new LinkedHashMap<>();
    private static MessageListener instance;

    static class Entry {
        String key;
        String pkg;
        String app;
        String from;
        String text;
        long at;
        Notification.Action reply;
    }

    public static boolean isEnabled(Context ctx) {
        String flat = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        if (flat == null) return false;
        ComponentName me = new ComponentName(ctx, MessageListener.class);
        return flat.contains(me.flattenToString()) || flat.contains(ctx.getPackageName() + "/");
    }

    @Override
    public void onListenerConnected() {
        instance = this;
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active != null) for (StatusBarNotification sbn : active) take(sbn);
        } catch (Exception ignored) {}
    }

    @Override
    public void onListenerDisconnected() {
        instance = null;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        Entry e = take(sbn);
        if (e != null) {
            JSObject o = new JSObject();
            o.put("id", e.key);
            o.put("app", e.app);
            o.put("from", e.from);
            o.put("text", e.text);
            o.put("at", e.at);
            o.put("canReply", e.reply != null);
            AltonNativePlugin.newMessage(o);
        }
    }

    private Entry take(StatusBarNotification sbn) {
        if (sbn == null || getPackageName().equals(sbn.getPackageName())) return null;
        Notification n = sbn.getNotification();
        if (n == null) return null;
        Notification.Action reply = replyAction(n);
        boolean isMessage = Notification.CATEGORY_MESSAGE.equals(n.category) || reply != null;
        if (!isMessage) return null;
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return null;
        Bundle ex = n.extras;
        if (ex == null) return null;
        CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (text == null) text = ex.getCharSequence(Notification.EXTRA_TEXT);
        if (title == null || text == null) return null;
        Entry e = new Entry();
        e.key = sbn.getKey();
        e.pkg = sbn.getPackageName();
        e.app = appLabel(sbn.getPackageName());
        e.from = title.toString();
        e.text = text.toString();
        e.at = sbn.getPostTime();
        e.reply = reply;
        synchronized (recent) {
            recent.remove(e.key);
            recent.put(e.key, e);
            while (recent.size() > MAX) {
                String first = recent.keySet().iterator().next();
                recent.remove(first);
            }
        }
        return e;
    }

    private static Notification.Action replyAction(Notification n) {
        if (n.actions == null) return null;
        for (Notification.Action a : n.actions) {
            RemoteInput[] inputs = a.getRemoteInputs();
            if (inputs != null && inputs.length > 0) return a;
        }
        return null;
    }

    private String appLabel(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    /** Newest first. */
    public static JSArray recentMessages() {
        List<Entry> list;
        synchronized (recent) {
            list = new ArrayList<>(recent.values());
        }
        JSArray out = new JSArray();
        for (int i = list.size() - 1; i >= 0; i--) {
            Entry e = list.get(i);
            JSObject o = new JSObject();
            o.put("id", e.key);
            o.put("app", e.app);
            o.put("from", e.from);
            o.put("text", e.text);
            o.put("at", e.at);
            o.put("canReply", e.reply != null);
            out.put(o);
        }
        return out;
    }

    /** Sends a reply through the message's own notification. Returns an error, or null. */
    public static String reply(Context ctx, String key, String text) {
        Entry e;
        synchronized (recent) {
            e = recent.get(key);
        }
        if (e == null) return "That message has gone (it was cleared or answered).";
        if (e.reply == null) return "That app doesn't allow replies from notifications.";
        RemoteInput[] inputs = e.reply.getRemoteInputs();
        if (inputs == null || inputs.length == 0) return "No reply box on that message.";
        Intent fill = new Intent();
        Bundle results = new Bundle();
        for (RemoteInput ri : inputs) results.putCharSequence(ri.getResultKey(), text);
        RemoteInput.addResultsToIntent(inputs, fill, results);
        try {
            e.reply.actionIntent.send(ctx, 0, fill);
        } catch (PendingIntent.CanceledException ex) {
            return "That message can't be replied to any more.";
        }
        synchronized (recent) {
            recent.remove(key);
        }
        return null;
    }
}
