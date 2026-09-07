# main.ts ESM Module Refactor Design

## Goal

`src/main.ts` に集中しているVRMA Converterの処理を、責務ごとの内部ESMモジュールへ分割し、変換処理とUI/Three.js処理の境界を明確にする。外部向けのライブラリAPIは追加せず、既存のブラウザ上の挙動と現在の未コミット変更を維持する。

## Scope and non-goals

- `package.json` の既存の `"type": "module"` を前提に、アプリ内部のimport/exportを整理する。
- Mixamo、Universal rig、BVH、VRMAの入力処理を独立した変換モジュールへ移す。
- VRMA出力、トラック操作、プレビューアニメーション、タイムライン、スクロールバー、Three.jsステージをそれぞれの責務へ分ける。
- `main.ts` はアプリ状態、イベント配線、モジュール間の接続を主な責務とする。
- npmパッケージとして利用する公開エントリポイント、外部API、依存ライブラリの追加は行わない。
- UIデザイン、対応フォーマット、リターゲット結果、MMDの挙動は変更しない。

## Design

### Module layout

```text
src/
├── main.ts                         # 起動、アプリ状態、イベント配線
├── animation/
│   ├── types.ts                    # 共有のアニメーション型
│   ├── trackUtils.ts               # トラック生成、複製、ベイク、速度変更
│   ├── rigMapping.ts               # humanoid一覧、名前対応、リグ判定
│   ├── mixamoParser.ts              # Mixamo FBX/GLBトラックのリターゲット
│   ├── universalParser.ts           # Universal humanoid rigのリターゲット
│   ├── bvhParser.ts                 # BVH / Daz-friendly BVHのリターゲット
│   ├── genericParser.ts             # 名前から推測する汎用トラック処理
│   ├── vrmaParser.ts                # VRMA入力から内部トラックへの変換
│   ├── parseAnimationFile.ts        # 拡張子ごとのローダー振り分け
│   └── previewAnimation.ts          # 起動時のデモアニメーション
├── vrma/
│   └── exportVrma.ts                # 内部トラックからVRMA Blobを生成
├── viewer/
│   └── stage.ts                     # Scene、Renderer、Camera、VRMロード、ステージ
└── ui/
    ├── dom.ts                       # DOM要素の型付き参照
    ├── scrollbars.ts                # 常時表示スクロールバー
    └── timeline.ts                  # タイムライン描画とプレイヘッド表示
```

### Dependency direction

```text
main.ts
 ├── animation/parseAnimationFile.ts
 │    ├── *Parser.ts
 │    ├── rigMapping.ts
 │    └── trackUtils.ts
 ├── vrma/exportVrma.ts
 ├── viewer/stage.ts
 └── ui/{dom,scrollbars,timeline}.ts
```

変換モジュールはDOM、Canvas、アプリの可変stateを参照しない。FBXのリグ選択だけは `parseAnimationFile` のコールバック引数で受け取り、ダイアログ実装を `main.ts` に残す。VRMA出力は `AnimationState`の表示状態ではなく、必要なアニメーショントラックだけを入力として扱う。

### Shared types and interfaces

`animation/types.ts` は次の型を提供する。

- `BoneName`: VRM humanoidの対応対象一覧
- `TrackPath` と `MotionTrackSet`
- `ExpressionTrackSet` と `BakeSettings`
- `LoadedClip`: 入力1クリップを内部表現へ変換した値
- `AnimationState`: クリップ一覧、ベイク/速度編集、表示に必要なアニメーション状態

`viewer/stage.ts` は、Three.jsの詳細を `main.ts` から隠す次の操作を提供する。

- `createStage(viewportDom)`: scene、renderer、camera、controlsを初期化
- VRM URLのロードと `ModelState` の生成
- モデルの差し替え、カメラフィット、ズーム、背景切り替え
- rendererのresize/render

`ModelState` は `viewer/stage.ts` がexportするviewer専用の型とし、`animation/types.ts`へviewerの依存を持ち込まない。

