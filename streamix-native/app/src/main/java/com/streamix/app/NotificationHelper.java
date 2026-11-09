package com.streamix.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.os.Build;
import android.provider.Settings;
import android.net.Uri;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/** Canal de notifications et affichage du rappel de visionnage. */
public final class NotificationHelper {

    /** Nouveau canal : Android fige le son d'un canal, il faut un identifiant neuf pour le changer. */
    public static final String CHANNEL_ID = "streamix_rappels_v3";
    /** Anciens canaux (son personnalisé) : supprimés pour repasser au son par défaut de l'appareil. */
    private static final String[] LEGACY_CHANNELS = {"streamix_rappels", "streamix_rappels_v2"};
    private static final int NOTIFICATION_ID = 2001;

    private NotificationHelper() {}

    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Rappels de visionnage",
                NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Rappel « C'est l'heure du visionnage »");
        // Son de notification par défaut de l'appareil de chaque utilisateur.
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs);
        channel.enableVibration(true);
        nm.createNotificationChannel(channel);
        for (String legacy : LEGACY_CHANNELS) {
            try {
                nm.deleteNotificationChannel(legacy);
            } catch (Exception ignored) { }
        }
    }

    /** Android 13+ exige l'accord explicite de l'utilisateur. */
    public static boolean canNotify(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    public static void showReminder(Context ctx) {
        if (!canNotify(ctx)) return;
        ensureChannel(ctx);

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                ctx, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("C'est l'heure du visionnage")
                .setContentText("Ton accès Streamix t'attend. Ouvre l'application et profite.")
                .setColor(0xFFE50914)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(contentIntent);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, builder.build());
    }
}
