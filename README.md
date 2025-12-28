# RushRunner (Local Dev)

## 起動方法

`stations.json` を `fetch` で読み込むため、ローカルサーバが必要です。

### 1) Node の `http-server` を使う
```powershell
npx http-server -p 5173 -c-1
start http://localhost:5173/
```

### 2) `serve` を使う
```powershell
npx serve -l 5173
start http://localhost:5173/
```

### 3) 同梱のサーバを使う
```powershell
npm start
start http://localhost:5173/
```

## ODPT API設定

全国の駅検索と時刻表取得に公共交通オープンデータセンター (ODPT) APIを使用します。

1. [ODPT APIキー取得](https://developer.odpt.org/) から無料でAPIキーを取得。
2. `script.js` の `ODPT_API_KEY` にキーを設定:
   ```javascript
   const ODPT_API_KEY = 'あなたのAPIキー';
   ```

## よくある症状と対処
- 画面が真っ白: `index.html` が壊れていないか確認。開発者ツールの Console エラーを確認。
- 時刻表が出ない: ローカルサーバで開いているか確認。`stations.json` のパスと中身を確認。
- 駆け込みアラートが出ない: 位置情報の許可を与えるか、画面右下の試験用ボタンで動作確認。
- APIが動かない: APIキーが正しく設定されているか確認。ネットワーク接続を確認。
