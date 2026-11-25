# Chrome ウェブストア掲載用の素材

このフォルダの画像は、ダミーデータを入れた実際の拡張機能の画面から自動生成しています。実在のアカウントやサイトの内容は含みません。

| ファイル | 用途 | サイズ |
| --- | --- | --- |
| `en/screenshot-*.jpg`、`ja/screenshot-*.jpg` | スクリーンショット（言語ごとに 5 枚） | 1280×800 |
| `promo-small.jpg` | プロモーション タイル（小） | 440×280 |
| `promo-marquee.jpg` | マーキー プロモーション タイル | 1400×560 |
| `arcish-promo.jpg` | 動画のサムネイル | 1920×1080 |
| `arcish-promo.mp4` | 紹介動画（30 秒）。容量が大きいのでリポジトリには入れていない | 1920×1080、60fps |

ストアのアイコン（128×128）は拡張機能本体の `icons/icon128.png` が使われます。動画はストアに直接は置けないので、YouTube に上げてその URL を掲載情報に入れます。

## 作り直す

```sh
npm run store:images   # スクリーンショットとプロモーション タイル
npm run store:film     # 紹介動画（ffmpeg が必要。数分かかる）
```

- 画面の中身（サンプルサイト、Space、フォルダなど）は `scripts/store/demo.mjs`
- 画像の文言とレイアウトは `scripts/store-assets.mjs` と `scripts/store/compose.html`
- Chrome のタブストリップ、ツールバー、サイドパネルの見出しは `scripts/store/chrome-frame.js` と `chrome-frame.css`。タブの並びは撮影時の実際のウィンドウから取っている
- 動画の構成とタイミングは `scripts/store/film.html`、効果音は `scripts/store/sound.mjs`

効果音は素材集を使わず、波形から合成しています。手持ちの音源に差し替える場合は、動画と同じ長さの WAV を用意して `scripts/store-film.mjs` の合成結果と入れ替えます。

## 掲載文

### 概要（132 文字以内。`_locales` の `extDescription` と同じ）

- 英語: Spaces, Favorites, pinned tabs, Live Folders, Little Window, Split View and a command bar. Assists Chrome instead of replacing it.
- 日本語: Space・Favorites・ピン留め・Live Folder・Little Window・スプリットビュー・コマンドバー。Chrome を置き換えずに補助します。

### 詳細な説明（英語）

```
Arcish adds an Arc-style sidebar to Chrome's side panel.

• Favorites and pins — a pin stays when you close its tab and reopens with one click.
• Spaces — a set of tabs for each part of your day, each with its own colour. Swipe to switch.
• Live Folders — pull requests, issues and feeds that refresh on their own, with build status.
• Command bar — jump to tabs, pins, bookmarks and history, or run an action from the keyboard.
• Library — archived tabs, downloads, Spaces and Boosts in one searchable place.
• Split View and Little Window — two pages side by side, or a small window for a quick look.
• Boosts — your own CSS for a site, and Zap to hide elements you do not want to see.

Arcish assists Chrome; it does not take it over. Anything that changes how Chrome itself behaves (closing unused tabs, mirroring Spaces as tab groups, overriding changes made in the tab strip) is off until you turn it on.

Your data stays on your device. Nothing is sent anywhere except the requests you set up yourself in a Live Folder (for example to GitHub or to a feed).
```

### 詳細な説明（日本語）

```
Arcish は、Chrome のサイドパネルに Arc 風のサイドバーを追加します。

・Favorites とピン留め — タブを閉じてもピンは残り、ワンクリックで開き直せます。
・Space — 用途ごとのタブのまとまり。それぞれに色を付けられ、スワイプで切り替わります。
・Live Folder — プルリクエスト、Issue、フィードを自動で更新し、ビルドの状態も表示します。
・コマンドバー — タブ、ピン留め、ブックマーク、履歴への移動や操作の実行をキーボードから。
・ライブラリ — アーカイブしたタブ、ダウンロード、Space、Boost をまとめて検索できます。
・スプリットビューと Little Window — 2 つのページを並べて表示、または小さなウィンドウで確認。
・Boost — サイトごとの独自 CSS と、見たくない要素を消す Zap。

Arcish は Chrome を補助するもので、乗っ取りません。Chrome 本来の動作を変える機能（使っていないタブを閉じる、Space をタブグループとして表示する、タブストリップでの操作を上書きする）は、オンにするまで働きません。

データは端末の中に保存されます。Live Folder で自分で設定した取得先（GitHub やフィードなど）へのリクエスト以外、外部には何も送信しません。
```

## 権限の用途（審査の入力欄用）

| 権限 | 用途 |
| --- | --- |
| `tabs`、`tabGroups` | サイドバーにタブを一覧表示し、切り替え・並べ替え・Space への振り分けを行う |
| `sidePanel` | サイドバーをサイドパネルに表示する |
| `storage`、`unlimitedStorage` | Space、Favorites、ピン留め、アーカイブ、設定を端末内に保存する |
| `alarms` | Live Folder の定期更新と、設定時の自動アーカイブ |
| `contextMenus` | 右クリックメニューに「Little Window で開く」などを追加する |
| `scripting` | 再生中のタブの再生／一時停止をサイドバーから操作する |
| `favicon` | タブやピン留めのアイコンを表示する |
| `history`、`bookmarks` | コマンドバーで履歴とブックマークを検索する |
| `downloads`、`downloads.open` | ライブラリにダウンロード一覧を表示し、ファイルを開く |
| `system.display` | Little Window を画面内に収まる位置へ出す |
| `clipboardWrite` | 現在の URL をコピーする |
| ホスト権限（すべてのサイト） | ページ上へのコマンドバー表示、Boost（独自 CSS）の適用、Live Folder でのフィード取得 |
