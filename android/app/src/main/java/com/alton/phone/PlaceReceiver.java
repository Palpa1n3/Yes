package com.alton.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

/** The workplace alert fired (arriving or leaving): from Play services geofencing, or the
 *  LocationManager proximity alert used as a fallback. */
public class PlaceReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!PlaceAlerts.ACTION.equals(intent.getAction())) return;
        if (intent.hasExtra(LocationManager.KEY_PROXIMITY_ENTERING)) {
            PlaceAlerts.onChange(ctx, intent.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, false));
            return;
        }
        try {
            GeofencingEvent ev = GeofencingEvent.fromIntent(intent);
            if (ev == null || ev.hasError()) return;
            int t = ev.getGeofenceTransition();
            if (t == Geofence.GEOFENCE_TRANSITION_ENTER) PlaceAlerts.onChange(ctx, true);
            else if (t == Geofence.GEOFENCE_TRANSITION_EXIT) PlaceAlerts.onChange(ctx, false);
        } catch (Throwable ignored) {}
    }
}
