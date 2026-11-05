package org.mapacampo.android;

import android.annotation.SuppressLint;
import android.content.Context;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.GnssStatus;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;

import org.json.JSONObject;

/**
 * Lecturas GNSS del teléfono (proveedor GPS de Android, sin servicios de
 * Google), estado de satélites y brújula corregida por declinación magnética.
 *
 * Referencias (developer.android.com): Location.getAccuracy() = radio
 * horizontal al 68 %; getAltitude() = altura sobre el elipsoide WGS 84;
 * getMslAltitudeMeters() (API 34) = altitud sobre el nivel medio del mar;
 * GnssStatus (API 24) = satélites visibles/usados por constelación.
 */
final class GnssEngine implements LocationListener, SensorEventListener {
    interface Listener {
        void onLocation(String json);

        void onGnss(String json);

        void onHeading(double deg, int accuracy, double declination);

        void onProvider(boolean enabled);
    }

    private static final long GPS_FRESH_MS = 10_000;
    private final Context ctx;
    private final Listener listener;
    private final LocationManager lm;
    private final SensorManager sm;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean running;
    private long lastGpsFix;
    private Location last;
    private long lastGnssReport;
    private GnssStatus.Callback gnssCallback;

    // brújula
    private boolean compassOn;
    private final float[] rot = new float[9];
    private final float[] rotRemap = new float[9];
    private final float[] orient = new float[3];
    private double sinF = 0, cosF = 1;
    private boolean haveHeading;
    private double lastSentHeading = -999;
    private long lastHeadingSent;
    private int headingAccuracy = -1;
    private GeomagneticField geo;
    private long geoTime;

    GnssEngine(Context ctx, Listener listener) {
        this.ctx = ctx;
        this.listener = listener;
        this.lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        this.sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
    }

