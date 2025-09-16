// Electronのメインプロセス関連のインポート
import { app, BrowserWindow } from 'electron'
// 子プロセス管理用のインポート
import { spawn, ChildProcess, exec } from 'node:child_process'
// ESモジュール用のパス解決
import { fileURLToPath } from 'node:url'
// ファイルパス操作
import path from 'node:path'
// ファイルシステム操作
import fs from 'node:fs'

// const require = createRequire(import.meta.url)
// 現在のファイルのディレクトリパスを取得
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ビルド後のディレクトリ構造
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
// アプリケーションのルートディレクトリを設定
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Vite@2.xのvite:defineプラグインを避けるために['ENV_NAME']を使用
// 開発サーバーのURL（開発環境でのみ設定される）
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
// Electronのメインプロセス用のビルドディレクトリ
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
// レンダラープロセス用のビルドディレクトリ
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

// 静的ファイルのパスを設定（開発環境ではpublic、本番環境ではdist）
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// グローバル変数の定義
let win: BrowserWindow | null  // メインウィンドウのインスタンス
let backendProcess: ChildProcess | null = null  // バックエンドプロセスのインスタンス
let backendPathCache: string | null = null  // バックエンドパスのキャッシュ

/**
 * バックエンドパスを事前に解決し、キャッシュする。
 * 起動時のファイル存在確認を最適化する。
 */
function resolveBackendPath(): { path: string; args: string[] } {
  // キャッシュされたパスがある場合はそれを使用（高速化）
  if (backendPathCache) {
    return { path: backendPathCache, args: [] }
  }

  let backendPath: string
  let args: string[] = []

  if (VITE_DEV_SERVER_URL) {
    // 開発環境: Pythonスクリプトを直接実行
    backendPath = 'python'
    args = [path.join(process.env.APP_ROOT, '..', 'backend', 'main.py')]
  } else {
    // 本番環境: ビルドされたexeファイルを実行
    const isPackaged = app.isPackaged  // アプリがパッケージ化されているかチェック
    const backendExeName = 'WebCamApp-Backend.exe'
    
    // 複数の候補パスを定義（パッケージ化状況に応じて）
    const candidatePaths = [
      isPackaged 
        ? path.join(process.resourcesPath, 'backend_exe', backendExeName)  // パッケージ化済み
        : path.join(process.env.APP_ROOT, 'backend_exe', backendExeName),  // 開発用ビルド
      path.join(__dirname, '..', '..', 'resources', 'backend_exe', backendExeName)  // 代替パス
    ]

    // 最初に見つかったパスを使用
    let foundPath: string | null = null
    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        foundPath = candidatePath
        break
      }
    }

    // バックエンドファイルが見つからない場合はエラー
    if (!foundPath) {
      throw new Error(`バックエンド実行ファイルが見つかりません: ${candidatePaths.join(', ')}`)
    }
    
    backendPath = foundPath
  }

  // 解決したパスをキャッシュに保存（次回の起動を高速化）
  backendPathCache = backendPath
  console.log('バックエンドパス解決完了:', backendPath)
  
  return { path: backendPath, args }
}

/**
 * バックエンドプロセスを起動する。
 * 本番環境ではresources/backend.exeを、開発環境ではPythonスクリプトを実行する。
 */
