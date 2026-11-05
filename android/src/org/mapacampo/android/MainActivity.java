package org.mapacampo.android;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Actividad única: aloja el motor de mapas web (OpenLayers) en un WebView
 * y le da acceso al GPS, a los archivos y a la grabación de tracks.
 */
public class MainActivity extends Activity {
    static final String TAG = "MapaCampo";
    static final String START_URL = "https://" + LocalServer.HOST + "/app/index.html";
    private static final int REQ_IMPORT = 1;
    private static final int REQ_SAVE = 2;
    private static final int REQ_LOCATION = 10;
    private static final int REQ_NOTIFICATIONS = 11;

    WebView web;
    FileStore store;
    GnssEngine gnss;
    private LocalServer server;
    private boolean appReady = false;
    private boolean wantLocation = false;
    private final List<Uri> pendingUris = new ArrayList<>();
    private String pendingSaveText;
    private String pendingSaveName;
    private Runnable afterNotificationPermission;
    private Object backCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new FileStore(this);
        server = new LocalServer(this, store);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0x00, 0x31, 0x3B));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyInsets(root);

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false); // la posición llega del GPS nativo
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100); // el tamaño de letra del sistema lo aplica la página (getAppInfo().fontScale)
        // La política de teselas de OpenStreetMap pide que cada app se identifique
        try {
            String ver = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            s.setUserAgentString(s.getUserAgentString() + " MapaDeCampo/" + ver);
        } catch (Exception ignored) {
        }
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Fondo del tema guardado (claro u oscuro) para que no destelle blanco al abrir de noche
        web.setBackgroundColor(getSharedPreferences("mc_ui", MODE_PRIVATE).getInt("bg", Color.rgb(0xE9, 0xEC, 0xEF)));

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return server.handle(request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (LocalServer.HOST.equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // El motor del WebView se cerró (p. ej. por falta de memoria con un ráster enorme):
                // se recrea la actividad en vez de cerrar la app.
                Log.e(TAG, "WebView render process gone, crash=" + detail.didCrash());
                Toast.makeText(MainActivity.this, L10n.s(MainActivity.this, R.string.toast_render_gone), Toast.LENGTH_LONG).show();
                recreate();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                // Solo en la versión de depuración, y sin la clave de Google ni el token de sesión
                // (las URL de las teselas llevan ?session=…&key=…).
                if (debuggable) {
                    String s = ("JS " + m.messageLevel() + ": " + m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")")
                            .replaceAll("([?&](key|session)=)[^&\\s)]+", "$1***")
                            .replaceAll("AIza[0-9A-Za-z_\\-]{20,}", "AIza***");
                    Log.d(TAG, s);
                }
                return true;
            }
        });
        web.addJavascriptInterface(new NativeBridge(this), "MCNative");

        gnss = new GnssEngine(this, new GnssEngine.Listener() {
            @Override
            public void onLocation(String json) {
                js("MC.onLocation(" + json + ")");
            }

            @Override
            public void onGnss(String json) {
                js("MC.onGnss(" + json + ")");
            }

            @Override
            public void onHeading(double deg, int accuracy, double declination) {
                js("MC.onHeading(" + fmt(deg) + "," + accuracy + "," + fmt(declination) + ")");
            }

            @Override
            public void onProvider(boolean enabled) {
                js("MC.onLocationProvider(" + enabled + ")");
            }
        });

        TrackService.listener = () -> js("MC.onTrackPoint()");
        registerBack();
        collectUris(getIntent());
        web.loadUrl(START_URL);
    }

    private static String fmt(double v) {
        return Double.isNaN(v) || Double.isInfinite(v) ? "null" : String.valueOf(v);
    }

    /** Desde Android 15 la ventana ocupa toda la pantalla: se deja margen para las barras del sistema. */
    private void applyInsets(View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) c.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
    }

    private void registerBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            OnBackInvokedCallback cb = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
            backCallback = cb;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        web.evaluateJavascript("(function(){try{return MC.onBack()===true}catch(e){return false}})()", value -> {
            if (!"true".equals(value)) moveTaskToBack(true);
        });
    }

    /** Ejecuta código JS en el WebView (desde cualquier hilo). */
    void js(final String code) {
        runOnUiThread(() -> {
            // Antes de que cargue la página no existe MC: se descarta el aviso en vez de dar error.
            if (web != null) web.evaluateJavascript("if(typeof MC!=='undefined'){" + code + "}", null);
        });
    }

    // ------------------------------------------------------------------ ciclo de vida
    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (wantLocation) {
            if (hasLocationPermission()) gnss.start();
            reportPermission(); // p. ej. al volver de los ajustes de Android con el permiso ya dado
        }
        gnss.startCompass();
    }

    @Override
    protected void onPause() {
        // Ahorro de batería: sin pantalla no se necesita el GPS de la actividad
        // (el track, si se graba, lo sigue el servicio en primer plano).
        gnss.stop();
        gnss.stopCompass();
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        TrackService.listener = null;
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        collectUris(intent);
        if (appReady) flushPendingImports();
    }

    // ------------------------------------------------------------------ JS listo
    void onAppReady() {
        appReady = true;
        reportPermission();
        flushPendingImports();
    }

    private void collectUris(Intent intent) {
        if (intent == null) return;
        String a = intent.getAction();
        if (Intent.ACTION_VIEW.equals(a) && intent.getData() != null) {
            pendingUris.add(intent.getData());
        } else if (Intent.ACTION_SEND.equals(a)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) pendingUris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(a)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) pendingUris.addAll(list);
        }
        intent.setAction(Intent.ACTION_MAIN);
    }

    private void flushPendingImports() {
        if (pendingUris.isEmpty()) return;
        List<Uri> copy = new ArrayList<>(pendingUris);
        pendingUris.clear();
        store.importAsync(copy, this);
    }

    // ------------------------------------------------------------------ importar / guardar
    void launchImport() {
        runOnUiThread(() -> {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(i, REQ_IMPORT);
            } catch (Exception e) {
                Toast.makeText(this, L10n.s(this, R.string.toast_no_picker), Toast.LENGTH_LONG).show();
            }
        });
    }

    void launchSave(String name, String mime, String text) {
        runOnUiThread(() -> {
            pendingSaveName = name;
            pendingSaveText = text;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_TITLE, name);
            try {
                startActivityForResult(i, REQ_SAVE);
            } catch (Exception e) {
                js("MC.onSaveDone(false," + JSONObject.quote("no hay selector de archivos") + ")");
            }
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_IMPORT) {
            if (resultCode != RESULT_OK || data == null) return;
            List<Uri> uris = new ArrayList<>();
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int k = 0; k < clip.getItemCount(); k++) uris.add(clip.getItemAt(k).getUri());
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
            store.importAsync(uris, this);
        } else if (requestCode == REQ_SAVE) {
            final String text = pendingSaveText, name = pendingSaveName;
            pendingSaveText = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || text == null) {
                js("MC.onSaveDone(false," + JSONObject.quote(L10n.s(this, R.string.err_cancelled)) + ")");
                return;
            }
            final Uri uri = data.getData();
            new Thread(() -> {
                try (OutputStream os = getContentResolver().openOutputStream(uri, "wt")) {
                    if (os == null) throw new java.io.IOException(L10n.s(this, R.string.err_write));
                    os.write(text.getBytes(StandardCharsets.UTF_8));
                    js("MC.onSaveDone(true," + JSONObject.quote(name) + ")");
                } catch (Exception e) {
                    js("MC.onSaveDone(false," + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                }
            }).start();
        }
    }

    // ------------------------------------------------------------------ permisos
    boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    void requestLocation() {
        runOnUiThread(() -> {
            wantLocation = true;
            if (hasLocationPermission()) {
                gnss.start();
                reportPermission();
            } else {
                getSharedPreferences("mc_ui", MODE_PRIVATE).edit().putBoolean("askedLocation", true).apply();
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            }
        });
    }

    /**
     * Estado del permiso de ubicación sin pedirlo: granted, approximate, unknown (nunca se pidió),
     * denied (se negó pero se puede volver a pedir) o blocked (Android ya no muestra la pregunta).
     */
    String locationPermissionState() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) return "granted";
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) return "approximate";
        boolean asked = getSharedPreferences("mc_ui", MODE_PRIVATE).getBoolean("askedLocation", false);
        if (!asked) return "unknown";
        return shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION) ? "denied" : "blocked";
    }

    /** Abre la ficha de la app en los ajustes de Android (para volver a dar un permiso). */
    void openAppSettings() {
        runOnUiThread(() -> {
            try {
                startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null)));
            } catch (Exception e) {
                Toast.makeText(this, L10n.s(this, R.string.toast_link), Toast.LENGTH_SHORT).show();
            }
        });
    }

    /** Color de fondo del WebView según el tema de la página (se recuerda para el próximo arranque). */
    void setBackground(int color) {
        getSharedPreferences("mc_ui", MODE_PRIVATE).edit().putInt("bg", color).apply();
        runOnUiThread(() -> web.setBackgroundColor(color));
    }

    void stopLocation() {
        runOnUiThread(() -> {
            wantLocation = false;
            gnss.stop();
        });
    }

    private void reportPermission() {
        String state;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) state = "granted";
        else if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) state = "approximate";
        else state = wantLocation ? "denied" : "unknown";
        js("MC.onLocationPermission('" + state + "')");
        js("MC.onLocationProvider(" + gnss.isProviderEnabled() + ")");
    }

    /** Pide permiso de notificaciones (Android 13+) antes de iniciar el servicio del track. */
    void withNotificationPermission(Runnable r) {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                afterNotificationPermission = r;
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
            } else {
                r.run();
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_LOCATION) {
            if (hasLocationPermission()) gnss.start();
            reportPermission();
        } else if (requestCode == REQ_NOTIFICATIONS) {
            // El track se graba igual aunque se niegue (la notificación no se verá en la barra).
            Runnable r = afterNotificationPermission;
            afterNotificationPermission = null;
            if (r != null) r.run();
        }
    }

    // ------------------------------------------------------------------ utilidades
    void setKeepScreenOn(boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    void openExternal(String url) {
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
        runOnUiThread(() -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception e) {
                Toast.makeText(this, L10n.s(this, R.string.toast_link), Toast.LENGTH_SHORT).show();
            }
        });
    }
}
