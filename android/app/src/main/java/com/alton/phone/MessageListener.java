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
import android.os.Parcelable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONObject;

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
        /** The group chat's name ('' for one-to-one). */
        String chat = "";
        String text;
        long at;
        Notification.Action reply;
    }

    /** Messaging apps whose notifications count even without the "message" category. */
    private static final Set<String> MESSAGING = new HashSet<>(Arrays.asList(
        "com.whatsapp", "com.whatsapp.w4b", "com.samsung.android.messaging", "com.google.android.apps.messaging",
        "com.snapchat.android", "com.instagram.android", "com.facebook.orca", "com.facebook.mlite",
        "org.telegram.messenger", "org.thoughtcrime.securesms", "com.discord", "com.microsoft.teams"));

    /** Is the listener bound right now (Android can drop it, e.g. after an update)? */
    static boolean connected() {
        return instance != null;
    }

    /** Notification access is on but the listener isn't running: ask Android to bind it again. */
    static void rebind(Context ctx) {
        if (!isEnabled(ctx) || instance != null || Build.VERSION.SDK_INT < 24) return;
        try {
            requestRebind(new ComponentName(ctx, MessageListener.class));
            MsgLog.add(ctx, "Listener wasn't running: asked Android to reconnect it");
        } catch (Exception e) {
            MsgLog.add(ctx, "Couldn't reconnect the listener: " + e.getMessage());
        }
    }

    /** "💬 3 messages: Will, Mum, Saturday crew" for the end-of-shift note ('' = none). */
    static String summaryLine(long since) {
        List<Entry> list;
        synchronized (recent) {
            list = new ArrayList<>(recent.values());
        }
        LinkedHashMap<String, Integer> who = new LinkedHashMap<>();
        int n = 0;
        for (int i = list.size() - 1; i >= 0; i--) {
            Entry e = list.get(i);
            if (e.at < since) continue;
            n++;
            String k = e.chat.isEmpty() ? e.from : e.chat;
            who.put(k, who.containsKey(k) ? who.get(k) + 1 : 1);
        }
        if (n == 0) return "";
        StringBuilder sb = new StringBuilder("💬 " + n + " message" + (n == 1 ? "" : "s") + ": ");
        int shown = 0;
        for (String k : who.keySet()) {
            if (shown++ == 4) {
                sb.append(", …");
                break;
            }
            sb.append(shown > 1 ? ", " : "").append(k);
        }
        return sb.toString();
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
        MsgLog.add(this, "Listener connected");
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active != null) for (StatusBarNotification sbn : active) take(sbn);
        } catch (Exception ignored) {}
    }

    @Override
    public void onListenerDisconnected() {
        instance = null;
        MsgLog.add(this, "Listener disconnected by Android");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn != null) AutoRota.notePosted(this, sbn.getPackageName());
        if (sbn != null && SpendLog.watched(this, sbn.getPackageName()))
            SpendLog.note(this, sbn, appLabel(sbn.getPackageName()));
        Entry e = take(sbn);
        if (e == null && sbn != null && MESSAGING.contains(sbn.getPackageName())) {
            Notification n = sbn.getNotification();
            boolean summary = n != null && (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0;
            if (!summary) MsgLog.add(this, appLabel(sbn.getPackageName()) + ": a notification that isn't a message (no sender or text)");
        }
        if (e != null) {
            String said = Announcer.message(this, e.key, e.app, e.from, e.chat, e.text);
            String pc = "";
            try {
                pc = PcLink.send(this, new JSONObject()
                    .put("id", e.key)
                    .put("app", e.app)
                    .put("from", e.from)
                    .put("chat", e.chat)
                    .put("text", e.text)
                    .put("at", e.at)
                    .put("canReply", e.reply != null)
                    .put("fav", Announcer.isFavourite(this, e.from, e.chat)));
            } catch (Exception ignored) {}
            MsgLog.add(this, e.app + " · " + (e.chat.isEmpty() ? e.from : e.from + " in " + e.chat) + ": " + said + (pc.isEmpty() ? "" : " · " + pc));
            JSObject o = new JSObject();
            o.put("id", e.key);
            o.put("app", e.app);
            o.put("from", e.from);
            o.put("text", e.text);
            o.put("at", e.at);
            o.put("canReply", e.reply != null);
            o.put("chat", e.chat);
            AltonNativePlugin.newMessage(o);
        }
    }

    private Entry take(StatusBarNotification sbn) {
        if (sbn == null || getPackageName().equals(sbn.getPackageName())) return null;
        Notification n = sbn.getNotification();
        if (n == null) return null;
        Notification.Action reply = replyAction(n);
        boolean isMessage = Notification.CATEGORY_MESSAGE.equals(n.category) || reply != null
            || MESSAGING.contains(sbn.getPackageName());
        if (!isMessage) return null;
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return null;
        if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return null;
        Bundle ex = n.extras;
        if (ex == null) return null;
        CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (text == null) text = ex.getCharSequence(Notification.EXTRA_TEXT);
        // Chat apps (MessagingStyle): the newest message and who sent it, and the group's name.
        CharSequence sender = null;
        try {
            Parcelable[] msgs = ex.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (msgs != null && msgs.length > 0 && msgs[msgs.length - 1] instanceof Bundle) {
                Bundle last = (Bundle) msgs[msgs.length - 1];
                CharSequence t = last.getCharSequence("text");
                if (t != null) text = t;
                sender = last.getCharSequence("sender");
                if (sender == null && Build.VERSION.SDK_INT >= 28) {
                    android.app.Person p = last.getParcelable("sender_person");
                    if (p != null) sender = p.getName();
                }
            }
        } catch (Exception ignored) {}
        CharSequence conv = ex.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
        boolean group = Build.VERSION.SDK_INT >= 28 ? ex.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION) : conv != null;
        if (title == null || text == null) return null;
        Entry e = new Entry();
        e.key = sbn.getKey();
        e.pkg = sbn.getPackageName();
        e.app = appLabel(sbn.getPackageName());
        if (group) {
            e.chat = (conv != null ? conv : title).toString();
            e.from = sender != null ? sender.toString() : title.toString();
        } else e.from = sender != null ? sender.toString() : title.toString();
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
            o.put("chat", e.chat);
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