    boolean isProviderEnabled() {
        try {
            return lm != null && lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressLint("MissingPermission")
    void start() {
        if (running || lm == null) return;
        try {
            if (lm.getAllProviders().contains(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0f, this, Looper.getMainLooper());
            }
            // Red/wifi solo para una primera posición aproximada mientras el GPS fija.
            if (lm.getAllProviders().contains(LocationManager.NETWORK_PROVIDER) && lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 0f, this, Looper.getMainLooper());
            }
            gnssCallback = new GnssStatus.Callback() {
                @Override
                public void onSatelliteStatusChanged(GnssStatus status) {
                    reportGnss(status);
                }
            };
            lm.registerGnssStatusCallback(gnssCallback, main);
            running = true;
            Location lk = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (lk != null && System.currentTimeMillis() - lk.getTime() < 60_000) onLocationChanged(lk);
        } catch (SecurityException e) {
            running = false;
        }
        listener.onProvider(isProviderEnabled());
    }

    void stop() {
        if (!running || lm == null) return;
        try {
            lm.removeUpdates(this);
            if (gnssCallback != null) lm.unregisterGnssStatusCallback(gnssCallback);
        } catch (Exception ignored) {
        }
        running = false;
    }

    // ------------------------------------------------------------ LocationListener
    @Override
    public void onLocationChanged(Location loc) {
        boolean isGps = LocationManager.GPS_PROVIDER.equals(loc.getProvider());
        long now = System.currentTimeMillis();
        if (isGps) lastGpsFix = now;
        else if (now - lastGpsFix < GPS_FRESH_MS) return; // hay GPS reciente: se ignora la red
        last = loc;
        if (geo == null || now - geoTime > 10 * 60_000) { // modelo geomagnético mundial (WMM) de Android
            geo = new GeomagneticField((float) loc.getLatitude(), (float) loc.getLongitude(), (float) loc.getAltitude(), now);
            geoTime = now;
        }
        listener.onLocation(toJson(loc));
    }

    static String toJson(Location loc) {
        JSONObject o = new JSONObject();
        try {
            o.put("lat", loc.getLatitude());
            o.put("lon", loc.getLongitude());
            o.put("acc", loc.hasAccuracy() ? loc.getAccuracy() : 9999);
            if (loc.hasAltitude()) o.put("alt", loc.getAltitude());
            if (Build.VERSION.SDK_INT >= 26 && loc.hasVerticalAccuracy()) o.put("altAcc", loc.getVerticalAccuracyMeters());
            if (Build.VERSION.SDK_INT >= 34 && loc.hasMslAltitude()) o.put("msl", loc.getMslAltitudeMeters());
            if (loc.hasSpeed()) o.put("speed", loc.getSpeed());
            if (loc.hasBearing()) o.put("course", loc.getBearing());
            if (Build.VERSION.SDK_INT >= 26 && loc.hasBearingAccuracy()) o.put("courseAcc", loc.getBearingAccuracyDegrees());
            o.put("time", loc.getTime());
            o.put("provider", LocationManager.GPS_PROVIDER.equals(loc.getProvider()) ? "GNSS" : "red (aproximada)");
            o.put("mock", isMock(loc));
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    @SuppressWarnings("deprecation")
    private static boolean isMock(Location loc) {
        return Build.VERSION.SDK_INT >= 31 ? loc.isMock() : loc.isFromMockProvider();
    }

    // Necesarios en Android 7–10, donde la interfaz no tiene métodos por defecto.
    @Override
    @SuppressWarnings("deprecation")
    public void onStatusChanged(String provider, int status, Bundle extras) {
    }

    @Override
    public void onProviderEnabled(String provider) {
        if (LocationManager.GPS_PROVIDER.equals(provider)) listener.onProvider(true);
    }

    @Override
    public void onProviderDisabled(String provider) {
        if (LocationManager.GPS_PROVIDER.equals(provider)) listener.onProvider(false);
    }

    private void reportGnss(GnssStatus s) {
        long now = System.currentTimeMillis();
        if (now - lastGnssReport < 1000) return;
        lastGnssReport = now;
        int used = 0, inView = s.getSatelliteCount();
        boolean dual = false;
        int[][] counts = new int[8][2];
        for (int i = 0; i < inView; i++) {
            int t = s.getConstellationType(i);
            int k = t >= 0 && t < 8 ? t : 0;
            counts[k][1]++;
            if (s.usedInFix(i)) {
                used++;
                counts[k][0]++;
            }
            // L5 (GPS/QZSS/NavIC) y E5a (Galileo) = 1176,45 MHz; B2a (BeiDou) también.
            if (Build.VERSION.SDK_INT >= 26 && s.hasCarrierFrequencyHz(i) && s.getCarrierFrequencyHz(i) < 1.3e9f) dual = true;
        }
        JSONObject o = new JSONObject();
        try {
            o.put("used", used);
            o.put("inView", inView);
            o.put("dualFreq", dual);
            JSONObject by = new JSONObject();
            String[] code = {"?", "G", "S", "R", "J", "C", "E", "I"}; // GnssStatus.CONSTELLATION_*
            for (int k = 1; k < 8; k++) {
                if (counts[k][1] > 0) by.put(code[k], new JSONObject().put("used", counts[k][0]).put("inView", counts[k][1]));
            }
            o.put("byConst", by);
        } catch (Exception ignored) {
        }
        listener.onGnss(o.toString());
    }

    // ------------------------------------------------------------ brújula
    void startCompass() {
        if (compassOn || sm == null) return;
        Sensor rv = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (rv == null) return;
        sm.registerListener(this, rv, SensorManager.SENSOR_DELAY_UI, main);
        Sensor mag = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        if (mag != null) sm.registerListener(this, mag, SensorManager.SENSOR_DELAY_NORMAL, main);
        compassOn = true;
    }

    void stopCompass() {
        if (!compassOn) return;
        sm.unregisterListener(this);
        compassOn = false;
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        if (e.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) return;
        SensorManager.getRotationMatrixFromVector(rot, e.values);
        int axX = SensorManager.AXIS_X, axY = SensorManager.AXIS_Y;
        switch (displayRotation()) {
            case Surface.ROTATION_90: axX = SensorManager.AXIS_Y; axY = SensorManager.AXIS_MINUS_X; break;
            case Surface.ROTATION_180: axX = SensorManager.AXIS_MINUS_X; axY = SensorManager.AXIS_MINUS_Y; break;
            case Surface.ROTATION_270: axX = SensorManager.AXIS_MINUS_Y; axY = SensorManager.AXIS_X; break;
            default: break;
        }
        SensorManager.remapCoordinateSystem(rot, axX, axY, rotRemap);
        SensorManager.getOrientation(rotRemap, orient);
        double az = Math.toDegrees(orient[0]);
        // Suavizado (filtro de paso bajo sobre el vector unitario, sin saltos en 0/360°)
        double a = Math.toRadians(az);
        if (!haveHeading) {
            sinF = Math.sin(a);
            cosF = Math.cos(a);
            haveHeading = true;
        } else {
            sinF = 0.85 * sinF + 0.15 * Math.sin(a);
            cosF = 0.85 * cosF + 0.15 * Math.cos(a);
        }
        double magnetic = (Math.toDegrees(Math.atan2(sinF, cosF)) + 360) % 360;
        double decl = geo != null ? geo.getDeclination() : Double.NaN;
        double trueH = (magnetic + (Double.isNaN(decl) ? 0 : decl) + 360) % 360;
        long now = System.currentTimeMillis();
        double diff = Math.abs(((trueH - lastSentHeading + 540) % 360) - 180);
        if (now - lastHeadingSent > 200 && diff > 1.0) {
            lastHeadingSent = now;
            lastSentHeading = trueH;
            listener.onHeading(trueH, headingAccuracy, decl);
        }
    }

    @SuppressWarnings("deprecation")
    private int displayRotation() {
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                Display d = ctx.getDisplay();
                return d != null ? d.getRotation() : Surface.ROTATION_0;
            }
            WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
            return wm.getDefaultDisplay().getRotation();
        } catch (Exception e) {
            return Surface.ROTATION_0;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        if (sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) headingAccuracy = accuracy;
    }
}
