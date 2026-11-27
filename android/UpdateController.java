package io.github.cy642.nordrun;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.WebView;
import android.widget.ProgressBar;
import java.io.File;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import org.json.JSONException;
import org.json.JSONObject;

final class UpdateController {
    private static final long CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L;
    private static final long RETRY_INTERVAL_MS = 15 * 60 * 1000L;

    private final Activity activity;
    private final Context app;
    private final WebView game;
    private final SharedPreferences preferences;
    private final String version;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private Future<?> task;
    private int generation;
    private boolean foreground, destroyed, checking, manualCheck;
    private AlertDialog dialog;
    private Runnable onReturn;
    private ReleaseSource.Release waitingForPermission;

    private static final class CheckOutcome {
        final ReleaseSource.Release apk;
        final ReleaseSource.WebUpdate web;
        CheckOutcome(ReleaseSource.Release apk, ReleaseSource.WebUpdate web) {
            this.apk = apk;
            this.web = web;
        }
    }

    UpdateController(Activity activity, WebView game, Bundle state) {
        this.activity = activity;
        this.app = activity.getApplicationContext();
        this.game = game;
        try {
            version = app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            throw new IllegalStateException(e);
        }
        preferences = app.getSharedPreferences("update-check", Context.MODE_PRIVATE);
        if (!version.equals(preferences.getString("installed", ""))) {
            preferences.edit().clear()
                    .putString("installed", version)
                    .putString("web-sha", BuildInfo.COMMIT)
                    .apply();
            new File(new File(app.getFilesDir(), "web"), "index.html").delete();
        }
        if (state != null && version.equals(state.getString("update-installed")) && state.containsKey("update-permission")) {
            try {
                waitingForPermission = ReleaseSource.Release.fromJson(new JSONObject(state.getString("update-permission")));
            } catch (Exception ignored) { }
        }
    }

    File activeWebBundle() {
        if (!version.equals(preferences.getString("web-app-version", ""))) return null;
        File file = new File(new File(app.getFilesDir(), "web"), "index.html");
        return file.isFile() && file.length() > 500_000L ? file : null;
    }

    private String currentWebSha() {
        String saved = preferences.getString("web-sha", "");
        return saved.isEmpty() ? BuildInfo.COMMIT : saved;
    }

    void saveState(Bundle state) {
        if (waitingForPermission == null) return;
        try {
            state.putString("update-installed", version);
            state.putString("update-permission", waitingForPermission.toJson().toString());
        } catch (JSONException ignored) { }
    }

    void publishVersion() {
        if (!RaceActivity.GAME.equals(game.getUrl()) || destroyed) return;
        String data = "{current:" + JSONObject.quote(version)
                + ",available:" + JSONObject.quote(preferences.getString("available", "")) + "}";
        game.evaluateJavascript("window.nordrunUpdate=" + data + ";"
                + "window.dispatchEvent(new CustomEvent('nordrun-update',{detail:window.nordrunUpdate}));", null);
    }

    void resume() {
        foreground = true;
        if (waitingForPermission != null) {
            ReleaseSource.Release release = waitingForPermission;
            waitingForPermission = null;
            if (app.getPackageManager().canRequestPackageInstalls()) {
                prepare(release);
            } else {
                permissionDialog(release);
            }
            return;
        }
        if (onReturn != null) {
            Runnable next = onReturn;
            onReturn = null;
            next.run();
            return;
        }
        long now = System.currentTimeMillis();
        long nextCheck = preferences.getLong("next-check", 0);
        if (task == null && dialog == null && (now >= nextCheck || nextCheck - now > CHECK_INTERVAL_MS)) check(false);
    }

    void pause() { foreground = false; }

    void destroy() {
        destroyed = true;
        cancel();
        worker.shutdownNow();
        dismiss();
    }

    private void showWhenVisible(Runnable action) {
        if (foreground) action.run();
        else onReturn = action;
    }

    private void dismiss() {
        if (dialog != null) {
            dialog.dismiss();
            dialog = null;
        }
    }

    private void show(AlertDialog.Builder builder) {
        dismiss();
        AlertDialog created = builder.create();
        dialog = created;
        created.setOnDismissListener(ignored -> { if (dialog == created) dialog = null; });
        created.show();
    }

    private void cancel() {
        generation++;
        if (task != null) task.cancel(true);
        task = null;
        checking = false;
        manualCheck = false;
        onReturn = null;
    }

