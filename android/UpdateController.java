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
import java.util.Locale;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import org.json.JSONException;
import org.json.JSONObject;

final class UpdateController {
    private static final int INSTALL_REQUEST = 8102;
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
    // Saved only while Android settings owns the foreground.
    private ReleaseSource.Release waitingForPermission;

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
            preferences.edit().clear().putString("installed", version).apply();
        }
        if (state != null && version.equals(state.getString("update-installed")) && state.containsKey("update-permission")) {
            try {
                waitingForPermission = ReleaseSource.Release.fromJson(new JSONObject(state.getString("update-permission")));
            } catch (Exception ignored) { /* A new manual check can always start from scratch. */ }
        }
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

    private void check(boolean manual) {
        if (manual) {
            manualCheck = true;
            show(new AlertDialog.Builder(activity).setTitle("检查更新")
                    .setMessage("正在查询新版本…").setOnCancelListener(ignored -> cancel())
                    .setNegativeButton("取消", (d, which) -> cancel()));
        }
        if (checking) return;
        checking = true;
        run(() -> ReleaseSource.check(app), release -> {
            checking = false;
            preferences.edit().putLong("next-check", System.currentTimeMillis() + CHECK_INTERVAL_MS)
                    .putString("available", release == null ? "" : release.version).apply();
            publishVersion();
            if (!manualCheck) return;
            manualCheck = false;
            dismiss();
            showWhenVisible(() -> {
                if (release == null) {
                    show(new AlertDialog.Builder(activity).setTitle("已是最新版本")
                            .setMessage("北环竞速 " + version).setPositiveButton("完成", null));
                } else {
                    String message = "当前 " + version + "  →  " + release.version + "    " + fileSize(release.size);
                    if (!release.notes.isEmpty()) message += "\n\n" + release.notes;
                    show(new AlertDialog.Builder(activity).setTitle("发现新版本 " + release.version)
                            .setMessage(message).setNegativeButton("稍后", null)
                            .setPositiveButton("立即更新", (d, which) -> prepare(release)));
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
                // Android may evict the staged file while the game is in the background.
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
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE, uri);
        intent.setClipData(ClipData.newRawUri("游戏更新", uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.putExtra(Intent.EXTRA_RETURN_RESULT, true);
        try {
            activity.startActivityForResult(intent, INSTALL_REQUEST);
        } catch (ActivityNotFoundException | SecurityException e) {
            error("无法打开系统安装器", e, () -> prepare(release));
        }
    }

    void activityResult(int request, int result) {
        if (request == INSTALL_REQUEST && result == Activity.RESULT_FIRST_USER) {
            showWhenVisible(() -> error("系统安装失败",
                    new Exception("请确认设备有足够空间后重试。"), () -> check(true)));
        }
    }

    private void error(String title, Exception cause, Runnable retry) {
        String detail = cause instanceof java.io.IOException || cause.getClass() == Exception.class
                ? cause.getLocalizedMessage() : null;
        if (cause instanceof java.net.SocketException || cause instanceof java.net.UnknownHostException ||
                cause instanceof java.net.SocketTimeoutException || cause instanceof javax.net.ssl.SSLException) {
            detail = "暂时连接不上更新服务，请检查网络后再试。";
        }
        show(new AlertDialog.Builder(activity).setTitle(title)
                .setMessage(detail == null ? "请稍后再试。" : detail)
                .setNegativeButton("返回游戏", null).setPositiveButton("重试", (d, which) -> retry.run()));
    }
}