モデル差し替え後にアニメーションを再構築する責務は `main.ts` に残し、stageモジュールがアプリ状態へ逆方向に依存しないようにする。

`ui/timeline.ts` はDOMとアニメーション表示用の小さなstate accessorを受け取り、`render()`、`updatePlayhead()`、`centerOnPlayhead()`、ポインタ位置からの時間変換を提供する。タイムラインの内部計算とDOM生成は `main.ts` から移すが、再生・seekそのものは `main.ts` の状態更新として残す。

### Animation parsing

`rigMapping.ts` は以下を一元管理する。

- `HUMAN_BONES`
- Mixamo/Universal/汎用入力のボーン名マッピング
- `AnimationRigType`
- `detectAnimationRig()`
- トラック名から入力ボーン名を取り出す共通処理

`mixamoParser.ts` は `retargetMixamoClip(asset, clip, targetVrm)` を公開し、Mixamoのrest pose補正、Quaternion変換、hips translation、対応humanoidフィルタを担当する。Universal/BVHのロジックはそれぞれのパーサーへ置き、Mixamo固有の条件分岐を他のパーサーへ漏らさない。

`parseAnimationFile.ts` は既存のフォーマット別処理を保持するが、各パーサーを呼び出して `LoadedClip[]` を返すだけにする。VMDのMMD bake経路は既存の `src/mmd` モジュールに残し、通常のアニメーションファイル経路と混ぜない。

`vrma/exportVrma.ts` は `VrmaExportAnimation`（`displayName`、`restHipsY`、`tracks`、`expressionTracks`、`lookAtTrack`だけを含む型）を受け取り、アプリ全体のstateへ依存しない。

### ESM conventions

- production sourceの相対importは明示的な `.js` specifierを使う。
- 型だけの依存には `import type` を使う。
- CommonJSのrequire、default exportの追加、バレルを通じた不要な循環依存は作らない。
- 既存のNodeテストの `.ts` importと `--experimental-strip-types` は維持する。

## Behavior and error handling

- 対応フォーマット、エラーメッセージ、最新リクエストのみ採用する非同期競合制御は維持する。
- Mixamo/Universal/BVH/VRMAの変換結果は、分割前と同じ内部トラック、duration、source FPS、hipsの正規化情報を返す。
- FBXリグ選択のキャンセル、対応humanoidが0本の入力、アニメーションクリップのないファイルは現在と同じエラー経路でtoastへ渡す。
- 既存のMMD preview/baker、MMDの未コミット修正、タイムラインの未コミット修正には影響を与えない。
- すべての新規モジュールはブラウザでロードできる構成にし、NodeテストへDOMやWebGLを持ち込まない。

## Testing strategy

1. 既存のMMD、タイムラインのテストを実装前後で通し、リファクタリングによる回帰がないことを確認する。
2. `mixamoParser.ts` の純粋な変換結果を、合成したGroup/Bone/AnimationClipで検証する。少なくともMixamoの基本ボーン、Quaternionのrest pose補正、hips translation、対象VRMにないボーンの除外を確認する。
3. `trackUtils.ts` のベイク時刻、Quaternion連続性、トラック複製/速度変更を純粋なNodeテストで確認する。
4. `exportVrma.ts` は生成BlobのGLBヘッダー、JSON chunk、VRMC_vrm_animationのhumanBones、変換されたtrack数を検証する。
5. `npm test` と `npm run build` を実行し、TypeScriptの型チェック、ViteのESMバンドル、既存テストの全通過を確認する。
6. 実ブラウザで、デフォルトVRM表示、Mixamo読込、タイムライン操作、速度/ベイク、VRMAダウンロードを確認する。

## Acceptance criteria

- `main.ts` にMixamoのボーンマップ、パーサー本体、VRMA Blob生成、タイムライン描画、スクロールバー実装が残っていない。
- 新しい内部モジュールが明示的なESM import/exportで接続され、`npm run build` が成功する。
- Mixamoを含む既存の対応フォーマットが従来と同じUI結果になる。
- 既存の未コミット変更を上書き・破棄しない。
- テストとビルド結果を最終報告で示せる。
