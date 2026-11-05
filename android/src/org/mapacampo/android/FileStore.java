package org.mapacampo.android;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Copia los archivos elegidos por el usuario (URIs content:// del selector del
 * sistema) al almacenamiento privado de la app, para que los mapas sigan
 * disponibles sin conexión y sin depender de permisos de almacenamiento.
 */
final class FileStore {
    private static final List<String> EXT = Arrays.asList("tif", "tiff", "geojson", "json", "kml", "kmz", "gpx", "csv", "txt", "xml");
    private final Context ctx;
    private final File dir;
    private static final ExecutorService io = Executors.newSingleThreadExecutor(); // uno por proceso: copias en fila

    FileStore(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.dir = new File(ctx.getFilesDir(), "maps");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    /** Archivo dentro de la carpeta de mapas; null si el nombre no es seguro. */
    File file(String name) {
        if (name == null || name.isEmpty() || name.contains("/") || name.contains("\\") || name.equals("..") || name.equals(".")) return null;
        return new File(dir, name);
    }

    String listJson() {
        JSONArray a = new JSONArray();
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (!f.isFile() || f.getName().endsWith(".part")) continue;
                try {
                    a.put(new JSONObject().put("name", f.getName()).put("size", f.length()).put("modified", f.lastModified()));
                } catch (Exception ignored) {
                }
            }
        }
        return a.toString();
    }

    boolean delete(String name) {
        File f = file(name);
        return f != null && f.isFile() && f.delete();
    }

    /** Guarda texto generado por la app (p. ej. un plan) y devuelve el nombre final, o null si falla. */
    String writeText(String name, String content) {
        String clean = sanitize(name);
        if (!EXT.contains(extOf(clean))) clean = clean + ".geojson";
        File dest = unique(clean, -1);
        File tmp = new File(dir, dest.getName() + ".part");
        try {
            writeDurable(tmp, content);
        } catch (IOException e) {
            Log.e(MainActivity.TAG, "writeText " + name, e);
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return null;
        }
        return tmp.renameTo(dest) ? dest.getName() : null;
    }

    /** Reemplaza el contenido de un archivo de la app (capas editadas); escribe primero un .part. */
    boolean replaceText(String name, String content) {
        File dest = file(name);
        if (dest == null) return false;
        File tmp = new File(dir, dest.getName() + ".edit.part");
        try {
            writeDurable(tmp, content);
        } catch (IOException e) {
            Log.e(MainActivity.TAG, "replaceText " + name, e);
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return false;
        }
        return tmp.renameTo(dest);
    }

    /**
     * Copia una sola vez un archivo incluido en el APK (assets) a la carpeta de la app, para
     * leerlo por rangos como cualquier archivo importado. Si ya está con el mismo tamaño, no
     * lo copia de nuevo. Responde con MC.onAssetInstalled({asset, name, size} o {asset, error}).
     */
    void installAssetAsync(final String assetPath, final String destName, final MainActivity act) {
        io.execute(() -> {
            JSONObject res = new JSONObject();
            try {
                res.put("asset", assetPath);
                File dest = file(sanitize(destName));
                if (dest == null) throw new IOException(L10n.s(ctx, R.string.err_bad_name));
                long len = -1;
                try (android.content.res.AssetFileDescriptor afd = ctx.getAssets().openFd(assetPath)) {
                    len = afd.getLength();
                } catch (IOException ignored) {
                    // el archivo está comprimido dentro del APK: no se conoce el tamaño de antemano
                }
                if (!(dest.isFile() && len > 0 && dest.length() == len)) {
                    File tmp = new File(dir, dest.getName() + ".asset.part");
                    //noinspection ResultOfMethodCallIgnored
                    tmp.delete(); // restos de un intento anterior
                    long need = len + 64L * 1024 * 1024;
                    if (len > 0 && dir.getUsableSpace() < need) {
                        throw new IOException(L10n.s(ctx, R.string.err_space_need, (int) (need >> 20), (int) (dir.getUsableSpace() >> 20)));
                    }
                    boolean ok = false;
                    try {
                        try (InputStream in = ctx.getAssets().open(assetPath); FileOutputStream out = new FileOutputStream(tmp)) {
                            byte[] buf = new byte[1 << 20];
                            int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                            out.flush();
                            out.getFD().sync();
                        }
                        if (!tmp.renameTo(dest)) throw new IOException(L10n.s(ctx, R.string.err_save, dest.getName()));
                        ok = true;
                    } finally {
                        if (!ok) {
                            //noinspection ResultOfMethodCallIgnored
                            tmp.delete();
                        }
                    }
                }
                res.put("name", dest.getName()).put("size", dest.length());
            } catch (Exception e) {
                Log.e(MainActivity.TAG, "installAsset " + assetPath, e);
                try {
                    res.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
                } catch (Exception ignored) {
                }
            }
            act.js("MC.onAssetInstalled(" + res + ")");
        });
    }

    void importAsync(final List<Uri> uris, final MainActivity act) {
        io.execute(() -> {
            JSONArray done = new JSONArray();
            StringBuilder errors = new StringBuilder();
            for (Uri uri : uris) {
                try {
                    JSONObject r = copy(uri, act);
                    if (r != null) done.put(r);
                } catch (Exception e) {
                    Log.e(MainActivity.TAG, "import " + uri, e);
                    if (errors.length() > 0) errors.append(' ');
                    errors.append(e.getMessage());
                }
            }
            JSONObject res = new JSONObject();
            try {
                res.put("files", done);
                if (errors.length() > 0) res.put("error", errors.toString());
            } catch (Exception ignored) {
            }
            act.js("MC.onImportDone(" + res + ")");
        });
    }

    private JSONObject copy(Uri uri, MainActivity act) throws IOException {
        ContentResolver cr = ctx.getContentResolver();
        String name = null;
        long size = -1;
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i0 = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int i1 = c.getColumnIndex(OpenableColumns.SIZE);
                if (i0 >= 0) name = c.getString(i0);
                if (i1 >= 0 && !c.isNull(i1)) size = c.getLong(i1);
            }
        } catch (Exception ignored) {
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null) name = "archivo";
        name = sanitize(name);
        if (size > 0 && dir.getUsableSpace() < size + 64L * 1024 * 1024) {
            throw new IOException(L10n.s(ctx, R.string.err_space_for, name));
        }
        File tmp = new File(dir, name + ".import-" + System.nanoTime() + ".part");
        byte[] head = new byte[512];
        int headLen = 0;
        try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(tmp)) {
            if (in == null) throw new IOException(L10n.s(ctx, R.string.err_open, name));
            byte[] buf = new byte[1 << 20];
            long total = 0, lastReport = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                if (headLen < head.length) {
                    int k = Math.min(head.length - headLen, n);
                    System.arraycopy(buf, 0, head, headLen, k);
                    headLen += k;
                }
                out.write(buf, 0, n);
                total += n;
                long now = System.currentTimeMillis();
                if (now - lastReport > 400) {
                    lastReport = now;
                    act.js("MC.onImportProgress(" + JSONObject.quote(name) + "," + total + "," + size + ")");
                }
            }
        }
        String ext = extOf(name);
        if (!EXT.contains(ext)) {
            String sniffed = sniff(head, headLen);
            if (sniffed == null) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                throw new IOException(L10n.s(ctx, R.string.err_format, name));
            }
            name = name + "." + sniffed;
        }
        File dest = unique(name, tmp.length());
        if (dest.exists()) {
            if (sameBytes(tmp, dest)) {
                // el mismo archivo ya estaba importado: se reutiliza
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                try {
                    return new JSONObject().put("name", dest.getName()).put("size", dest.length());
                } catch (Exception e) {
                    return null;
                }
            }
            dest = unique(name, -1); // mismo nombre y tamaño pero distinto contenido (p. ej. una capa editada): nunca se pisa
        }
        if (!tmp.renameTo(dest)) throw new IOException(L10n.s(ctx, R.string.err_save, name));
        try {
            return new JSONObject().put("name", dest.getName()).put("size", dest.length());
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean sameBytes(File a, File b) {
        if (a.length() != b.length()) return false;
        byte[] x = new byte[1 << 16], y = new byte[1 << 16];
        try (InputStream ia = new java.io.FileInputStream(a); InputStream ib = new java.io.FileInputStream(b)) {
            while (true) {
                int n = ia.read(x);
                if (n < 0) return ib.read() < 0;
                int m = 0;
                while (m < n) {
                    int k = ib.read(y, m, n - m);
                    if (k < 0) return false;
                    m += k;
                }
                for (int i = 0; i < n; i++) if (x[i] != y[i]) return false;
            }
        } catch (IOException e) {
            return false;
        }
    }

    /** Escribe todo y lo fuerza al almacenamiento antes de renombrar (un corte de batería no deja el archivo vacío). */
    private static void writeDurable(File tmp, String content) throws IOException {
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            out.flush();
            out.getFD().sync();
        }
    }

    /** Si ya existe un archivo con el mismo nombre y distinto tamaño, añade (2), (3)... */
    private File unique(String name, long size) {
        File f = new File(dir, name);
        if (!f.exists() || f.length() == size) return f;
        String base = name, ext = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            base = name.substring(0, dot);
            ext = name.substring(dot);
        }
        for (int i = 2; i < 1000; i++) {
            f = new File(dir, base + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, base + "_" + System.currentTimeMillis() + ext);
    }

    private static String sanitize(String n) {
        String s = n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (s.startsWith(".")) s = "_" + s;
        if (s.length() > 120) {
            String ext = extOf(s);
            s = s.substring(0, 110) + (ext.isEmpty() ? "" : "." + ext);
        }
        return s.isEmpty() ? "archivo" : s;
    }

    private static String extOf(String n) {
        int dot = n.lastIndexOf('.');
        return dot >= 0 ? n.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
    }

    /** Reconoce el formato por los primeros bytes cuando el nombre no trae extensión. */
    private static String sniff(byte[] b, int n) {
        if (n >= 4 && ((b[0] == 'I' && b[1] == 'I' && (b[2] == 42 || b[2] == 43) && b[3] == 0) || (b[0] == 'M' && b[1] == 'M' && b[2] == 0 && (b[3] == 42 || b[3] == 43)))) return "tif";
        if (n >= 2 && b[0] == 'P' && b[1] == 'K') return "kmz";
        String s = new String(b, 0, n).trim();
        if (s.startsWith("{")) return "geojson";
        if (s.startsWith("<?xml") || s.startsWith("<kml") || s.startsWith("<gpx")) {
            return s.contains("gpx") ? "gpx" : "kml";
        }
        return null;
    }
}
