mod backend;

use backend::{pick_port, start_backend, BackendState, BackendStatus};
use tauri::{Manager, RunEvent, State};

#[tauri::command]
fn get_backend_url(state: State<BackendState>) -> String {
    state.url.clone()
}

#[tauri::command]
fn get_backend_status(state: State<BackendState>) -> BackendStatus {
    let is_ready = state.ready.lock().map(|r| *r).unwrap_or(false);
    BackendStatus {
        ready: is_ready,
        port: state.port,
        url: state.url.clone(),
    }
}

pub fn run() {
    let default_port = 8765;
    let port = pick_port(default_port);
    let backend_state = BackendState::new(port);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(backend_state)
        .invoke_handler(tauri::generate_handler![
            get_backend_url,
            get_backend_status
        ])
        .setup(|app| {
            let state = app.state::<BackendState>();
            if let Err(err) = start_backend(app.handle(), &state) {
                log::error!("Failed to initialize backend: {}", err);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            log::info!("Application exiting, stopping backend process...");
            let state = app_handle.state::<BackendState>();
            state.stop();
        }
    });
}
