# SHIZUKU — しずく

自然の葉に並ぶ雫をなぞり、和音と旋律をつくるブラウザ作品。

## 公開作品

[しずくを開く](https://shizuku-trace-1025.greenhaven20.chatgpt.site/?sound=media)

## 操作

- 「触れて、はじめる」で音を開始します。
- 葉の雫をマウスで押しながら、または指でなぞります。雫ごとに4音の柔らかな和音が鳴ります。
- 指を離すと、辿った順番をもとに拍を整えた旋律と伴奏が流れ、最後に短い終止フレーズが続きます。
- 「葉 / 点」で表示を切り替え、「もう一度聴く」で曲を再生できます。
- キーボードでは演奏面を選び、矢印で雫を選択、Spaceで演奏、Enterで旋律を再生します。
- 音が聞こえない場合は「音が聞こえないとき」から標準の音声プレイヤーも使えます。

## ローカルで開く

ビルドや依存ライブラリのインストールは不要です。WORKSのルートでサーバーを起動し、次のURLを開きます。

```sh
python3 -m http.server 8000
```

http://localhost:8000/SHIZUKU/?sound=media

Safariでは通常の音声ファイルを使う方式を自動選択します。`?sound=media` を付けると、ほかのブラウザでも同じ方式を使えます。

## 構成

```text
WORKS/
├── YOBANA/
└── SHIZUKU/
    ├── index.html
    ├── style.css
    ├── app.js
    ├── music.js
    ├── media-audio.js
    └── assets/
        ├── leaf.png
        └── confirmation.wav
```

Canvas 2Dで写真内の雫と反応位置を合わせ、波紋と雫同士をつなぐ流れを描画します。音楽のコード進行・和音・終止フレーズは `music.js`、Safari向けのPCM音声生成と再生は `media-audio.js` にあります。写真風の葉の画像は、この作品用にAI生成したものです。

Sitesの管理設定・認証情報・入れ子のGitリポジトリは含みません。GitHub Pagesの既存のYOBANA公開設定は変更していません。
