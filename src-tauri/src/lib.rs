// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};

/**
 * 桌面端的三项「浏览器行为」补齐。
 *
 * 打包后页面跑在 `tauri://localhost` 自定义协议里，`<a download>` 与
 * `target="_blank"` 都不会生效（WebView 默认既不注册下载代理也不注册新窗口处理器），
 * 表现就是按钮点了没反应。这里用最小实现补上，不引入额外插件依赖：
 *
 * - `open_external`：只放行 http / https，交给系统默认浏览器；
 * - `save_export_file`：写入系统「下载」目录，重名自动加序号，返回落盘路径；
 * - `reveal_in_folder`：在文件管理器里定位刚导出的文件。
 *
 * 全部为本地操作：不联网、不上传，与 Local First 边界一致。
 */

/// 导出文件的落盘目录：系统「下载」目录，取不到就退回用户主目录。
fn downloads_dir() -> PathBuf {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    match home {
        Some(home) => {
            let candidate = PathBuf::from(&home).join("Downloads");
            if candidate.is_dir() {
                candidate
            } else {
                PathBuf::from(home)
            }
        }
        None => std::env::temp_dir(),
    }
}

/// 去掉路径分隔符与通配保留字符，避免越界写入或保存失败。
fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
            {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "导出文件".to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

/// 不覆盖同名文件：`报告.md` → `报告 (1).md`。
fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("导出文件");
    let ext = Path::new(file_name).extension().and_then(|s| s.to_str());
    for index in 1..1000 {
        let name = match ext {
            Some(ext) => format!("{stem} ({index}).{ext}"),
            None => format!("{stem} ({index})"),
        };
        let next = dir.join(name);
        if !next.exists() {
            return next;
        }
    }
    candidate
}

/* ------------------------------ 平台差异 ------------------------------ */

#[cfg(target_os = "macos")]
fn platform_open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
}

#[cfg(target_os = "windows")]
fn platform_open_url(url: &str) -> std::io::Result<()> {
    // 走 rundll32 的 URL 关联处理，不经过 cmd 解析：
    // 否则地址里合法的 `&` 会被当成命令分隔符。
    std::process::Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .spawn()
        .map(|_| ())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn platform_open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
}

#[cfg(target_os = "macos")]
fn platform_reveal(path: &str) -> std::io::Result<()> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map(|_| ())
}

#[cfg(target_os = "windows")]
fn platform_reveal(path: &str) -> std::io::Result<()> {
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{path}"))
        .spawn()
        .map(|_| ())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn platform_reveal(path: &str) -> std::io::Result<()> {
    let dir = Path::new(path)
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    std::process::Command::new("xdg-open")
        .arg(dir)
        .spawn()
        .map(|_| ())
}

/* -------------------------------- 命令 -------------------------------- */

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    let lowered = trimmed.to_ascii_lowercase();
    if !(lowered.starts_with("http://") || lowered.starts_with("https://")) {
        return Err("只允许打开 http / https 链接。".to_string());
    }
    platform_open_url(trimmed).map_err(|e| format!("打开链接失败：{e}"))
}

#[tauri::command]
fn save_export_file(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = downloads_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法写入下载目录：{e}"))?;
    let name = sanitize_file_name(&file_name);
    let path = unique_path(&dir, &name);
    std::fs::write(&path, &bytes).map_err(|e| format!("写入文件失败：{e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    platform_reveal(&path).map_err(|e| format!("打开文件夹失败：{e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_external,
            save_export_file,
            reveal_in_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