    private <T> void run(Callable<T> action, Consumer<T> success, Consumer<Exception> failure) {
        final int token = ++generation;
        task = worker.submit(() -> {
            Runnable result;
            try {
                T value = action.call();
                result = () -> success.accept(value);
            } catch (Exception e) {
                result = () -> failure.accept(e);
            }
            final Runnable completion = result;
            activity.runOnUiThread(() -> {
                if (destroyed || token != generation) return;
                task = null;
                completion.run();
            });
        });
    }

    void open() {
        if (!foreground || destroyed || (task != null && !checking)) return;
        check(true);
    }

    private CheckOutcome queryUpdates() throws IOException {
        ReleaseSource.Release apk = null;
        IOException apkError = null;
        try {
            apk = ReleaseSource.check(app);
        } catch (IOException e) {
            apkError = e;
        }
        if (apk != null) return new CheckOutcome(apk, null);
        try {
            ReleaseSource.WebUpdate web = ReleaseSource.checkWeb(currentWebSha());
            return new CheckOutcome(null, web);
        } catch (IOException webError) {
            if (apkError != null) throw apkError;
            return new CheckOutcome(null, null);
        }
    }

    private void check(boolean manual) {
        if (manual) {
            manualCheck = true;
            show(new AlertDialog.Builder(activity).setTitle("检查更新")
                    .setMessage("正在查询新版安装包与线上资源…").setOnCancelListener(ignored -> cancel())
                    .setNegativeButton("取消", (d, which) -> cancel()));
        }
        if (checking) return;
        checking = true;
        run(this::queryUpdates, outcome -> {
            checking = false;
            String label = outcome.apk != null ? outcome.apk.version : (outcome.web != null ? "在线新版" : "");
            preferences.edit().putLong("next-check", System.currentTimeMillis() + CHECK_INTERVAL_MS)
                    .putString("available", label).apply();
            publishVersion();
            if (!manualCheck) return;
            manualCheck = false;
            dismiss();
            showWhenVisible(() -> {
                if (outcome.apk != null) {
                    ReleaseSource.Release release = outcome.apk;
                    String message = "当前 " + version + "  →  " + release.version + "    " + fileSize(release.size);
                    if (!release.notes.isEmpty()) message += "\n\n" + release.notes;
                    show(new AlertDialog.Builder(activity).setTitle("发现新版本 " + release.version)
                            .setMessage(message).setNegativeButton("稍后", null)
                            .setPositiveButton("立即更新", (d, which) -> prepare(release)));
                } else if (outcome.web != null) {
                    ReleaseSource.WebUpdate web = outcome.web;
                    String message = "发现线上新内容（" + web.shortSha + "），无需重装 APK 即可直接在线热更新。";
                    if (!web.message.isEmpty()) message += "\n\n" + web.message;
                    show(new AlertDialog.Builder(activity).setTitle("发现线上热更新")
                            .setMessage(message).setNegativeButton("稍后", null)
                            .setPositiveButton("立即在线更新", (d, which) -> prepareWeb(web)));
                } else {
                    String sha = currentWebSha();
                    String tail = sha.length() >= 7 ? "（资源 " + sha.substring(0, 7) + "）" : "";
                    show(new AlertDialog.Builder(activity).setTitle("已是最新版本")
                            .setMessage("北环竞速 " + version + tail + "\n已开启 APK 与线上资源双通道在线更新。")
                            .setNeutralButton("同步线上资源", (d, which) -> syncLatestWeb())
                            .setPositiveButton("完成", null));
                }
            });
        }, e -> {
            checking = false;
            preferences.edit().putLong("next-check", System.currentTimeMillis() + RETRY_INTERVAL_MS).apply();
            if (!manualCheck) return;
            manualCheck = false;
            dismiss();
            showWhenVisible(() -> error("暂时查不到新版本", e, () -> check(true)));
        });
    }

    private void syncLatestWeb() {
        show(new AlertDialog.Builder(activity).setTitle("同步线上资源")
                .setMessage("正在连接 GitHub 获取最新版本…").setOnCancelListener(ignored -> cancel())
                .setNegativeButton("取消", (d, which) -> cancel()));
        run(() -> ReleaseSource.checkWeb(null), web -> {
            dismiss();
            if (web == null) {
                show(new AlertDialog.Builder(activity).setTitle("同步失败")
                        .setMessage("未获取到线上版本信息，请稍后再试。").setPositiveButton("知道了", null));
            } else {
                prepareWeb(web);
            }
        }, e -> {
            dismiss();
            showWhenVisible(() -> error("无法连接线上服务", e, this::syncLatestWeb));
        });
    }

