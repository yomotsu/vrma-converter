# MMD VMD IK Bake to VRMA Design

## Goal

モーションソースへVMDをドロップしたとき、固定の`assets/mobuko.pmx`を使ってMMDのPMXアニメーションを再生しながらIK／Grant解決後の姿勢をFKのQuaternionトラックとして抽出し、既存のVRMA変換・モーションクリップ一覧・ダウンロード経路へ追加する。

## Scope

対象は、現在のVRMアバターを出力先とするVMDのhumanoid変換である。VMD再生に使うPMXは、右下プレビューと同じ`assets/mobuko.pmx`に固定する。VMDの表情、カメラ、物理演算はVRMA変換対象にせず、PMXのボーンIKとGrantを解決した回転、およびルート移動だけを扱う。

右下の256x256 overlayは開発時のデバッグ表示であり、通常のVRMA変換データから独立させる。将来prodビルドからoverlayを削除しても、VMDのベイクとVRMA生成が残るよう、プレビュー専用処理と変換処理の依存方向を分離する。

## Requirements

1. VMDドロップ時にPMXプレビューを右下overlayで再生する。
2. 同じVMDドロップを、VRMA変換可能な`AnimationState`として「モーションクリップ」一覧へ追加する。
3. ベイクは`MMDAnimationHelper`の`pmxAnimation: true`を使い、IKとGrantを適用した後の姿勢を採取する。
4. 採取結果はMMDの全PMXボーンについて保持し、VRMAへはhumanoidへ対応付けられるボーンだけを書き出す。
5. MMD標準の日本語・英語ボーン名をhumanoidへ対応付ける。センター系の複数ボーンはhipsへ適切に合成する。
6. 30fpsのVMDフレーム境界をサンプリングし、Quaternionの符号反転による補間フリップを除去する。
7. hipsの移動はPMXの基準hips位置を基準に抽出し、既存の`restHipsY`正規化を通してVRMAへ渡す。
8. VMDのMMDプレビューは既存どおりタイムライン、速度倍率、VRM側の再生状態から独立したreadonly表示にする。
9. 変換されたクリップは既存の一覧選択、タイムライン、VRMアバター再生、VRMAダウンロードへ接続する。出力ファイル名は元VMD名の拡張子を`.vrma`へ置き換える。
10. MMDの読み込みまたはベイクに失敗した場合、失敗したクリップは一覧へ追加しない。プレビューの読み込みが先に成功していれば、その表示は維持する。

## Non-goals

- VMDごとに任意のPMXを選択するUIを追加しない。
- MMDの物理演算をベイクしない。現在のプレビューと同じく`physics: false`で扱う。
- MMDのモーフやカメラをVRMAのexpression／lookAtへ変換しない。
- MMD用の独立したタイムラインや速度操作を追加しない。

## Architecture

### MMD source layer

`src/mmd/MMDMotionBaker.ts`を変換用モジュールとして追加する。PMXとVMDを`MMDLoader`で読み込み、専用の`MMDAnimationHelper`を作成して、30fpsの時系列でアニメーションを進める。各サンプル後に`mesh.skeleton.bones`のローカルposition／quaternionを読み取り、全PMXボーンのベイク結果を返す。ベイカーはrenderer、DOM、VRMに依存しない。

`src/mmd/MMDPlayer.ts`はデバッグ表示専用とする。既存のscene、camera、rendererを保持し、PMXとVMDの再生だけを担当する。変換経路は`MMDPlayer`の内部状態やoverlay canvasへ依存せず、将来preview importとcanvasをprodエントリから外せる境界にする。

`src/mmd/MMDHumanoidRetargeter.ts`を、ベイク済みMMDトラックから既存アプリのhumanoid向けトラックへ変換するモジュールとする。MMDの標準ボーン名辞書、左右の対応、センター系の合成、hips移動の抽出をここへ集約し、`main.ts`へMMD固有の判定を増やさない。

### Application layer

`src/main.ts`はVMD分岐で、MMD変換用の結果を既存の`LoadedClip`へ詰める。VMDの変換結果は`format: 'VRMA'`として扱い、元ファイル名は保持する。表示上は`IK BAKED`を付加して、通常のVRMA入力と区別できるようにする。既存の`AnimationState`のsourceTracks／tracks／bakePreviewのライフサイクルをそのまま利用する。

