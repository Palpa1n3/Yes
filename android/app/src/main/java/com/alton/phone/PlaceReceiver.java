package com.alton.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;

/** The workplace proximity alert fired (arriving or leaving). */
public class PlaceReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!PlaceAlerts.ACTION.equals(intent.getAction())) return;
        if (!intent.hasExtra(LocationManager.KEY_PROXIMITY_ENTERING)) return;
        PlaceAlerts.onChange(ctx, intent.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, false));
    }
}
