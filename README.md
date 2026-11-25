# 北环竞速 · 小米 SU7 Max

[打开游戏](https://cy642.github.io/su7-max-nordschleife/)

[下载安卓横屏版 APK](https://github.com/cy642/su7-max-nordschleife/releases/download/android-v1.1.1/Nordrun-SU7-Max-1.1.1.apk)

在车库选玩法，再选赛程或练习路段。

| 玩法 | 怎么玩 |
| --- | --- |
| 六车竞速 | 和五辆对手跑 3.2 公里冲刺或 20.832 公里全圈。入门、运动和专家三档会改变对手的加速、刹车、过弯速度和直道极速。 |
| 个人计时 | 独自在短程或全圈挑战个人最佳。途中显示与个人最佳的累计用时差，终点可查看三段各自的成绩。 |
| 弯道练习 | 直接从卡鲁塞尔、植物园或通往终点的长直道路段发车，每段单独保存最佳用时，可以冲线后立即重试。 |

**驾驶操作**　W / ↑ 加速，S / ↓ 刹车，停稳后继续按住 S / ↓ 即可倒车。A、D 或左右方向键转向，空格拉手刹，引擎盖和驾驶席视角挂入 R 挡时会显示倒车影像，C 切换四种视角，R 手动升降尾翼，Esc 或 P 暂停。手机左手按住或滑动方向条，靠近中心微调、靠近两端打满、松开回正。右手同时控制踏板，停稳后继续按住「刹车」即可倒车。遇到明显弯道，前方提示会显示方向和距离。车库和暂停菜单可选流畅、均衡或高清画质，选择会自动保存。

下载 `index.html` 后可在支持 WebGL 的浏览器中离线打开。页面内嵌车模、线路和场景纹理。

安卓安装包也可离线游玩，支持 Android 9 及以上、OpenGL ES 3.0 和支持 WebGL 2 的系统 WebView。横向握持手机，用左手转向、右手控制踏板。轻点右上角切换尾翼或视角，切到后台会暂停。

## 本地构建

```sh
npm ci
npm run build
node --test
```

发布文件是根目录的 `index.html`。车模、环境和线路数据的来源见[素材署名](CREDITS.md)。

构建安卓包需 JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0。设置 `JAVA_HOME`、`ANDROID_HOME`、`NORDRUN_KEYSTORE` 和 `NORDRUN_KEY_PASSWORD`，使用别名为 `nordrun` 的签名密钥，在网页构建完成后执行 `python android/build.py Nordrun.apk`。
