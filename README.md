# 北环竞速 · 小米 SU7 Max

[打开游戏](https://cy642.github.io/su7-max-nordschleife/)

[下载安卓横屏版 APK](https://github.com/cy642/su7-max-nordschleife/releases/download/android-v1.0.0/Nordrun-SU7-Max-1.0.0.apk)

驾驶海湾蓝 SU7 Max，与五辆 AI 赛车跑 3.2 公里冲刺或 20.832 公里北环全圈。方向键或 WASD 驾驶，R 手动升降尾翼，C 切换四种视角，P 暂停。手机支持方向和踏板同时按压。暂停菜单可以开启「流畅优先」。

下载 `index.html` 后可在支持 WebGL 的浏览器中离线打开。页面内嵌车模、线路和场景纹理。

安卓安装包也可离线游玩，支持 Android 9 及以上、OpenGL ES 3.0 和支持 WebGL 2 的系统 WebView。横向握持手机，用左手转向、右手控制踏板。轻点右上角切换尾翼或视角，切到后台会暂停。

## 本地构建

```sh
npm ci
npm run build
node --test tests/contact.test.mjs
```

发布文件是根目录的 `index.html`。车模、环境和线路数据的来源见[素材署名](CREDITS.md)。

构建安卓包需 JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0。设置 `JAVA_HOME`、`ANDROID_HOME`、`NORDRUN_KEYSTORE` 和 `NORDRUN_KEY_PASSWORD`，使用别名为 `nordrun` 的签名密钥，在网页构建完成后执行 `python android/build.py Nordrun.apk`。
