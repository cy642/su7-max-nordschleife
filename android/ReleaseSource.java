package io.github.cy642.nordrun;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.RandomAccessFile;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;

/** Only update metadata and verified APKs use the network; the game stays offline. */
final class ReleaseSource {
    private static final String REPO = "cy642/su7-max-nordschleife";
    private static final String API = "https://api.github.com/repos/" + REPO + "/releases";
    private static final String COMMIT_API = "https://api.github.com/repos/" + REPO + "/commits/main";
    private static final String PAGES_HTML = "https://cy642.github.io/su7-max-nordschleife/index.html";
    private static final String RAW_HTML = "https://raw.githubusercontent.com/" + REPO + "/";
    private static final String DOWNLOAD = "https://github.com/" + REPO + "/releases/download/";
    private static final Pattern VERSION = Pattern.compile("(?:0|[1-9][0-9]{0,8})(?:\\.(?:0|[1-9][0-9]{0,8})){2}");
    private static final Pattern DIGEST = Pattern.compile("sha256:[0-9a-f]{64}");
    private static final Pattern COMMIT_SHA = Pattern.compile("[0-9a-f]{40}");
    private static final long MAX_APK_SIZE = 256L * 1024 * 1024;
    private static final long MAX_WEB_SIZE = 64L * 1024 * 1024;
    private static final long MIN_WEB_SIZE = 500L * 1024;
    private static final int MAX_METADATA_SIZE = 2 * 1024 * 1024;
    private static final int SIGNATURES = PackageManager.GET_SIGNING_CERTIFICATES;

    private ReleaseSource() {}

    static final class WebUpdate {
        final String sha, shortSha, message;

        WebUpdate(String sha, String message) throws IOException {
            if (sha == null || !COMMIT_SHA.matcher(sha).matches()) {
                throw new IOException("线上资源版本信息异常");
            }
            this.sha = sha;
            this.shortSha = sha.substring(0, 7);
            String clean = message == null ? "" : message.trim();
            int nl = clean.indexOf('\n');
            if (nl >= 0) clean = clean.substring(0, nl).trim();
            this.message = clean.length() > 160 ? clean.substring(0, 160) : clean;
        }
    }

    static final class Release {
        final String version, notes;
        final long size;
        private final String url, digest;

        private Release(String version, String notes, long size, String digest) throws IOException {
            if (!VERSION.matcher(version).matches() || size <= 0 || size > MAX_APK_SIZE ||
                    (digest != null && !DIGEST.matcher(digest).matches())) {
                throw new IOException("安装包的发布信息异常，请稍后重试");
            }
            this.version = version;
            this.notes = notes.length() > 4000 ? notes.substring(0, 4000) : notes;
            this.size = size;
            this.url = DOWNLOAD + "android-v" + version + "/Nordrun-" + version + ".apk";
            this.digest = digest;
        }

        JSONObject toJson() throws JSONException {
            return new JSONObject().put("version", version).put("notes", notes)
                    .put("size", size).put("digest", digest);
        }

        static Release fromJson(JSONObject data) throws JSONException, IOException {
            return new Release(data.getString("version"), data.optString("notes"), data.getLong("size"),
                    data.isNull("digest") ? null : data.getString("digest"));
        }
    }

    interface Progress {
        void onProgress(long received, long total);
    }

    static Release check(Context context) throws IOException {
        String installed = installedPackage(context).versionName;
        if (installed == null || !VERSION.matcher(installed).matches()) {
            throw new IOException("无法识别当前安装的版本");
        }
        removeSupersededCache(new File(context.getCacheDir(), "updates"), installed, null);
        try {
            JSONObject latest = new JSONObject(metadata(API + "/latest"));
            String version = stableAndroidVersion(latest);
            if (version != null) {
                return compare(version, installed) <= 0 ? null : asset(latest, version);
            }
            // A web-only release might have been marked as "latest".
            JSONArray releases = new JSONArray(metadata(API + "?per_page=100"));
            JSONObject newest = null;
            String best = installed;
            for (int i = 0; i < releases.length(); i++) {
                JSONObject item = releases.getJSONObject(i);
                String candidate = stableAndroidVersion(item);
                if (candidate != null && compare(candidate, best) > 0) {
                    newest = item;
                    best = candidate;
                }
            }
            return newest == null ? null : asset(newest, best);
        } catch (JSONException e) {
            throw new IOException("暂时无法读取发布信息，请稍后重试", e);
        }
    }

