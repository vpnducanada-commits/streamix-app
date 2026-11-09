package com.streamix.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import java.util.Calendar;

/**
 * Rappel de visionnage envoyé toutes les 5 heures.
 * Créneaux fixes, heure locale : 00h, 05h, 10h, 15h, 20h.
 * Aucune permission spéciale n'est nécessaire (alarme inexacte tolérée par le système).
 */
public final class ReminderScheduler {

    /** Intervalle entre deux notifications, en heures. */
    public static final int INTERVAL_HOURS = 5;

    private static final int REQUEST_CODE = 41;

    private ReminderScheduler() {}

    /** Prochain créneau : la prochaine heure pleine multiple de {@link #INTERVAL_HOURS}. */
    public static long nextTriggerMillis() {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        cal.add(Calendar.HOUR_OF_DAY, 1);
        while (cal.get(Calendar.HOUR_OF_DAY) % INTERVAL_HOURS != 0) {
            cal.add(Calendar.HOUR_OF_DAY, 1);
        }
        return cal.getTimeInMillis();
    }

    public static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTriggerMillis(), pendingIntent(c));
    }

    public static void cancel(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(pendingIntent(c));
    }

    private static PendingIntent pendingIntent(Context c) {
        Intent intent = new Intent(c, ReminderReceiver.class);
        intent.setAction(ReminderReceiver.ACTION_REMIND);
        return PendingIntent.getBroadcast(c, REQUEST_CODE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
