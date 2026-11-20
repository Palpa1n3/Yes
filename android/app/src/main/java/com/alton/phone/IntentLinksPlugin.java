package com.alton.phone;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URISyntaxException;

/**
 * Opens Android "intent:" links (the shift alarm, timer and calendar buttons), which the
 * built-in link handling can't. Only a few safe actions are allowed, and never a named app.
 */
@CapacitorPlugin(name = "IntentLinks")
public class IntentLinksPlugin extends Plugin {

    private static final String[] ALLOWED = {
        "android.intent.action.SET_ALARM",
        "android.intent.action.SET_TIMER",
        "android.intent.action.INSERT",
        "android.intent.action.VIEW",
    };

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (url == null || !"intent".equals(url.getScheme())) return null;
        try {
            Intent intent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
            boolean ok = false;
            for (String a : ALLOWED) if (a.equals(intent.getAction())) ok = true;
            if (!ok) return true;
            intent.setComponent(null);
            intent.setSelector(null);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (URISyntaxException | ActivityNotFoundException | SecurityException e) {
            // Nothing on the phone can do it: ignore the tap.
        }
        return true;
    }
}
