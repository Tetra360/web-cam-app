import { app, BrowserWindow } from 'electron'
import { spawn, ChildProcess, exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

// const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let backendProcess: ChildProcess | null = null

/**
 * バックエンドプロセスを起動する。
 * 本番環境ではresources/backend.exeを、開発環境ではPythonスクリプトを実行する。
 */
function startBackendProcess() {
  if (backendProcess) {
    console.log('バックエンドプロセスは既に起動しています')
    return
  }

  let backendPath: string
  let args: string[] = []

  if (VITE_DEV_SERVER_URL) {
    // 開発環境: Pythonスクリプトを直接実行
    backendPath = 'python'
    args = [path.join(process.env.APP_ROOT, '..', 'backend', 'main.py')]
  } else {
    // 本番環境: ビルドされたexeファイルを実行
    // electron-builderでビルドされたアプリでは、ファイルはresourcesフォルダに配置される
    const isPackaged = app.isPackaged
    const backendExeName = 'WebCamApp-Backend.exe' // アプリケーション名に基づくexeファイル名
    
    if (isPackaged) {
      // パッケージ化されたアプリケーションの場合
      backendPath = path.join(process.resourcesPath, 'backend_exe', backendExeName)
    } else {
      // 開発用ビルドの場合
      backendPath = path.join(process.env.APP_ROOT, 'backend_exe', backendExeName)
    }
    
    // ファイルが存在しない場合の代替パスを試す
    if (!fs.existsSync(backendPath)) {
      console.log('代替パスを試行中...')
      const alternativePath = path.join(__dirname, '..', '..', 'resources', 'backend_exe', backendExeName)
      if (fs.existsSync(alternativePath)) {
        backendPath = alternativePath
        console.log('代替パスを使用:', backendPath)
      }
    }
  }

  console.log('バックエンドプロセスを起動中:', backendPath, args.join(' '))
  console.log('ファイル存在確認:', fs.existsSync(backendPath))
  console.log('process.resourcesPath:', process.resourcesPath)
  console.log('app.isPackaged:', app.isPackaged)
  
  // modelsフォルダの存在確認
  if (!VITE_DEV_SERVER_URL) {
    const modelsPath = path.join(process.resourcesPath, 'models')
    console.log('modelsフォルダパス:', modelsPath)
    console.log('modelsフォルダ存在確認:', fs.existsSync(modelsPath))
    if (fs.existsSync(modelsPath)) {
      const modelFiles = fs.readdirSync(modelsPath)
      console.log('modelsフォルダ内のファイル:', modelFiles)
    }
  }
  
  backendProcess = spawn(backendPath, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  backendProcess.stdout?.on('data', (data) => {
    console.log('バックエンド出力:', data.toString())
  })

  backendProcess.stderr?.on('data', (data) => {
    console.error('バックエンドエラー:', data.toString())
  })

  backendProcess.on('close', (code) => {
    console.log(`バックエンドプロセスが終了しました (コード: ${code})`)
    backendProcess = null
  })

  backendProcess.on('error', (error) => {
    console.error('バックエンドプロセス起動エラー:', error)
    backendProcess = null
  })
}

/**
 * すべてのbackend.exeプロセスを強制終了する。
 */
function killAllBackendProcesses() {
  console.log('すべてのWebCamApp-Backend.exeプロセスを終了中...')
  return new Promise<void>((resolve) => {
    exec('taskkill /f /im WebCamApp-Backend.exe', (error) => {
      if (error) {
        console.log('WebCamApp-Backend.exeプロセスの終了をスキップ:', error.message)
      } else {
        console.log('すべてのWebCamApp-Backend.exeプロセスを終了しました')
      }
      resolve()
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
      // まずSIGTERMで正常終了を試行
      backendProcess.kill('SIGTERM')
      
      // 3秒待ってから強制終了
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          console.log('バックエンドプロセスを強制終了中...')
          backendProcess.kill('SIGKILL')
        }
      }, 3000)
      
      backendProcess.on('exit', () => {
        console.log('バックエンドプロセスが正常に終了しました')
        backendProcess = null
      })
    } catch (error) {
      console.error('バックエンドプロセス停止エラー:', error)
      backendProcess = null
    }
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true, // メニューバーを自動非表示
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // バックエンドプロセスを起動
  startBackendProcess()
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    // バックエンドプロセスを停止してからアプリを終了
    stopBackendProcess()
    
    // すべてのbackend.exeプロセスを強制終了
    await killAllBackendProcesses()
    
    // プロセス終了を待ってからアプリを終了
    setTimeout(() => {
      app.quit()
      win = null
    }, 1000)
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// アプリケーション終了時のクリーンアップ処理
app.on('before-quit', async () => {
  stopBackendProcess()
  await killAllBackendProcesses()
})

// アプリケーション起動時に既存のbackend.exeプロセスをクリーンアップ
app.whenReady().then(async () => {
  // 既存のbackend.exeプロセスを終了
  await killAllBackendProcesses()
  // クリーンアップ後にウィンドウを作成
  createWindow()
})