    private static int compare(String a, String b) {
        String[] left = a.split("\\."), right = b.split("\\.");
        for (int i = 0; i < left.length; i++) {
            int order = Integer.compare(Integer.parseInt(left[i]), Integer.parseInt(right[i]));
            if (order != 0) return order;
        }
        return 0;
    }

    private static String stableAndroidVersion(JSONObject item) throws JSONException {
        if (item.getBoolean("draft") || item.getBoolean("prerelease")) return null;
        String tag = item.getString("tag_name");
        if (!tag.startsWith("android-v")) return null;
        String version = tag.substring("android-v".length());
        return VERSION.matcher(version).matches() ? version : null;
    }

    private static Release asset(JSONObject item, String version) throws JSONException, IOException {
        String filename = "Nordrun-" + version + ".apk";
        JSONArray assets = item.getJSONArray("assets");
        for (int i = 0; i < assets.length(); i++) {
            JSONObject apk = assets.getJSONObject(i);
            if (!filename.equals(apk.optString("name")) || !"uploaded".equals(apk.optString("state"))) continue;
            long size = apk.getLong("size");
            String digest = apk.isNull("digest") ? null : apk.getString("digest");
            String notes = item.isNull("body") ? "" : item.getString("body").trim();
            Release release = new Release(version, notes, size, digest);
            if (!release.url.equals(apk.getString("browser_download_url"))) {
                throw new IOException("安装包的发布信息异常，请稍后重试");
            }
            return release;
        }
        throw new IOException("新版安装包还未发布完成，请稍后重试");
    }

    private static HttpsURLConnection connection(URL url) throws IOException {
        HttpsURLConnection http = (HttpsURLConnection) url.openConnection();
        http.setRequestProperty("User-Agent", "Nordrun-Android-Updater");
        http.setConnectTimeout(10000);
        http.setReadTimeout(20000);
        http.setInstanceFollowRedirects(false);
        http.setUseCaches(false);
        return http;
    }

    private static String metadata(String url) throws IOException {
        HttpsURLConnection http = connection(new URL(url));
        try {
            http.setRequestProperty("Accept", "application/vnd.github+json");
            http.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            int status = http.getResponseCode();
            if (status == 403 || status == 429) throw new IOException("更新服务暂时繁忙，请稍后重试");
            if (status != 200) throw new IOException("更新服务暂时无法访问");
            try (InputStream in = http.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    checkCancelled();
                    if (out.size() + n > MAX_METADATA_SIZE) throw new IOException("发布信息过大");
                    out.write(buffer, 0, n);
                }
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            http.disconnect();
        }
    }

    private static HttpsURLConnection openAsset(Release release) throws IOException {
        URL url = new URL(release.url);
        for (int redirects = 0; redirects <= 5; redirects++) {
            checkCancelled();
            HttpsURLConnection http = connection(url);
            boolean keep = false;
            try {
                int status = http.getResponseCode();
                if (status == 200) {
                    keep = true;
                    return http;
                }
                String location = http.getHeaderField("Location");
                if (!(status == 301 || status == 302 || status == 303 || status == 307 || status == 308) ||
                        location == null) throw new IOException("安装包下载失败，请稍后重试");
                URL next = new URL(url, location);
                String host = next.getHost();
                boolean githubCdn = host.equals("release-assets.githubusercontent.com") ||
                        host.equals("objects.githubusercontent.com") || host.equals("github-releases.githubusercontent.com");
                if (!"https".equals(next.getProtocol()) || next.getUserInfo() != null ||
                        (next.getPort() != -1 && next.getPort() != 443) || !githubCdn) {
                    throw new IOException("安装包下载地址异常");
                }
                url = next;
            } finally {
                if (!keep) http.disconnect();
            }
        }
        throw new IOException("安装包下载地址无效");
    }

