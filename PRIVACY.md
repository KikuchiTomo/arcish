# Privacy Policy / プライバシーポリシー

Last updated / 最終更新: 2026-11-26

## English

Arcish is a Chrome extension that manages tabs from a sidebar. It has no server, no account and no analytics. The developer receives no data from it.

### What Arcish handles

All of the following stays on your device, in the extension's local storage in your browser profile:

- The titles, addresses and icons of your open tabs, to show them in the sidebar.
- What you build in the sidebar: Spaces, favorites, pins, folders, Boosts (your CSS and the elements you hid) and settings.
- The archive of tabs you closed (title, address, time).
- Entries fetched for your Live Folders.
- A GitHub token, only if you enter one for Live Folders.

When you type in the command bar, Arcish searches your open tabs, bookmarks and browsing history to show matches. It does not copy your history or bookmarks into its own storage.

### What leaves your device

Only the requests you set up in a Live Folder:

- GitHub Live Folders call `api.github.com`. If you entered a token, it is sent to GitHub with those requests and to nobody else.
- Hacker News Live Folders call `hn.algolia.com`.
- Feed Live Folders fetch the feed address you entered.

Those services receive what any request to them carries, such as your IP address, and handle it under their own policies. Searching the web from the command bar opens the search engine you chose in a tab, exactly as typing in Chrome's address bar does.

Arcish does not sell or share data, does not use it for advertising, and does not read the content of the pages you visit.

### Removing your data

The archive can be emptied from the Library, and Settings → Data exports your Spaces, favorites, pins, settings and Boosts to a file. Removing the extension deletes all of its data.

### Changes and contact

Changes to this policy are published in this file. Questions: https://github.com/KikuchiTomo/arcish/issues

## 日本語

Arcish は、サイドバーからタブを管理する Chrome 拡張機能です。サーバーもアカウントも解析もありません。開発者がこの拡張機能からデータを受け取ることはありません。

### Arcish が扱うもの

以下はすべて、お使いのブラウザのプロファイルにある拡張機能のローカル保存領域に置かれ、端末の外には出ません。

- 開いているタブのタイトル、アドレス、アイコン（サイドバーに表示するため）
- サイドバーで作ったもの: Space、Favorites、ピン留め、フォルダ、Boost（書いた CSS と非表示にした要素）、設定
- 閉じたタブのアーカイブ（タイトル、アドレス、時刻）
- Live Folder 用に取得した項目
- GitHub のトークン（Live Folder 用に入力した場合のみ）

コマンドバーに入力すると、開いているタブ、ブックマーク、閲覧履歴を検索して候補を表示します。履歴やブックマークを拡張機能の保存領域に写すことはありません。

### 端末の外に出るもの

Live Folder で設定した取得先への通信だけです。

- GitHub の Live Folder は `api.github.com` に問い合わせます。トークンを入力している場合、その通信とともに GitHub にだけ送信します。
- Hacker News の Live Folder は `hn.algolia.com` に問い合わせます。
- フィードの Live Folder は、入力したフィードのアドレスから取得します。

これらのサービスは、IP アドレスなど通信に伴う情報を受け取り、それぞれのポリシーに従って扱います。コマンドバーからのウェブ検索は、選んだ検索エンジンをタブで開くもので、Chrome のアドレスバーに入力した場合と同じです。

Arcish はデータを販売・共有せず、広告にも使いません。閲覧しているページの内容も読み取りません。

### データの削除

アーカイブはライブラリから空にできます。「設定 → データ」では、Space、Favorites、ピン留め、設定、Boost をファイルに書き出せます。拡張機能を削除すると、そのデータはすべて消えます。

### 変更と連絡先

このポリシーを変更した場合は、このファイルで公開します。問い合わせ: https://github.com/KikuchiTomo/arcish/issues