VMDのドロップ処理は、MMDベイカーによる変換とデバッグ用MMDPlayerによる再生を同じ入力に対して開始する。ベイカーの結果を先にクリップへ追加し、preview側は独立して最後に読み込まれたVMDを表示する。どちらか一方の失敗が他方の成功を取り消さない。

## Bake algorithm

1. PMXをロードし、VMDをPMXのskeletonへ適合させた`AnimationClip`を作る。
2. `MMDAnimationHelper({ sync: false, pmxAnimation: true })`へ、`physics: false`でmeshとclipを追加する。
3. VMDの最大フレームを30fpsで列挙し、前回サンプルとの差分秒を`helper.update(delta)`へ渡す。最初のフレームは`delta = 0`で評価する。
4. 各フレームで`mesh.updateMatrixWorld(true)`を呼び、全skeleton boneのローカルpositionとquaternionを読み取る。これがIK／Grant解決済みのFK姿勢となる。
5. 各ボーンのQuaternion列を隣接サンプル間で連続化し、結果を`QuaternionKeyframeTrack`として保存する。
6. MMDのルート／センター系から、PMXローカル空間でのhips移動を別の`VectorKeyframeTrack`として保存する。基準フレームの水平オフセットを除き、基準hips高さは`restHipsY`として返す。
7. サンプリング後のMMD専用meshとhelperはプレビュー用meshと共有しない。変換処理が終わったら専用リソースを破棄可能な状態にする。

## Retargeting rules

MMD標準名を次のhumanoidへ対応付ける。

- `センター`、`グルーブ`、`下半身`および対応する英語名をhips系として扱う。
- `上半身`、`上半身2`、`上半身3`をspine、chest、upperChestへ対応付ける。
- `首`、`頭`、`左肩`／`右肩`、`左腕`／`右腕`、`左ひじ`／`右ひじ`、`左手首`／`右手首`を対応するbody humanoidへ対応付ける。
- `左足`／`右足`、`左ひざ`／`右ひざ`、`左足首`／`右足首`、`左つま先`／`右つま先`をleg humanoidへ対応付ける。
- 親指から小指までのMMD指ボーン、目ボーンは対応するVRM humanoidが存在する場合だけ出力する。
- `全ての親`、補助ボーン、髪、衣服、IKターゲットなどVRMA humanoidに対応しないボーンは、全PMXベイク結果には残すがVRMAトラックには出力しない。

センター系が複数存在する場合、親から子の順に姿勢を合成してhipsの回転を作る。`センター`または`グルーブ`が無い場合は利用可能な下半身系をfallbackにする。VRM側に存在しないhumanoidはスキップし、少なくとも1本の対応ボーンが無い場合は変換失敗とする。

## UI and state behavior

VMDから生成したAnimationStateは、既存のクリップ選択処理で自動選択する。選択後の`#viewport`は、IKベイク済みのhumanoidトラックを通常のVRMアニメーションとして再生する。一方、右下overlayはMMDPlayerが保持するVMDを再生し続け、VRMA側のseek、速度倍率、固定間隔ベイクの操作では変更しない。

一覧には入力ファイル名由来のclip name、`VRMA`形式、`IK BAKED`メタデータを表示する。既存のdownloadボタンは有効化し、生成されたVRMAにはIK解決済みのFK回転トラックのみを格納する。

## Error handling

PMXまたはVMDが読み込めない、VMDに有効なボーンフレームがない、またはVRMへ対応付け可能なhumanoidが0本の場合はエラーtoastを表示する。非同期のVMDドロップが競合した場合、最新リクエストだけを採用し、古いベイク結果は一覧へ追加しない。

## Testing and verification

- MMD名からhumanoid名への対応、左右、指、センター系の合成を純粋なNodeテストで検証する。
- 合成テスト用のskeletonとAnimationClipで、ベイカーがサンプル数、30fps時刻、全ボーンQuaternion、IK後の回転を返すことを検証する。
- VMD経路の`LoadedClip`が`VRMA`形式で一覧に追加され、既存のVRMA Blob生成へ渡ることを検証する。
- `npm run build`でTypeScriptとViteのビルドを確認する。
- 実ブラウザでVMDドロップ後にoverlay表示、clip一覧追加、#viewport再生、VRMAダウンロードが成立することを確認する。