    private void prepareWeb(ReleaseSource.WebUpdate web) {
        ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        show(new AlertDialog.Builder(activity).setTitle("在线更新资源 " + web.shortSha)
                .setMessage("正在下载最新游戏资源…").setView(progress)
                .setOnCancelListener(ignored -> cancel())
                .setNegativeButton("取消", (d, which) -> cancel()));
        final int[] shown = {-1};
        final int token = generation + 1;
        run(() -> ReleaseSource.downloadWeb(app, web, (received, total) -> {
            int percent = total > 0 ? (int) Math.min(100, 100L * received / total) : 0;
            if (percent == shown[0]) return;
            shown[0] = percent;
            activity.runOnUiThread(() -> {
                if (token == generation && !destroyed) {
                    progress.setProgress(percent);
                    if (dialog != null) dialog.setMessage(percent < 100
                            ? "已下载 " + percent + "%  ·  " + fileSize(received) : "正在校验并应用资源…");
                }
            });
        }), file -> {
            dismiss();
            preferences.edit()
                    .putString("web-sha", web.sha)
                    .putString("web-app-version", version)
                    .putString("available", "")
                    .apply();
            publishVersion();
            game.loadUrl(RaceActivity.GAME);
            showWhenVisible(() -> show(new AlertDialog.Builder(activity).setTitle("在线更新完成")
                    .setMessage("已成功更新到最新线上版本（" + web.shortSha + "），原有车型与成绩均已保留。")
                    .setPositiveButton("开始游戏", null)));
        }, e -> {
            dismiss();
            showWhenVisible(() -> error("在线更新未完成", e, () -> prepareWeb(web)));
        });
    }

    private static String fileSize(long size) {
        return String.format(Locale.ROOT, "%.1f MB", size / 1_000_000.0);
    }

    private void prepare(ReleaseSource.Release release) {
        ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        show(new AlertDialog.Builder(activity).setTitle("准备更新 " + release.version)
                .setMessage("正在下载并校验安装包…").setView(progress)
                .setOnCancelListener(ignored -> cancel())
                .setNegativeButton("取消", (d, which) -> cancel()));
        final int[] shown = {-1};
        final int token = generation + 1;
        run(() -> ReleaseSource.download(app, release, (received, total) -> {
            int percent = total > 0 ? (int) Math.min(100, 100L * received / total) : 0;
            if (percent == shown[0]) return;
            shown[0] = percent;
            activity.runOnUiThread(() -> {
                if (token == generation && !destroyed) {
                    progress.setProgress(percent);
                    if (dialog != null) dialog.setMessage(percent < 100
                            ? "已下载 " + percent + "%  ·  " + fileSize(total) : "正在校验安装包…");
                }
            });
        }), file -> {
            dismiss();
            if (!foreground) {
                onReturn = () -> prepare(release);
            } else if (app.getPackageManager().canRequestPackageInstalls()) {
                install(release, file);
            } else {
                permissionDialog(release);
            }
        }, e -> {
            dismiss();
            showWhenVisible(() -> error("更新未完成", e, () -> prepare(release)));
        });
    }

    private void permissionDialog(ReleaseSource.Release release) {
        show(new AlertDialog.Builder(activity).setTitle("允许安装游戏更新")
                .setMessage("在系统设置中开启「允许来自此来源的应用」，返回游戏后即可继续安装。")
                .setNegativeButton("稍后", null).setPositiveButton("去设置", (d, which) -> {
                    waitingForPermission = release;
                    try {
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + app.getPackageName())));
                    } catch (ActivityNotFoundException | SecurityException e) {
                        waitingForPermission = null;
                        show(new AlertDialog.Builder(activity).setTitle("打开系统设置")
                                .setMessage("请在系统设置的「安装未知应用」中找到北环竞速，允许安装后，再点「检查更新」。")
                                .setPositiveButton("知道了", null));
                    }
                }));
    }

    private void install(ReleaseSource.Release release, File file) {
        Uri uri = UpdateFileProvider.uriFor(app, file);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, UpdateFileProvider.MIME);
        intent.setClipData(ClipData.newRawUri("游戏更新", uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException e) {
            error("无法打开系统安装器", e, () -> prepare(release));
        }
    }

    private void error(String title, Exception cause, Runnable retry) {
        String detail = cause instanceof java.io.IOException ? cause.getLocalizedMessage() : null;
        if (cause instanceof java.net.SocketException || cause instanceof java.net.UnknownHostException ||
                cause instanceof java.net.SocketTimeoutException || cause instanceof javax.net.ssl.SSLException) {
            detail = "暂时连接不上更新服务，请检查网络后再试。";
        }
        show(new AlertDialog.Builder(activity).setTitle(title)
                .setMessage(detail == null ? "请稍后再试。" : detail)
                .setNegativeButton("返回游戏", null).setPositiveButton("重试", (d, which) -> retry.run()));
    }
}
