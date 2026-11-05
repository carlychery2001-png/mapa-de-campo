package org.mapacampo.android;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Locale;

/**
 * Servicio en primer plano (tipo "location") que graba el track aunque la
 * pantalla se apague. Cada punto se añade a track.jsonl en el almacenamiento
 * privado, así no se pierde si Android cierra la app.
 */
public class TrackService extends Service implements LocationListener {
    static final String ACTION_START = "org.mapacampo.android.TRACK_START";
    static final String ACTION_STOP = "org.mapacampo.android.TRACK_STOP";
    private static final String CHANNEL = "track";
    private static final int NOTIF_ID = 42;
    private static final String PREFS = "track";

    /** Avisa a la actividad (si está abierta) de que hay puntos nuevos. */
    static volatile Runnable listener;

    private LocationManager lm;
    private double minDist = 2, maxAcc = 25;
    private Location lastKept;
    private int count;
    private double length;
    private long lastNotif;

    static File trackFile(Context c) {
        return new File(c.getFilesDir(), "track.jsonl");
    }

    static boolean isRecording(Context c) {
        return c.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("recording", false);
    }

    private static void setRecording(Context c, boolean on) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("recording", on).apply();
    }

    static synchronized void clear(Context c) {
        //noinspection ResultOfMethodCallIgnored
        trackFile(c).delete();
    }

    /** Puntos a partir del índice {@code from}, como arreglo JSON. */
    static synchronized String readPoints(Context c, int from) {
        JSONArray a = new JSONArray();
        File f = trackFile(c);
        if (!f.isFile()) return "[]";
        try (BufferedReader br = new BufferedReader(new FileReader(f))) {
            String line;
            int i = 0;
            while ((line = br.readLine()) != null) {
                if (i++ < from || line.isEmpty()) continue;
                try {
                    a.put(new JSONObject(line));
                } catch (Exception ignored) {
                }
            }
        } catch (IOException ignored) {
        }
        return a.toString();
    }

    private static synchronized void append(Context c, String line) {
        try (FileWriter w = new FileWriter(trackFile(c), true)) {
            w.write(line);
            w.write('\n');
        } catch (IOException ignored) {
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    @SuppressLint("MissingPermission")
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopRecording();
            return START_NOT_STICKY;
        }
        if (intent == null && !isRecording(this)) { // reinicio del sistema sin grabación activa
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            minDist = intent.getDoubleExtra("minDist", minDist);
            maxAcc = intent.getDoubleExtra("maxAcc", maxAcc);
        }
        startInForeground();
        setRecording(this, true);
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            lm.removeUpdates(this);
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0f, this, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException e) {
            stopRecording();
        }
        return START_STICKY;
    }

    private void startInForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, L10n.s(this, R.string.track_channel), NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTIF_ID, n);
    }

    @SuppressWarnings("deprecation")
    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        String txt = count == 0 ? L10n.s(this, R.string.track_waiting) : L10n.plural(this, R.plurals.track_points, count, count, L10n.distance(this, length));
        b.setSmallIcon(R.drawable.ic_stat_track)
                .setContentTitle(L10n.s(this, R.string.track_recording))
                .setContentText(txt)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pi);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private void stopRecording() {
        setRecording(this, false);
        if (lm != null) {
            try {
                lm.removeUpdates(this);
            } catch (Exception ignored) {
            }
        }
        if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onLocationChanged(Location loc) {
        if (!loc.hasAccuracy() || loc.getAccuracy() > maxAcc) return;
        if (lastKept != null && lastKept.distanceTo(loc) < Math.max(0.5, minDist)) return;
        if (lastKept != null) length += lastKept.distanceTo(loc);
        lastKept = loc;
        count++;
        JSONObject o = new JSONObject();
        try {
            o.put("lat", loc.getLatitude());
            o.put("lon", loc.getLongitude());
            if (loc.hasAltitude()) o.put("alt", loc.getAltitude());
            if (Build.VERSION.SDK_INT >= 34 && loc.hasMslAltitude()) o.put("msl", loc.getMslAltitudeMeters());
            o.put("acc", loc.getAccuracy());
            o.put("time", loc.getTime());
        } catch (Exception ignored) {
        }
        append(this, o.toString());
        Runnable l = listener;
        if (l != null) l.run();
        long now = System.currentTimeMillis();
        if (now - lastNotif > 5000) {
            lastNotif = now;
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.notify(NOTIF_ID, buildNotification());
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onStatusChanged(String provider, int status, Bundle extras) {
    }

    @Override
    public void onProviderEnabled(String provider) {
    }

    @Override
    public void onProviderDisabled(String provider) {
    }

    @Override
    public void onDestroy() {
        if (lm != null) {
            try {
                lm.removeUpdates(this);
            } catch (Exception ignored) {
            }
        }
        super.onDestroy();
    }
}
