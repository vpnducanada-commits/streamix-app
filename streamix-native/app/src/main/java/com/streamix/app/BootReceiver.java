package com.streamix.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Les alarmes sont perdues au redémarrage : on replanifie le rappel. */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            ReminderScheduler.schedule(context);
        }
    }
}
