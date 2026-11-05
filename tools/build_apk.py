"""Compila Mapa de Campo en un APK firmado, sin Gradle, con las herramientas
oficiales del Android SDK (aapt2, javac, d8, zipalign, apksigner).

    python tools/build_apk.py            # compila la web y el APK de versión
    python tools/build_apk.py --no-web   # reutiliza android/assets/www

Variables: ANDROID_SDK (por defecto %LOCALAPPDATA%/Android/Sdk), JAVA_HOME.
La clave de firma está en android/keystore/ (guárdela: sin ella no se pueden
publicar actualizaciones que se instalen encima de esta versión).
"""
from __future__ import annotations

import os
import secrets
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

APP_VERSION = "1.5.0"
VERSION_CODE = 6
MIN_SDK = 24      # Android 7.0
TARGET_SDK = 36   # Android 16
BUILD_TOOLS = "36.1.0"
PLATFORM = "android-36"

ROOT = Path(__file__).resolve().parent.parent
AND = ROOT / "android"
BUILD = ROOT / "build"
DIST = ROOT / "dist"
SDK = Path(os.environ.get("ANDROID_SDK", Path(os.environ.get("LOCALAPPDATA", "")) / "Android" / "Sdk"))
BT = SDK / "build-tools" / BUILD_TOOLS
ANDROID_JAR = SDK / "platforms" / PLATFORM / "android.jar"
JAVA_HOME = Path(os.environ.get("JAVA_HOME", ""))
EXE = ".exe" if os.name == "nt" else ""
BAT = ".bat" if os.name == "nt" else ""
DEBUG = "--debug" in sys.argv  # APK depurable (WebView inspeccionable); no se distribuye


def run(cmd: list, **kw) -> None:
    print(">", " ".join(str(c) for c in cmd[:6]), "..." if len(cmd) > 6 else "")
    subprocess.run([str(c) for c in cmd], check=True, **kw)


def keystore() -> tuple[Path, str]:
    ks_dir = AND / "keystore"
    ks_dir.mkdir(exist_ok=True)
    ks = ks_dir / "mapacampo-release.jks"
    props = ks_dir / "keystore.properties"
    if ks.exists() and props.exists():
        pwd = dict(l.split("=", 1) for l in props.read_text(encoding="utf-8").splitlines() if "=" in l)["storePassword"].strip()
        return ks, pwd
    pwd = secrets.token_urlsafe(24)
    run([JAVA_HOME / "bin" / f"keytool{EXE}", "-genkeypair", "-keystore", ks, "-storetype", "PKCS12", "-alias", "mapacampo",
         "-keyalg", "RSA", "-keysize", "4096", "-validity", "10000", "-storepass", pwd, "-keypass", pwd,
         "-dname", "CN=Mapa de Campo, OU=Levantamiento, O=Mapa de Campo, L=Guacimo, ST=Limon, C=CR"])
    props.write_text(f"storeFile=mapacampo-release.jks\nkeyAlias=mapacampo\nstorePassword={pwd}\nkeyPassword={pwd}\n", encoding="utf-8")
    print("Clave de firma nueva en", ks)
    return ks, pwd


def main() -> None:
    for p in (BT / f"aapt2{EXE}", ANDROID_JAR, JAVA_HOME / "bin" / f"javac{EXE}"):
        if not p.exists():
            sys.exit(f"No se encontró {p}")
    if "--no-web" not in sys.argv:
        run(["node", ROOT / "web" / "build.mjs"])
    if not (AND / "res" / "mipmap-mdpi" / "ic_launcher.png").exists():
        run([sys.executable, ROOT / "tools" / "make_icons.py", AND / "res"])

    shutil.rmtree(BUILD, ignore_errors=True)
    (BUILD / "gen").mkdir(parents=True)
    (BUILD / "classes").mkdir()
    (BUILD / "dex").mkdir()
    DIST.mkdir(exist_ok=True)

    # 1. Recursos
    run([BT / f"aapt2{EXE}", "compile", "--dir", AND / "res", "-o", BUILD / "res.zip"])
    run([BT / f"aapt2{EXE}", "link", "-o", BUILD / "base.apk", "-I", ANDROID_JAR,
         "--manifest", AND / "AndroidManifest.xml", "-A", AND / "assets",
         "--min-sdk-version", MIN_SDK, "--target-sdk-version", TARGET_SDK,
         "--version-code", VERSION_CODE, "--version-name", APP_VERSION,
         "--java", BUILD / "gen", "--auto-add-overlay", "--no-compress-regex", r"\.(tif|tiff)$",
         *(["--debug-mode"] if DEBUG else []),
         BUILD / "res.zip"])

    # 2. Java → .class → .dex
    sources = [str(p) for p in (AND / "src").rglob("*.java")] + [str(p) for p in (BUILD / "gen").rglob("*.java")]
    run([JAVA_HOME / "bin" / f"javac{EXE}", "--release", "11", "-encoding", "UTF-8", "-Xlint:-options",
         "-cp", ANDROID_JAR, "-d", BUILD / "classes", *sources])
    classes = [str(p) for p in (BUILD / "classes").rglob("*.class")]
    run([BT / f"d8{BAT}", "--release", "--min-api", MIN_SDK, "--lib", ANDROID_JAR, "--output", BUILD / "dex", *classes], shell=False)

    # 3. Añade classes.dex al APK conservando el resto (resources.arsc sin comprimir)
    unaligned = BUILD / "unaligned.apk"
    with zipfile.ZipFile(BUILD / "base.apk") as zin, zipfile.ZipFile(unaligned, "w") as zout:
        for item in zin.infolist():
            zout.writestr(item, zin.read(item.filename), compress_type=item.compress_type)
        zout.write(BUILD / "dex" / "classes.dex", "classes.dex", compress_type=zipfile.ZIP_DEFLATED)

    # 4. Alineación y firma (APK Signature Scheme v2/v3)
    aligned = BUILD / "aligned.apk"
    run([BT / f"zipalign{EXE}", "-P", "16", "-f", "4", unaligned, aligned])
    ks, pwd = keystore()
    out = DIST / (f"MapaDeCampo-{APP_VERSION}-depuracion.apk" if DEBUG else f"MapaDeCampo-{APP_VERSION}.apk")
    run([BT / f"apksigner{BAT}", "sign", "--ks", ks, "--ks-key-alias", "mapacampo", "--ks-pass", f"pass:{pwd}",
         "--key-pass", f"pass:{pwd}", "--v1-signing-enabled", "true", "--v2-signing-enabled", "true", "--v3-signing-enabled", "true",
         "--out", out, aligned])
    run([BT / f"apksigner{BAT}", "verify", "--verbose", "--print-certs", out])
    print(f"\nAPK listo: {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