function startBackendProcess() {
  // 既にバックエンドプロセスが起動している場合は何もしない
  if (backendProcess) {
    console.log('バックエンドプロセスは既に起動しています')
    return
  }

  console.log('バックエンドプロセス起動開始...')

  try {
    // バックエンドパスを解決（キャッシュから取得または新規解決）
    const { path: backendPath, args } = resolveBackendPath()
    
    // 並列でファイル存在確認とmodelsフォルダ確認を実行（高速化）
    const fileChecks = []
    
    // バックエンドファイルの存在確認
    fileChecks.push(
      new Promise<boolean>((resolve) => {
        resolve(fs.existsSync(backendPath))
      })
    )

    // modelsフォルダの確認（本番環境のみ）
    if (!VITE_DEV_SERVER_URL) {
      fileChecks.push(
        new Promise<boolean>((resolve) => {
          // パッケージ化されたアプリでは、modelsフォルダはresourcesの親ディレクトリに配置される
          const modelsPath = app.isPackaged 
            ? path.join(process.resourcesPath, '..', 'models')
            : path.join(process.resourcesPath, 'models')
          const exists = fs.existsSync(modelsPath)
          if (exists) {
            try {
              // modelsフォルダ内のファイル一覧を取得してログ出力
              const modelFiles = fs.readdirSync(modelsPath)
              console.log('modelsフォルダ内のファイル:', modelFiles)
            } catch (error) {
              console.warn('modelsフォルダの読み取りエラー:', error)
            }
          }
          resolve(exists)
        })
      )
    }

    // ファイル存在確認を並列実行（Promise.allで高速化）
    Promise.all(fileChecks).then((results) => {
      const [backendExists, modelsExists] = results
      console.log('ファイル存在確認結果:', { backendExists, modelsExists })
      
      // バックエンドファイルが存在しない場合はエラー
      if (!backendExists) {
        throw new Error(`バックエンドファイルが存在しません: ${backendPath}`)
      }

      // バックエンドプロセスを起動
      backendProcess = spawn(backendPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']  // stdinは無視、stdout/stderrはパイプで取得
      })

      // 標準出力の監視
      backendProcess.stdout?.on('data', (data) => {
        console.log('バックエンド出力:', data.toString())
      })

      // 標準エラー出力の監視
      backendProcess.stderr?.on('data', (data) => {
        console.error('バックエンドエラー:', data.toString())
      })

      // プロセス終了時の処理
      backendProcess.on('close', (code) => {
        console.log(`バックエンドプロセスが終了しました (コード: ${code})`)
        backendProcess = null  // プロセス参照をクリア
      })

      // プロセス起動エラー時の処理
      backendProcess.on('error', (error) => {
        console.error('バックエンドプロセス起動エラー:', error)
        backendProcess = null  // プロセス参照をクリア
      })

      console.log('バックエンドプロセス起動完了')
    }).catch((error) => {
      console.error('バックエンド起動エラー:', error)
      backendProcess = null
    })

  } catch (error) {
    console.error('バックエンドパス解決エラー:', error)
    backendProcess = null
  }
}

/**
 * すべてのbackend.exeプロセスを強制終了する。
 */
function killAllBackendProcesses() {
  console.log('すべてのWebCamApp-Backend.exeプロセスを終了中...')
  return new Promise<void>((resolve) => {
    // Windowsのtaskkillコマンドでバックエンドプロセスを強制終了
    exec('taskkill /f /im WebCamApp-Backend.exe', (error) => {
      if (error) {
        // プロセスが見つからない場合などはエラーになるが、正常なケース
        console.log('WebCamApp-Backend.exeプロセスの終了をスキップ:', error.message)
      } else {
        console.log('すべてのWebCamApp-Backend.exeプロセスを終了しました')
      }
      resolve()  // エラーでも正常でも必ずresolveを呼ぶ
    })
  })
}

/**
 * バックエンドプロセスを停止する。
 */
function stopBackendProcess() {
  if (backendProcess) {
    console.log('バックエンドプロセスを停止中...')
    try {
      // まずSIGTERMで正常終了を試行（プロセスに終了要求を送信）
      backendProcess.kill('SIGTERM')
      
      // 3秒待ってから強制終了（正常終了しない場合のフォールバック）
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          console.log('バックエンドプロセスを強制終了中...')
          backendProcess.kill('SIGKILL')  // 強制終了
        }
      }, 3000)
      
      // プロセス終了時のイベントハンドラー
      backendProcess.on('exit', () => {
        console.log('バックエンドプロセスが正常に終了しました')
        backendProcess = null  // プロセス参照をクリア
      })
    } catch (error) {
      console.error('バックエンドプロセス停止エラー:', error)
      backendProcess = null
    }
  }
}

