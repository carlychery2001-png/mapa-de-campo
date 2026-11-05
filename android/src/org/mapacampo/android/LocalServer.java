package org.mapacampo.android;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Servidor local dentro de shouldInterceptRequest, con un dominio https propio
 * (el mismo que usa androidx WebViewAssetLoader), para que la página tenga un
 * origen seguro sin abrir puertos ni dar acceso a file://.
 *   /app/...    → assets/www (la app web)
 *   /files/...  → mapas y datos importados, con soporte de HTTP Range (206),
 *                 que es lo que permite leer solo las teselas visibles de un
 *                 GeoTIFF de cientos de MB.
 */
final class LocalServer {
    static final String HOST = "appassets.androidplatform.net";
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private final AssetManager assets;
    private final FileStore store;

    LocalServer(Context ctx, FileStore store) {
        this.assets = ctx.getAssets();
        this.store = store;
    }

    WebResourceResponse handle(WebResourceRequest req) {
        Uri u = req.getUrl();
        if (!HOST.equals(u.getHost())) return null; // p. ej. teselas OSM en línea
        String path = u.getPath() == null ? "/" : u.getPath();
        try {
            if (path.startsWith("/app/")) return asset("www/" + path.substring(5));
            if (path.equals("/files/__probe__")) return probe(req);
            if (path.startsWith("/files/")) return file(req, path.substring(7));
        } catch (Exception e) {
            Log.e(MainActivity.TAG, "LocalServer " + path, e);
            return error(500, "Internal Server Error");
        }
        return error(404, "Not Found");
    }

    private WebResourceResponse asset(String name) throws IOException {
        if (name.endsWith("/") || name.equals("www/")) name = name + "index.html";
        if (name.contains("..")) return error(403, "Forbidden");
        InputStream in;
        try {
            in = assets.open(name);
        } catch (IOException e) {
            return error(404, "Not Found");
        }
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        String mime = mimeOf(name);
        return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") ? "UTF-8" : null, 200, "OK", h, in);
    }

    /** Comprueba si el WebView entrega la cabecera Range a shouldInterceptRequest. */
    private WebResourceResponse probe(WebResourceRequest req) {
        String range = header(req, "Range");
        Map<String, String> h = new HashMap<>();
        if (range != null) {
            h.put("Content-Range", "bytes 0-15/32");
            h.put("Content-Length", "16");
            return new WebResourceResponse("application/octet-stream", null, 206, "Partial Content", h, new ByteArrayInputStream(new byte[16]));
        }
        h.put("Content-Length", "32");
        return new WebResourceResponse("application/octet-stream", null, 200, "OK", h, new ByteArrayInputStream(new byte[32]));
    }

    private WebResourceResponse file(WebResourceRequest req, String encoded) throws IOException {
        String name = Uri.decode(encoded);
        File f = store.file(name);
        if (f == null || !f.isFile()) return error(404, "Not Found");
        long total = f.length();
        String mime = mimeOf(name);
        Map<String, String> h = new HashMap<>();
        h.put("Accept-Ranges", "bytes");
        h.put("Cache-Control", "no-cache");
        h.put("X-Total-Length", String.valueOf(total));
        // Rango en la URL (?start=&end=): el WebView no lo toca. Con la cabecera
        // Range, Android aplica el rango por su cuenta saltando bytes del flujo
        // devuelto, así que un flujo ya recortado se rompe para start > 0.
        String qs = req.getUrl().getQueryParameter("start");
        if (qs != null) {
            long start = Long.parseLong(qs);
            String qe = req.getUrl().getQueryParameter("end");
            long end = qe == null ? total - 1 : Math.min(Long.parseLong(qe), total - 1);
            if (start < 0 || start >= total || start > end) {
                return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, new ByteArrayInputStream(new byte[0]));
            }
            long len = end - start + 1;
            FileInputStream fis = new FileInputStream(f);
            long skipped = 0;
            while (skipped < start) {
                long k = fis.skip(start - skipped);
                if (k <= 0) break;
                skipped += k;
            }
            h.put("Content-Length", String.valueOf(len));
            h.put("X-Range-Start", String.valueOf(start));
            return new WebResourceResponse(mime, null, 200, "OK", h, new Limited(fis, len));
        }
        String range = header(req, "Range");
        if (range != null) {
            Matcher m = RANGE.matcher(range.trim());
            if (m.find()) {
                long start, end;
                String a = m.group(1), b = m.group(2);
                if (a.isEmpty()) { // sufijo: los últimos N bytes
                    long n = Long.parseLong(b);
                    start = Math.max(0, total - n);
                    end = total - 1;
                } else {
                    start = Long.parseLong(a);
                    end = b.isEmpty() ? total - 1 : Math.min(Long.parseLong(b), total - 1);
                }
                if (start >= total || start > end) {
                    h.put("Content-Range", "bytes */" + total);
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, new ByteArrayInputStream(new byte[0]));
                }
                long len = end - start + 1;
                FileInputStream fis = new FileInputStream(f);
                fis.getChannel().position(start);
                h.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
                h.put("Content-Length", String.valueOf(len));
                return new WebResourceResponse(mime, null, 206, "Partial Content", h, new Limited(fis, len));
            }
        }
        h.put("Content-Length", String.valueOf(total));
        return new WebResourceResponse(mime, null, 200, "OK", h, new FileInputStream(f));
    }

    private static String header(WebResourceRequest req, String key) {
        Map<String, String> m = req.getRequestHeaders();
        if (m == null) return null;
        for (Map.Entry<String, String> e : m.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(key)) return e.getValue();
        }
        return null;
    }

    private static WebResourceResponse error(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, new HashMap<>(), new ByteArrayInputStream(reason.getBytes()));
    }

    static String mimeOf(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js")) return "application/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json") || n.endsWith(".geojson")) return "application/json";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".tif") || n.endsWith(".tiff")) return "image/tiff";
        if (n.endsWith(".kml")) return "application/vnd.google-earth.kml+xml";
        if (n.endsWith(".gpx")) return "application/gpx+xml";
        if (n.endsWith(".csv") || n.endsWith(".txt")) return "text/plain";
        if (n.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    /** Flujo que entrega como máximo {@code remaining} bytes. */
    private static final class Limited extends FilterInputStream {
        private long remaining;

        Limited(InputStream in, long len) {
            super(in);
            remaining = len;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int r = super.read();
            if (r >= 0) remaining--;
            return r;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int r = super.read(b, off, (int) Math.min(len, remaining));
            if (r > 0) remaining -= r;
            return r;
        }

        @Override
        public long skip(long n) throws IOException {
            long s = super.skip(Math.min(n, remaining));
            remaining -= s;
            return s;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), remaining);
        }
    }
}
