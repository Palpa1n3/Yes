package com.alton.phone;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.annotation.SuppressLint;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "When I get to work": a proximity alert around the user's workplace. Arriving shows a
 * notification with what's left on their chosen lists and any "remind me at work" notes.
 * Uses Google Play services geofencing (works in the background and saves battery), falling
 * back to the platform LocationManager's proximity alert when Play services aren't there.
 * Needs location "Allow all the time".
 */
final class PlaceAlerts {

    static final String PREFS = "alton_place";
    static final String ACTION = "com.alton.phone.PLACE";
    private static final String CHANNEL = "alton_places";

    private PlaceAlerts() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean background(Context ctx) {
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            return false;
        return Build.VERSION.SDK_INT < 29
            || ctx.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, PlaceReceiver.class).setAction(ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 7301, i, flags);
    }

    /** (Re)registers the alert from the saved place. False when there is no place or no permission. */
    @SuppressLint("MissingPermission")
    static boolean register(Context ctx) {
        final LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        final PendingIntent pi = pending(ctx);
        try {
            if (lm != null) lm.removeProximityAlert(pi);
        } catch (SecurityException ignored) {}
        GeofencingClient gc = null;
        try {
            gc = LocationServices.getGeofencingClient(ctx);
            gc.removeGeofences(pi);
        } catch (Throwable ignored) {}
        SharedPreferences p = prefs(ctx);
        if (!p.contains("lat") || !background(ctx)) return false;
        final double lat = Double.longBitsToDouble(p.getLong("lat", 0));
        final double lon = Double.longBitsToDouble(p.getLong("lon", 0));
        final int radius = p.getInt("radius", 150);
        final Runnable fallback = () -> {
            try {
                if (lm != null) lm.addProximityAlert(lat, lon, radius, -1, pi);
            } catch (SecurityException ignored) {}
        };
        if (gc == null) {
            fallback.run();
            return lm != null;
        }
        try {
            Geofence g = new Geofence.Builder()
                .setRequestId("work")
                .setCircularRegion(lat, lon, radius)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER | Geofence.GEOFENCE_TRANSITION_EXIT)
                .setNotificationResponsiveness(60_000)
                .build();
            GeofencingRequest req = new GeofencingRequest.Builder().setInitialTrigger(0).addGeofence(g).build();
            gc.addGeofences(req, pi).addOnFailureListener(e -> fallback.run());
            return true;
        } catch (Throwable t) {
            fallback.run();
            return lm != null;
        }
    }

    static void clear(Context ctx) {
        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        try {
            if (lm != null) lm.removeProximityAlert(pending(ctx));
        } catch (SecurityException ignored) {}
        try {
            LocationServices.getGeofencingClient(ctx).removeGeofences(pending(ctx));
        } catch (Throwable ignored) {}
        prefs(ctx).edit().clear().apply();
    }

    /** Arrived or left. Arriving shows the list once (not again within 4 hours). */
    static void onChange(Context ctx, boolean entering) {
        SharedPreferences p = prefs(ctx);
        p.edit().putBoolean("here", entering).putLong("since", System.currentTimeMillis()).apply();
        if (!entering) return;
        if (System.currentTimeMillis() - p.getLong("shown", 0) < 4 * 3600_000L) return;
        StringBuilder body = new StringBuilder();
        try {
            JSONArray notes = new JSONArray(p.getString("notes", "[]"));
            for (int i = 0; i < notes.length(); i++) body.append("• ").append(notes.getString(i)).append('\n');
            JSONArray items = new JSONArray(p.getString("items", "[]"));
            if (items.length() > 0) {
                if (body.length() > 0) body.append('\n');
                body.append(p.getString("listLabel", "Shopping list")).append(":\n");
                for (int i = 0; i < items.length(); i++) body.append("• ").append(items.getString(i)).append('\n');
            }
        } catch (Exception ignored) {}
        if (body.length() == 0) return;
        // Notes are one-off: shown once, then gone. The lists come back next time.
        p.edit().putLong("shown", System.currentTimeMillis()).putString("notes", "[]").apply();
        notify(ctx, "🛒 At " + p.getString("name", "work"), body.toString().trim());
    }

    static void notify(Context ctx, String title, String text) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Places (work list)", NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, 7302, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(ctx.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(text.split("\n")[0])
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true);
        try {
            nm.notify(7303, b.build());
        } catch (SecurityException ignored) {}
    }

    static JSONObject status(Context ctx) throws Exception {
        SharedPreferences p = prefs(ctx);
        JSONObject r = new JSONObject();
        r.put("set", p.contains("lat"));
        r.put("name", p.getString("name", ""));
        r.put("here", p.getBoolean("here", false));
        r.put("since", p.getLong("since", 0));
        r.put("notes", new JSONArray(p.getString("notes", "[]")));
        r.put("background", background(ctx));
        return r;
    }
}
