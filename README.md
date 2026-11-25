# Arcish

Arc ブラウザの使い勝手を Chrome に足す拡張機能です。Chrome を置き換えるものではなく、サイドパネルに常駐する補助ツールとして動きます。

## 入れ方

1. `chrome://extensions` を開き、右上の「デベロッパー モード」をオンにする
2. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選ぶ
3. ツールバーのアイコン、または `Alt+S` でサイドバーを開く

ビルドは不要です。ショートカットは `chrome://extensions/shortcuts` で変更できます。

## できること

| 機能 | 内容 |
| --- | --- |
| Favorites | どの Space でも上部に並ぶお気に入り。開くと Chrome のピン留めタブになる |
| Pinned | Space ごとのピン留め。フォルダで整理できる。タブを閉じてもピンは残り、クリックで開き直す。別のページへ移動したピンは元の URL に戻せる |
| Live Folder | 中身が自動で更新されるフォルダ。フォルダの中にも作れる。GitHub の PR / Issue / 検索、RSS / Atom、Hacker News に対応。新着には未読マークが付く。GitHub トークンを登録すると PR の CI 状態（成功・失敗・実行中）も表示する |
| Space | 用途別のタブのまとまり。Space ごとに色（パレットか好きな色）とアイコンを設定できる。サイドバーを横にスワイプすると指の動きに合わせて隣の Space が出てくる |
| フォルダ | ピン留めをまとめる。アイコンに付ける印（組み込みのアイコン、または絵文字）を変えられる |
| Today | ピン留めしていない通常のタブ。まとめてアーカイブできる |
| ライブラリ | アーカイブしたタブ、ダウンロード、Space、Boost をまとめて見る画面。検索でき、日付ごとに並ぶ |
| Little Window | 調べもの用の小さなウィンドウ。メインウィンドウへ送れる |
| スプリットビュー | 2 つのタブを 1 つのウィンドウ内に並べる（Chrome 本体の分割表示を使う） |
| コマンドバー | タブ、ピン、ブックマーク、履歴、操作をまとめて検索する |
| Boost / Zap | サイトごとの CSS と、要素を消す機能 |
| Air Traffic Control | URL に応じて新しいタブを Space に振り分ける |

ドラッグ＆ドロップで、タブを Favorites やピンにしたり、ピンをフォルダや別の Space へ移したりできます。

## Chrome との付き合い方

Chrome 本来の動作を変える機能は、設定でオンにするまで働きません。

- **タブストリップには触らない**（初期設定）。Space の所属は拡張機能の中だけで管理する。設定で「タブグループと連動」を選ぶと、Space を Chrome のタブグループとして表示し、非アクティブな Space を折りたたむ
- **自分で作ったタブグループは変更しない**
- **Chrome 側の操作が優先**（初期設定）。Chrome のタブストリップでピン留めやグループ移動をすると Arcish がそれに合わせる。設定の「Arcish タブ優先モード」で、固定タブ（Favorites とピン留めのタブ）だけ、またはすべてのタブについて、Arcish 側の状態へ戻すようにできる
- **自動アーカイブはオフ**。オンにしても、ピン留め・再生中・アクティブなタブは閉じない
- **Shift+クリックの Peek はオフ**。オンにしても、Shift+クリックを自前で処理するページには干渉しない
- **新しいタブページは上書きしない**
- **ページのキー入力は奪わない**。ショートカットは Chrome の拡張機能ショートカットとして登録する
- **ページには必要になるまで何も挿入しない**。挿入する UI は Shadow DOM に隔離する
- スプリットビューは Chrome 本体の分割表示、Little Window は本物のウィンドウなので、iframe を拒否するサイトでもそのまま動く
- コマンドバーは、サイドバーから開いたときはサイドバーの中に、ショートカットで開いたときはページ上に重ねて表示する。重ねられないページ（`chrome://`、ウェブストアなど）では小さなウィンドウで開く

## 制約

- Chrome のタブストリップ自体を隠すことはできない
- スプリットビューには `tabs.createSplit` を持つ新しい Chrome が必要（Chrome 158 で確認）。並べられるのは 2 つまで
- サイドパネル上部の帯（拡張機能名と ✕）と、パネルの最小幅は Chrome が決めていて変えられない
- Little Window からメインウィンドウへ送るとページを開き直す（Chrome はポップアップのタブを通常ウィンドウへ移動できないため）

## 開発

```sh
npm install        # テスト用の jsdom だけ
npm run check      # 構文、import、翻訳キー、manifest の整合
npm test           # サービス層と UI のテスト
npm run smoke      # 使い捨ての Chrome に読み込んで動作確認
npm run package    # 配布用の dist/arcish-<version>.zip を作る
npm run icons      # アイコンを再生成
```

### 公開の手順

1. `manifest.json` の `version` を上げてコミットする
2. 同じ番号のタグを付けて push する（例: `git tag v0.1.0 && git push origin v0.1.0`）
3. GitHub Actions がチェックとテストを通したうえで zip を作り、GitHub のリリースに添付する
4. Chrome ウェブストアに出す場合は、その zip をデベロッパー ダッシュボードにアップロードする

zip に入るのは `manifest.json`、`_locales/`、`icons/`、`src/` だけで、テストやスクリプトは含まれない。

### 構成

```
_locales/<code>/messages.json   UI の文言
src/config/                     既定値、上限、タイミング、色、フォルダの印、検索エンジン、対応言語
src/shared/                     全コンテキスト共通（プロトコル、i18n、URL、ツリー、DOM 差分）
src/background/
  container.js                  サービスの組み立て（依存はすべてコンストラクタで渡す）
  core/                         ストア、ルーター、排他制御、バインディング
  services/                     Space、アイテム、Live Folder、アーカイブ、スプリット など
  services/membership/          Space とタブの対応付け（サイドバーのみ / タブグループ）
  wiring/                       ブラウザイベント、メッセージ、ショートカット、右クリックメニュー
src/live-sources/               Live Folder のソース
src/sidebar/                    モデル → 描画 → DOM 差分。操作はコントローラー、動きは motion.js / swipe.js に集約
src/palette/                    コマンドバー（検索プロバイダー、アクション、表示先）
src/content/                    ページ側の機能（Boost、Peek、Zap、コマンドバーの枠）
src/options/                    設定画面
```

状態を書き換えるのは Service Worker だけです。UI とコンテンツスクリプトは `src/shared/protocol.js` のメッセージで依頼し、変更は `chrome.storage` の通知で受け取ります。

### 拡張のしかた

| 追加したいもの | やること |
| --- | --- |
| 言語 | `_locales/en/messages.json` を `_locales/<code>/` にコピーして訳し、`src/config/locales.js` に 1 行足す |
| Live Folder のソース | `src/live-sources/` にモジュールを作り、`index.js` の一覧に足す。入力欄は `fields` の定義から自動で作られる |
| コマンドバーの操作 | `src/palette/actions.js` に 1 項目足す |
| コマンドバーの検索対象 | `src/palette/providers.js` にプロバイダーを足す |
| 設定項目 | `src/config/defaults.js` に既定値、`src/options/options.js` のスキーマに 1 行 |
| Space の色のプリセット | `src/config/colors.js` に 1 項目 |
| ライブラリの区画 | `src/sidebar/library.js` に 1 項目 |
| フォルダに付けられる印 | `src/config/folder-icons.js` に名前を足す |
| ページ側の機能 | `src/content/features/` にファイルを作り、`manifest.json` の `content_scripts` に足す |