function createWindow() {
  console.log('ウィンドウ作成開始...')
  
  // メインウィンドウを作成
  win = new BrowserWindow({
    width: 1200,        // 初期幅
    height: 800,        // 初期高さ
    minWidth: 800,      // 最小幅
    minHeight: 600,     // 最小高さ
    autoHideMenuBar: true, // メニューバーを自動非表示
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),  // アプリケーションアイコン
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),  // プリロードスクリプト
    },
  })

  // レンダラープロセスにメッセージを送信（ページ読み込み完了時）
  win.webContents.on('did-finish-load', () => {
    console.log('ウィンドウ読み込み完了')
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // 開発環境と本番環境で異なるURLを読み込み
  if (VITE_DEV_SERVER_URL) {
    // 開発環境: Viteの開発サーバーに接続
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // 本番環境: ビルドされたHTMLファイルを読み込み
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // 開発環境では既にnpm run devでバックエンドが起動されているため、本番環境のみバックエンドを起動
  if (!VITE_DEV_SERVER_URL) {
    // 本番環境: バックエンドプロセスを起動（非同期で実行、ウィンドウ表示をブロックしない）
    setImmediate(() => {
      startBackendProcess()
    })
  } else {
    console.log('開発環境: バックエンドはnpm run devで既に起動されています')
  }
}

// すべてのウィンドウが閉じられたときに終了する（macOSを除く）。
// macOSでは、ユーザーがCmd + Qで明示的に終了するまで
// アプリケーションとメニューバーがアクティブなままになるのが一般的。
// すべてのウィンドウが閉じられたときのイベントハンドラー
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {  // macOS以外の場合
    // 開発環境ではバックエンドプロセスはnpm run devで管理されているため、本番環境のみ停止
    if (!VITE_DEV_SERVER_URL) {
      // 本番環境: バックエンドプロセスを停止してからアプリを終了
      stopBackendProcess()
      
      // すべてのbackend.exeプロセスを強制終了（残存プロセスのクリーンアップ）
      await killAllBackendProcesses()
    } else {
      console.log('開発環境: バックエンドプロセスはnpm run devで管理されています')
    }
    
    // プロセス終了を待ってからアプリを終了（1秒の遅延）
    setTimeout(() => {
      app.quit()  // アプリケーションを終了
      win = null  // ウィンドウ参照をクリア
    }, 1000)
  }
})

// macOSでアプリがアクティブになったときのイベントハンドラー
app.on('activate', () => {
  // macOSでは、ドックアイコンがクリックされ、他のウィンドウが開いていない場合に
  // アプリ内でウィンドウを再作成するのが一般的。
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()  // ウィンドウを再作成
  }
})

// アプリケーション終了前のクリーンアップ処理
app.on('before-quit', async () => {
  // 開発環境ではバックエンドプロセスはnpm run devで管理されているため、本番環境のみ停止
  if (!VITE_DEV_SERVER_URL) {
    stopBackendProcess()  // バックエンドプロセスを停止
    await killAllBackendProcesses()  // 残存プロセスをクリーンアップ
  } else {
    console.log('開発環境: バックエンドプロセスはnpm run devで管理されています')
  }
})

/**
 * バックエンドパスを事前に解決してキャッシュする。
 * アプリケーション起動時に実行される。
 */
function preloadBackendPath() {
  try {
    // バックエンドパスを事前に解決してキャッシュに保存
    resolveBackendPath()
    console.log('バックエンドパス事前解決完了')
  } catch (error) {
    // エラーが発生してもアプリケーションは継続実行
    console.warn('バックエンドパス事前解決でエラー:', error)
  }
}

// アプリケーション起動時の初期化処理
app.whenReady().then(async () => {
  // 本番環境のみ既存のbackend.exeプロセスを終了（前回の起動で残存したプロセスのクリーンアップ）
  if (!VITE_DEV_SERVER_URL) {
    await killAllBackendProcesses()
  } else {
    console.log('開発環境: バックエンドプロセスはnpm run devで管理されています')
  }
  
  // バックエンドパスを事前に解決（起動時の高速化のため）
  preloadBackendPath()
  
  // クリーンアップ後にウィンドウを作成
  createWindow()
})
