use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, serde::Serialize)]
pub struct BackendStatus {
    pub ready: bool,
    pub port: u16,
    pub url: String,
}

pub struct BackendState {
    pub port: u16,
    pub url: String,
    pub ready: Arc<Mutex<bool>>,
    pub child: Arc<Mutex<Option<Child>>>,
}

impl BackendState {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            url: format!("http://127.0.0.1:{}", port),
            ready: Arc::new(Mutex::new(false)),
            child: Arc::new(Mutex::new(None)),
        }
    }

    pub fn stop(&self) {
        if let Ok(mut lock) = self.child.lock() {
            if let Some(mut child) = lock.take() {
                log::info!("Terminating backend child process (PID: {})...", child.id());
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

// Find an available port, defaulting to 8765 if free
pub fn pick_port(preferred: u16) -> u16 {
    if let Ok(listener) = TcpListener::bind(("127.0.0.1", preferred)) {
        drop(listener);
        return preferred;
    }
    if let Ok(listener) = TcpListener::bind("127.0.0.1:0") {
        if let Ok(addr) = listener.local_addr() {
            drop(listener);
            return addr.port();
        }
    }
    preferred
}

fn locate_bundled_executable(app: &AppHandle) -> Option<PathBuf> {
    let exe_name = if cfg!(windows) {
        "label-edit-backend.exe"
    } else {
        "label-edit-backend"
    };

    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join("backend").join("label-edit-backend").join(exe_name));
        candidates.push(resource_dir.join("resources").join("backend").join(exe_name));
        candidates.push(resource_dir.join("backend").join("label-edit-backend").join(exe_name));
        candidates.push(resource_dir.join("backend").join(exe_name));
        candidates.push(resource_dir.join("label-edit-backend").join(exe_name));
        candidates.push(resource_dir.join(exe_name));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("resources").join("backend").join("label-edit-backend").join(exe_name));
            candidates.push(exe_dir.join("resources").join("backend").join(exe_name));
            candidates.push(exe_dir.join("backend").join("label-edit-backend").join(exe_name));
            candidates.push(exe_dir.join("backend").join(exe_name));
            candidates.push(exe_dir.join("label-edit-backend").join(exe_name));
            candidates.push(exe_dir.join(exe_name));
        }
    }

    candidates.into_iter().find(|p| p.is_file())
}

fn locate_dev_python(app_root: &Path) -> PathBuf {
    let venv_python = if cfg!(windows) {
        app_root.join(".venv").join("Scripts").join("python.exe")
    } else {
        app_root.join(".venv").join("bin").join("python")
    };

    if venv_python.is_file() {
        return venv_python;
    }

    if cfg!(windows) {
        PathBuf::from("python")
    } else {
        PathBuf::from("python3")
    }
}

pub fn start_backend(app: &AppHandle, state: &BackendState) -> Result<(), String> {
    let port = state.port;
    log::info!("Starting LabelEdit backend on 127.0.0.1:{}", port);

    let mut cmd: Command;
    let is_dev = cfg!(debug_assertions);

    if is_dev {
        let app_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let python_bin = locate_dev_python(&app_root);
        log::info!("Dev mode: spawning Python backend using {:?}", python_bin);

        cmd = Command::new(python_bin);
        cmd.current_dir(&app_root);
        cmd.args([
            "-m",
            "backend.desktop_entry",
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
        ]);
    } else {
        let backend_bin = locate_bundled_executable(app)
            .ok_or_else(|| "Failed to locate bundled backend executable".to_string())?;
        log::info!("Release mode: spawning backend executable {:?}", backend_bin);

        cmd = Command::new(&backend_bin);
        if let Some(parent) = backend_bin.parent() {
            cmd.current_dir(parent);
        }
        cmd.args([
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
        ]);
    }

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn backend process: {}", e))?;

    log::info!("Backend process spawned with PID {}", child.id());

    if let Ok(mut lock) = state.child.lock() {
        *lock = Some(child);
    }

    // Health check in background thread
    let url = state.url.clone();
    let ready_flag = Arc::clone(&state.ready);
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_millis(500))
            .build()
            .unwrap_or_default();

        let health_url = format!("{}/api/health", url);
        let start = Instant::now();
        let timeout = Duration::from_secs(30);

        while start.elapsed() < timeout {
            if let Ok(resp) = client.get(&health_url).send() {
                if resp.status().is_success() {
                    log::info!("Backend health check passed at {}", health_url);
                    if let Ok(mut lock) = ready_flag.lock() {
                        *lock = true;
                    }
                    let _ = app_handle.emit("backend-ready", ());
                    return;
                }
            }
            std::thread::sleep(Duration::from_millis(200));
        }

        log::error!("Backend health check timed out after 30s");
    });

    Ok(())
}