    private static PackageInfo installedPackage(Context context) throws IOException {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), SIGNATURES);
        } catch (PackageManager.NameNotFoundException e) {
            throw new IOException("无法读取当前版本", e);
        }
    }

    static synchronized File download(Context context, Release release, Progress progress) throws IOException {
        File directory = new File(context.getCacheDir(), "updates");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法创建下载目录");
        String filename = "Nordrun-" + release.version + ".apk";
        File target = new File(directory, filename);
        if (target.isFile()) {
            try {
                verify(context, release, target);
                removeSupersededCache(directory, release.version, target);
                if (progress != null) progress.onProgress(release.size, release.size);
                return target;
            } catch (InterruptedIOException e) {
                throw e;
            } catch (IOException invalid) {
                if (!target.delete()) throw new IOException("无法清理旧安装包", invalid);
            }
        }
        // Some Android package parsers expect an .apk suffix even on the private staging file.
        File part = new File(directory, "download.part.apk");
        boolean saved = false;
        try {
            HttpsURLConnection http = openAsset(release);
            try (InputStream in = http.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[64 * 1024];
                long received = 0;
                int n;
                while ((n = in.read(buffer)) != -1) {
                    checkCancelled();
                    received += n;
                    if (received > release.size) throw new IOException("下载的文件大小与发布记录不一致");
                    out.write(buffer, 0, n);
                    if (progress != null) progress.onProgress(received, release.size);
                }
                if (received != release.size) throw new IOException("安装包未下载完整，请重试");
            } finally {
                http.disconnect();
            }
            verify(context, release, part);
            checkCancelled();
            if (!part.renameTo(target)) throw new IOException("无法保存安装包");
            saved = true;
            removeSupersededCache(directory, release.version, target);
            return target;
        } finally {
            if (!saved) part.delete();
        }
    }

    // Keep at most the newly verified update across ordinary upgrades, without touching
    // interrupted downloads, other application cache files or a newer pending release.
    private static void removeSupersededCache(File directory, String version, File keep) {
        File[] files = directory.listFiles();
        if (files == null) return;
        for (File file : files) {
            String name = file.getName();
            if (file.equals(keep) || !name.startsWith("Nordrun-") || !name.endsWith(".apk") || !file.isFile()) continue;
            String cachedVersion = name.substring("Nordrun-".length(), name.length() - ".apk".length());
            if (VERSION.matcher(cachedVersion).matches() && compare(cachedVersion, version) <= 0) file.delete();
        }
    }

    static void verify(Context context, Release release, File file) throws IOException {
        checkCancelled();
        if (!file.isFile() || file.length() != release.size) throw new IOException("安装包不完整，请重新下载");
        if (release.digest != null && !release.digest.equals(sha256(file))) {
            throw new IOException("安装包校验失败，请重新下载");
        }
        PackageInfo installed = installedPackage(context);
        PackageInfo apk = context.getPackageManager().getPackageArchiveInfo(file.getPath(), SIGNATURES);
        if (apk == null || !installed.packageName.equals(apk.packageName) ||
                !release.version.equals(apk.versionName) || apk.getLongVersionCode() <= installed.getLongVersionCode()) {
            throw new IOException("安装包与当前游戏或更新版本不符");
        }
        Signature[] oldSigners = installed.signingInfo == null ? null : installed.signingInfo.getApkContentsSigners();
        Signature[] newSigners = apk.signingInfo == null ? null : apk.signingInfo.getApkContentsSigners();
        if (oldSigners == null || newSigners == null || oldSigners.length == 0 || oldSigners.length != newSigners.length ||
                !new HashSet<>(Arrays.asList(oldSigners)).equals(new HashSet<>(Arrays.asList(newSigners)))) {
            throw new IOException("安装包签名与已安装游戏不一致");
        }
    }

    private static String sha256(File file) throws IOException {
        MessageDigest hash;
        try {
            hash = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new AssertionError(impossible);
        }
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) != -1) {
                checkCancelled();
                hash.update(buffer, 0, n);
            }
        }
        char[] hex = "0123456789abcdef".toCharArray();
        StringBuilder result = new StringBuilder("sha256:");
        for (byte b : hash.digest()) result.append(hex[(b >>> 4) & 15]).append(hex[b & 15]);
        return result.toString();
    }

    static WebUpdate checkWeb(String installedSha) throws IOException {
        try {
            JSONObject data = new JSONObject(metadata(COMMIT_API));
            String sha = data.optString("sha", "");
            if (!COMMIT_SHA.matcher(sha).matches()) return null;
            if (installedSha != null && installedSha.equalsIgnoreCase(sha)) return null;
            JSONObject commit = data.optJSONObject("commit");
            String msg = commit == null ? "" : commit.optString("message", "");
            return new WebUpdate(sha, msg);
        } catch (JSONException e) {
            throw new IOException("暂时无法读取线上资源信息，请稍后重试", e);
        }
    }

    private static HttpsURLConnection openWebUrl(String startUrl) throws IOException {
        URL url = new URL(startUrl);
        for (int redirects = 0; redirects <= 4; redirects++) {
            checkCancelled();
            HttpsURLConnection http = connection(url);
            boolean keep = false;
            try {
                int status = http.getResponseCode();
                if (status == 200) {
                    keep = true;
                    return http;
                }
                String location = http.getHeaderField("Location");
                if (!(status == 301 || status == 302 || status == 303 || status == 307 || status == 308) || location == null) {
                    throw new IOException("线上资源下载失败 (" + status + ")");
                }
                URL next = new URL(url, location);
                String host = next.getHost();
                boolean allowed = host.equals("cy642.github.io") || host.equals("raw.githubusercontent.com")
                        || host.equals("objects.githubusercontent.com");
                if (!"https".equals(next.getProtocol()) || !allowed) {
                    throw new IOException("线上资源地址异常");
                }
                url = next;
            } finally {
                if (!keep) http.disconnect();
            }
        }
        throw new IOException("线上资源重定向过多");
    }

    private static void validateWebHtml(File file) throws IOException {
        long len = file.length();
        if (len < MIN_WEB_SIZE || len > MAX_WEB_SIZE) {
            throw new IOException("线上资源大小异常，请重试");
        }
        byte[] head = new byte[128];
        byte[] tail = new byte[128];
        try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
            raf.readFully(head);
            raf.seek(len - tail.length);
            raf.readFully(tail);
        }
        String start = new String(head, StandardCharsets.UTF_8).toLowerCase(java.util.Locale.ROOT);
        String end = new String(tail, StandardCharsets.UTF_8).toLowerCase(java.util.Locale.ROOT);
        if (!start.contains("<!doctype html>") || !end.contains("</html>")) {
            throw new IOException("线上资源校验失败，请重试");
        }
    }

    static synchronized File downloadWeb(Context context, WebUpdate update, Progress progress) throws IOException {
        File dir = new File(context.getFilesDir(), "web");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("无法创建更新目录");
        File target = new File(dir, "index.html");
        File part = new File(dir, "index.part.html");
        String[] sources = {
            PAGES_HTML + "?v=" + update.shortSha,
            RAW_HTML + update.sha + "/index.html"
        };
        IOException lastError = null;
        for (String src : sources) {
            boolean saved = false;
            try {
                HttpsURLConnection http = openWebUrl(src);
                try (InputStream in = http.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                    long total = http.getContentLengthLong();
                    if (total <= 0) total = 12_000_000L;
                    byte[] buffer = new byte[64 * 1024];
                    long received = 0;
                    int n;
                    while ((n = in.read(buffer)) != -1) {
                        checkCancelled();
                        received += n;
                        if (received > MAX_WEB_SIZE) throw new IOException("线上资源体积超出限制");
                        out.write(buffer, 0, n);
                        if (progress != null) progress.onProgress(received, Math.max(total, received));
                    }
                } finally {
                    http.disconnect();
                }
                validateWebHtml(part);
                checkCancelled();
                if (target.exists() && !target.delete()) throw new IOException("无法替换旧版资源");
                if (!part.renameTo(target)) throw new IOException("无法保存线上资源");
                saved = true;
                return target;
            } catch (InterruptedIOException e) {
                throw e;
            } catch (IOException e) {
                lastError = e;
            } finally {
                if (!saved) part.delete();
            }
        }
        throw lastError == null ? new IOException("线上资源下载失败，请稍后重试") : lastError;
    }

    private static void checkCancelled() throws InterruptedIOException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("已取消下载");
    }
}
