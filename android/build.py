"""Package the self-contained game using JDK 17 and the Android 35 SDK."""
import argparse
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
args = parser.parse_args()
sdk = Path(os.environ["ANDROID_HOME"])
jdk = Path(os.environ["JAVA_HOME"]) / "bin"
bt = sdk / "build-tools" / "35.0.0"
android = sdk / "platforms" / "android-35" / "android.jar"
keystore = Path(os.environ["NORDRUN_KEYSTORE"]).resolve()
if not os.environ.get("NORDRUN_KEY_PASSWORD") or not keystore.is_file():
    parser.error("Set NORDRUN_KEYSTORE and NORDRUN_KEY_PASSWORD to your signing key.")
windows = os.name == "nt"

def tool(folder, name):
    suffix = (".bat" if name in ("apksigner","d8") else ".exe") if windows else ""
    return str(folder / (name + suffix))

def run(*command):
    subprocess.run([str(arg) for arg in command], check=True)

with tempfile.TemporaryDirectory() as tmp:
    temp = Path(tmp)
    classes, dex = temp / "classes", temp / "dex"
    classes.mkdir()
    dex.mkdir()
    resources, apk = temp / "res.zip", temp / "base.apk"
    run(tool(bt,"aapt2"), "compile", "--dir", here/"res", "-o", resources)
    run(tool(bt,"aapt2"), "link", "--manifest", here/"AndroidManifest.xml", "-I", android,
        "--min-sdk-version", "28", "--target-sdk-version", "35", "--version-code", "5",
        "--version-name", "1.3.0", "-o", apk, resources)
    run(tool(jdk,"javac"), "-encoding", "UTF-8", "-source", "8", "-target", "8",
        "-classpath", android, "-d", classes, here/"RaceActivity.java")
    run(tool(jdk,"jar"), "cf", temp/"code.jar", "-C", classes, ".")
    run(tool(bt,"d8"), "--lib", android, "--min-api", "28", "--output", dex, temp/"code.jar")
    with zipfile.ZipFile(apk, "a", compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.write(dex/"classes.dex", "classes.dex")
        bundle.write(here.parent/"index.html", "assets/index.html")
    run(tool(bt,"zipalign"), "-p", "4", apk, temp/"aligned.apk")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    run(tool(bt,"apksigner"), "sign", "--ks", keystore, "--ks-key-alias", "nordrun",
        "--ks-pass", "env:NORDRUN_KEY_PASSWORD", "--v4-signing-enabled", "false",
        "--out", args.output, temp/"aligned.apk")
    run(tool(bt,"apksigner"), "verify", "--verbose", args.output)
