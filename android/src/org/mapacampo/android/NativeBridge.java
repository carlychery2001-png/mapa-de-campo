package org.mapacampo.android;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.File;
import java.io.RandomAccessFile;

/**
 * Métodos que la página web puede llamar como MCNative.metodo(...).
 * Se ejecutan en el hilo del puente de JavaScript, no en el de la interfaz.
 */
final class NativeBridge {
    private static final int MAX_RANGE = 32 * 1024 * 1024;
    private final MainActivity act;

    NativeBridge(MainActivity act) {
        this.act = act;
    }

    /** Fondo nativo del tema, como «#rrggbb». */
    @JavascriptInterface
    public void setBackground(String hex) {
        try {
            act.setBackground(android.graphics.Color.parseColor(hex));
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public String getLocationPermission() {
        return act.locationPermissionState();
    }

    @JavascriptInterface
    public void openAppSettings() {
        act.openAppSettings();
    }

    /** Idioma («es», «en», «fr», «pt») y unidades («metric» o «imperial») de la interfaz web. */
    @JavascriptInterface
    public void setUiPrefs(String lang, String units) {
        L10n.save(act, lang, units);
    }

    @JavascriptInterface
    public void appReady() {
        act.runOnUiThread(act::onAppReady);
    }

    // ------------------------------------------------------------ archivos
    @JavascriptInterface
    public void importFiles() {
        act.launchImport();
    }

    @JavascriptInterface
    public String listFiles() {
        return act.store.listJson();
    }

    @JavascriptInterface
    public String writeFile(String name, String content) {
        return act.store.writeText(name, content);
    }

    /** ¿El APK trae este archivo en assets? */
    @JavascriptInterface
    public boolean hasAsset(String assetPath) {
        try (java.io.InputStream in = act.getAssets().open(assetPath)) {
            return true;
        } catch (java.io.IOException e) {
            return false;
        }
    }

    /** Copia un archivo incluido en el APK a la carpeta de la app (en segundo plano). */
    @JavascriptInterface
    public void installAsset(String assetPath, String destName) {
        act.store.installAssetAsync(assetPath, destName, act);
    }

    @JavascriptInterface
    public boolean replaceFile(String name, String content) {
        return act.store.replaceText(name, content);
    }

    @JavascriptInterface
    public boolean deleteFile(String name) {
        return act.store.delete(name);
    }

    @JavascriptInterface
    public long fileSize(String name) {
        File f = act.store.file(name);
        return f != null && f.isFile() ? f.length() : 0;
    }

    /** Respaldo de lectura por rangos: devuelve los bytes en base64. */
    @JavascriptInterface
    public String readRange(String name, double start, double length) {
        File f = act.store.file(name);
        if (f == null || !f.isFile()) return "";
        long s = (long) start;
        int len = (int) Math.min(Math.min((long) length, MAX_RANGE), Math.max(0, f.length() - s));
        if (len <= 0) return "";
        byte[] buf = new byte[len];
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            raf.seek(s);
            raf.readFully(buf);
        } catch (Exception e) {
            return "";
        }
        return Base64.encodeToString(buf, Base64.NO_WRAP);
    }

    @JavascriptInterface
    public void saveText(String name, String mime, String content) {
        act.launchSave(name, mime, content);
    }

    // ------------------------------------------------------------ ubicación
    @JavascriptInterface
    public void startLocation() {
        act.requestLocation();
    }

    @JavascriptInterface
    public void stopLocation() {
        act.stopLocation();
    }

    // ------------------------------------------------------------ track
    @JavascriptInterface
    public void startTrack(double minDist, double maxAcc) {
        if (!act.hasLocationPermission()) {
            act.requestLocation();
            return;
        }
        act.withNotificationPermission(() -> {
            Intent i = new Intent(act, TrackService.class).setAction(TrackService.ACTION_START);
            i.putExtra("minDist", minDist);
            i.putExtra("maxAcc", maxAcc);
            if (Build.VERSION.SDK_INT >= 26) act.startForegroundService(i);
            else act.startService(i);
        });
    }

    @JavascriptInterface
    public void stopTrack() {
        Intent i = new Intent(act, TrackService.class).setAction(TrackService.ACTION_STOP);
        act.startService(i);
    }

    @JavascriptInterface
    public void clearTrack() {
        TrackService.clear(act);
    }

    @JavascriptInterface
    public String getTrack(int from) {
        return TrackService.readPoints(act, from);
    }

    @JavascriptInterface
    public String trackStatus() {
        try {
            return new JSONObject().put("recording", TrackService.isRecording(act)).toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    // ------------------------------------------------------------ varios
    @JavascriptInterface
    public void setKeepScreenOn(boolean on) {
        act.setKeepScreenOn(on);
    }

    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public void vibrate(int ms) {
        Vibrator v = (Vibrator) act.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(Math.max(10, ms), VibrationEffect.DEFAULT_AMPLITUDE));
        else v.vibrate(Math.max(10, ms));
    }

    @JavascriptInterface
    public void copyText(String text) {
        act.runOnUiThread(() -> {
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("coordenadas", text));
        });
    }

    @JavascriptInterface
    public void openUrl(String url) {
        act.openExternal(url);
    }

    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public String getAppInfo() {
        JSONObject o = new JSONObject();
        try {
            PackageInfo pi = act.getPackageManager().getPackageInfo(act.getPackageName(), 0);
            o.put("versionName", pi.versionName);
            o.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
            o.put("android", Build.VERSION.RELEASE);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("device", Build.MANUFACTURER + " " + Build.MODEL);
            o.put("fontScale", act.getResources().getConfiguration().fontScale); // tamaño de letra del sistema
            if (Build.VERSION.SDK_INT >= 26) {
                PackageInfo wv = WebView.getCurrentWebViewPackage();
                if (wv != null) o.put("webview", wv.versionName);
            }
        } catch (Exception ignored) {
        }
        return o.toString();
    }
}
