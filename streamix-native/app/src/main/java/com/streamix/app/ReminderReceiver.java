package com.streamix.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Affiche le rappel puis programme celui du lendemain. */
public class ReminderReceiver extends BroadcastReceiver {

    public static final String ACTION_REMIND = "com.streamix.app.REMIND";

    @Override
    public void onReceive(Context context, Intent intent) {
        NotificationHelper.showReminder(context);
        ReminderScheduler.schedule(context);
    }
}
