package org.mapacampo.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * Idioma y unidades de los textos que muestra la parte nativa (notificación del track, avisos,
 * errores de archivos). La página web decide el idioma (el del teléfono o el elegido en Ajustes)
 * y lo comunica con MCNative.setUiPrefs(idioma, unidades); así ambas partes hablan igual.
 */
final class L10n {
    private static final String PREFS = "mc_ui";
    private static final String KEY_LANG = "lang";
    private static final String KEY_UNITS = "units";

    private L10n() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context c, String lang, String units) {
        prefs(c).edit().putString(KEY_LANG, lang == null ? "" : lang).putString(KEY_UNITS, units == null ? "metric" : units).apply();
    }

    static String lang(Context c) {
        return prefs(c).getString(KEY_LANG, "");
    }

    static boolean imperial(Context c) {
        return "imperial".equals(prefs(c).getString(KEY_UNITS, "metric"));
    }

    /** Contexto con el idioma de la app (o el del teléfono si la web aún no lo informó). */
    static Context ctx(Context base) {
        String code = lang(base);
        if (code.isEmpty()) return base;
        Configuration conf = new Configuration(base.getResources().getConfiguration());
        conf.setLocale(locale(code));
        return base.createConfigurationContext(conf);
    }

    static Locale locale(String code) {
        return "pt".equals(code) ? new Locale("pt", "BR") : new Locale(code);
    }

    static String s(Context c, int id, Object... args) {
        return ctx(c).getString(id, args);
    }

    static String plural(Context c, int id, int n, Object... args) {
        return ctx(c).getResources().getQuantityString(id, n, args);
    }

    /** Distancia con las unidades y los separadores del idioma: 850 m, 1,25 km, 2 790 ft, 1.2 mi. */
    static String distance(Context c, double meters) {
        String code = lang(c);
        Locale loc = code.isEmpty() ? Locale.getDefault() : locale(code);
        NumberFormat nf = NumberFormat.getNumberInstance(loc);
        if (imperial(c)) {
            double ft = meters / 0.3048;
            if (ft < 5280) {
                nf.setMaximumFractionDigits(0);
                return nf.format(ft) + " ft";
            }
            nf.setMinimumFractionDigits(2);
            nf.setMaximumFractionDigits(2);
            return nf.format(meters / 1609.344) + " mi";
        }
        if (meters < 1000) {
            nf.setMaximumFractionDigits(0);
            return nf.format(meters) + " m";
        }
        nf.setMinimumFractionDigits(2);
        nf.setMaximumFractionDigits(2);
        return nf.format(meters / 1000) + " km";
    }
}
