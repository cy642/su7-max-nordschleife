"""Package the self-contained game using JDK 17+ and the Android 35 SDK."""
import argparse
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

VERSION_CODE = "12"
VERSION_NAME = "2.0.0"

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
parser.add_argument("--debug", action="store_true", help="Sign with a local debug keystore instead of release key")
args = parser.parse_args()

sdk = Path(os.environ["ANDROID_HOME"])
jdk = Path(os.environ["JAVA_HOME"]) / "bin"
bt = sdk / "build-tools" / "35.0.0"
android = sdk / "platforms" / "android-35" / "android.jar"
windows = os.name == "nt"

def tool(folder, name):
    suffix = (".bat" if name in ("apksigner", "d8") else ".exe") if windows else ""
    return str(folder / (name + suffix))

def run(*command):
    subprocess.run([str(arg) for arg in command], check=True)

if args.debug:
    keystore = None
    key_alias = "androiddebugkey"
    key_pass = "pass:android"
else:
    keystore = Path(os.environ.get("NORDRUN_KEYSTORE", "")).resolve()
    key_alias = "nordrun"
    key_pass = "env:NORDRUN_KEY_PASSWORD"
    if not os.environ.get("NORDRUN_KEY_PASSWORD") or not keystore.is_file():
        parser.error("Set NORDRUN_KEYSTORE and NORDRUN_KEY_PASSWORD to your signing key (or pass --debug).")

with tempfile.TemporaryDirectory() as tmp:
    temp = Path(tmp)
    if args.debug:
        home_ks = (Path.home() / ".android" / "debug.keystore").resolve()
        try:
            if home_ks.is_file():
                home_ks.read_bytes()[:1]
                keystore = home_ks
        except OSError:
            keystore = None
        if keystore is None:
            keystore = temp / "debug.keystore"
            run(tool(jdk, "keytool"), "-genkeypair", "-keystore", keystore,
                "-storepass", "android", "-alias", key_alias, "-keypass", "android",
                "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
                "-dname", "CN=Android Debug,O=Android,C=US")
    classes, dex = temp / "classes", temp / "dex"
    classes.mkdir()
    dex.mkdir()
    resources, apk = temp / "res.zip", temp / "base.apk"
    run(tool(bt, "aapt2"), "compile", "--dir", here / "res", "-o", resources)
    run(tool(bt, "aapt2"), "link", "--manifest", here / "AndroidManifest.xml", "-I", android,
        "--min-sdk-version", "28", "--target-sdk-version", "35", "--version-code", VERSION_CODE,
        "--version-name", VERSION_NAME, "-o", apk, resources)
    commit = ""
    try:
        commit = subprocess.check_output(
            ["git", "-C", str(here.parent), "rev-parse", "HEAD"], text=True
        ).strip()
    except Exception:
        commit = ""
    build_info = temp / "BuildInfo.java"
    build_info.write_text(
        f'package io.github.cy642.nordrun;\nfinal class BuildInfo {{ static final String COMMIT = "{commit}"; }}\n',
        encoding="utf-8",
    )
    run(tool(jdk, "javac"), "-encoding", "UTF-8", "-source", "8", "-target", "8",
        "-classpath", android, "-d", classes, *sorted(here.glob("*.java")), build_info)
    with zipfile.ZipFile(temp / "code.jar", "w", compression=zipfile.ZIP_STORED) as jar_bundle:
        for cls in sorted(classes.rglob("*.class")):
            jar_bundle.write(cls, cls.relative_to(classes).as_posix())
    run(tool(bt, "d8"), "--lib", android, "--min-api", "28", "--output", dex, temp / "code.jar")
    with zipfile.ZipFile(apk, "a", compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.write(dex / "classes.dex", "classes.dex")
        bundle.write(here.parent / "index.html", "assets/index.html")
    run(tool(bt, "zipalign"), "-p", "4", apk, temp / "aligned.apk")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    run(tool(bt, "apksigner"), "sign", "--ks", keystore, "--ks-key-alias", key_alias,
        "--ks-pass", key_pass, "--v4-signing-enabled", "false",
        "--out", args.output, temp / "aligned.apk")
    run(tool(bt, "apksigner"), "verify", "--verbose", args.output)
