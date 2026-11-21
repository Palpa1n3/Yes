package com.alton.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Proximity alerts are cleared when the phone restarts: set the workplace one up again. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) PlaceAlerts.register(ctx);
    }
}
