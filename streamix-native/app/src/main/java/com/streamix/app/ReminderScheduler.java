package com.streamix.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import java.util.Calendar;

/**
 * Rappel de visionnage : deux créneaux par jour, à 20 h et à 2 h (heure locale),
 * les moments de soirée et de nuit où l'on regarde un film.
 * Aucune permission spéciale n'est nécessaire (alarme inexacte tolérée par le système).
 */
public final class ReminderScheduler {

    /** Heures d'envoi, format 24 h. Modifier ce tableau pour changer les créneaux. */
    private static final int[] SLOT_HOURS = {20, 2};

    private static final int REQUEST_CODE = 41;

    private ReminderScheduler() {}

    /** Prochain créneau : le plus proche parmi aujourd'hui et demain. */
    public static long nextTriggerMillis() {
        long now = System.currentTimeMillis();
        long best = Long.MAX_VALUE;
        Calendar cal = Calendar.getInstance();
        for (int dayOffset = 0; dayOffset <= 1; dayOffset++) {
            for (int hour : SLOT_HOURS) {
                cal.setTimeInMillis(now);
                cal.add(Calendar.DAY_OF_YEAR, dayOffset);
                cal.set(Calendar.HOUR_OF_DAY, hour);
                cal.set(Calendar.MINUTE, 0);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                long at = cal.getTimeInMillis();
                if (at > now && at < best) best = at;
            }
        }
        return best;
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
