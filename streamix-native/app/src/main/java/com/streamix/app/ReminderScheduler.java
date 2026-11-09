package com.streamix.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import java.util.Calendar;

/** Programme le rappel quotidien. Aucune permission spéciale n'est nécessaire. */
public final class ReminderScheduler {

    /** Heure du rappel : modifiable ici (format 24 h). */
    public static final int DEFAULT_HOUR = 20;
    public static final int DEFAULT_MINUTE = 0;

    private static final int REQUEST_CODE = 41;
    private static final String PREFS = "streamix";

    private ReminderScheduler() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static int hour(Context c) {
        return prefs(c).getInt("reminder_hour", DEFAULT_HOUR);
    }

    public static int minute(Context c) {
        return prefs(c).getInt("reminder_minute", DEFAULT_MINUTE);
    }

    public static void setTime(Context c, int h, int m) {
        prefs(c).edit().putInt("reminder_hour", h).putInt("reminder_minute", m).apply();
    }

    public static long nextTriggerMillis(Context c) {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, hour(c));
        cal.set(Calendar.MINUTE, minute(c));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        long at = cal.getTimeInMillis();
        if (at <= System.currentTimeMillis()) at += AlarmManager.INTERVAL_DAY;
        return at;
    }

    public static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTriggerMillis(c), pendingIntent(c));
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
