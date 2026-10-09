use super::Policy;
use std::{ffi::c_void, mem::{size_of, zeroed}, ptr::{null, null_mut}};
use windows_sys::Win32::{Foundation::*, Security::{*, Isolation::*, Authorization::*}, System::{Threading::*, JobObjects::*, Console::*}, Storage::FileSystem::*};
fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain([0]).collect() }
fn checked(ok: i32) -> Result<(), Box<dyn std::error::Error>> { if ok == 0 { Err(std::io::Error::last_os_error().into()) } else { Ok(()) } }
struct Handle(HANDLE);
impl Drop for Handle { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }
struct Container { name: Vec<u16>, sid: PSID, paths: Vec<String> }
impl Drop for Container { fn drop(&mut self) { unsafe { for path in &self.paths { let _ = edit_acl(path, self.sid, false, true, false); } DeleteAppContainerProfile(self.name.as_ptr()); FreeSid(self.sid); } } }
unsafe fn edit_acl(path: &str, sid: PSID, writable: bool, revoke: bool, metadata: bool) -> Result<(), Box<dyn std::error::Error>> {
    let mut name = wide(path); let mut old_acl = null_mut(); let mut sd = null_mut();
    let code = GetNamedSecurityInfoW(name.as_ptr(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, null_mut(), null_mut(), &mut old_acl, null_mut(), &mut sd);
    if code != 0 { return Err(std::io::Error::from_raw_os_error(code as i32).into()); }
    let mut access: EXPLICIT_ACCESS_W = zeroed();
    access.grfAccessPermissions = if metadata { FILE_READ_ATTRIBUTES | FILE_TRAVERSE | 0x00100000 } else if writable { FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE | DELETE } else { FILE_GENERIC_READ | FILE_GENERIC_EXECUTE };
    access.grfAccessMode = if revoke { REVOKE_ACCESS } else { GRANT_ACCESS }; access.grfInheritance = if metadata { NO_INHERITANCE } else { SUB_CONTAINERS_AND_OBJECTS_INHERIT };
    access.Trustee.TrusteeForm = TRUSTEE_IS_SID; access.Trustee.TrusteeType = TRUSTEE_IS_UNKNOWN; access.Trustee.ptstrName = sid as *mut u16;
    let mut next = null_mut(); let mut code = SetEntriesInAclW(1, &access, old_acl, &mut next);
    if code == 0 { code = SetNamedSecurityInfoW(name.as_mut_ptr(), SE_FILE_OBJECT, DACL_SECURITY_INFORMATION, null_mut(), null_mut(), next, null_mut()); }
    LocalFree(sd); if !next.is_null() { LocalFree(next as *mut c_void); }
    if code != 0 { return Err(std::io::Error::from_raw_os_error(code as i32).into()); } Ok(())
}
fn quote_arg(value: &str) -> String {
    let mut out = String::from("\""); let mut slashes = 0;
    for c in value.chars() { if c == '\\' { slashes += 1; } else { out.extend(std::iter::repeat_n('\\', if c == '"' { slashes * 2 + 1 } else { slashes })); slashes = 0; out.push(c); } }
    out.extend(std::iter::repeat_n('\\', slashes * 2)); out.push('"'); out
}
// Grants are confined to host-owned artifacts and the private job. Never update
// ancestor ACLs: SetNamedSecurityInfoW can propagate them across an entire drive.
fn all_paths(p: &Policy) -> Vec<String> { p.read_only.iter().chain(p.writable.iter()).cloned().collect() }
pub fn launch(p: &Policy) -> Result<i32, Box<dyn std::error::Error>> { unsafe {
    let id = &p.container;
    let name = wide(&id); let mut sid = null_mut();
    let hr = CreateAppContainerProfile(name.as_ptr(), name.as_ptr(), name.as_ptr(), null(), 0, &mut sid);
    if hr < 0 { return Err(format!("CreateAppContainerProfile failed: {hr:x}").into()); }
    let _container = Container { name, sid, paths: all_paths(p) };
    for root in &p.read_only { edit_acl(root, sid, false, false, false)?; }
    for root in &p.writable {
        edit_acl(root, sid, true, false, false)?;
        // Low integrity is necessary for an AppContainer to write its private job.
        let sddl = wide("S:(ML;OICI;NW;;;LW)"); let mut sd = null_mut();
        checked(ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.as_ptr(), 1, &mut sd, null_mut()))?;
        let mut present = 0; let mut defaulted = 0; let mut sacl = null_mut();
        checked(GetSecurityDescriptorSacl(sd, &mut present, &mut sacl, &mut defaulted))?;
        let mut target = wide(root);
        let code = SetNamedSecurityInfoW(target.as_mut_ptr(), SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, null_mut(), null_mut(), null_mut(), sacl);
        LocalFree(sd); if code != 0 { return Err(std::io::Error::from_raw_os_error(code as i32).into()); }
    }
    let job = Handle(CreateJobObjectW(null(), null())); if job.0.is_null() { return Err(std::io::Error::last_os_error().into()); }
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
    limits.BasicLimitInformation.ActiveProcessLimit = 1;
    checked(SetInformationJobObject(job.0, JobObjectExtendedLimitInformation, &limits as *const _ as *const c_void, size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32))?;
    let mut bytes = 0; InitializeProcThreadAttributeList(null_mut(), 3, 0, &mut bytes);
    let mut storage = vec![0usize; bytes.div_ceil(size_of::<usize>())]; let list = storage.as_mut_ptr() as LPPROC_THREAD_ATTRIBUTE_LIST;
    checked(InitializeProcThreadAttributeList(list, 3, 0, &mut bytes))?;
    struct Attributes(LPPROC_THREAD_ATTRIBUTE_LIST); impl Drop for Attributes { fn drop(&mut self) { unsafe { DeleteProcThreadAttributeList(self.0); } } } let _attributes = Attributes(list);
    let capabilities = SECURITY_CAPABILITIES { AppContainerSid: sid, Capabilities: null_mut(), CapabilityCount: 0, Reserved: 0 };
    checked(UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize, &capabilities as *const _ as *const c_void, size_of::<SECURITY_CAPABILITIES>(), null_mut(), null()))?;
    // Reject child creation before it reaches the job's process-count limit.
    // PROCESS_CREATION_CHILD_PROCESS_RESTRICTED (Windows 10+).
    let child_policy: u32 = 1;
    checked(UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_CHILD_PROCESS_POLICY as usize, &child_policy as *const _ as *const c_void, size_of::<u32>(), null_mut(), null()))?;
    let handles = [GetStdHandle(STD_INPUT_HANDLE), GetStdHandle(STD_OUTPUT_HANDLE), GetStdHandle(STD_ERROR_HANDLE)];
    for handle in handles { checked(SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT))?; }
    checked(UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize, handles.as_ptr() as *const c_void, size_of_val(&handles), null_mut(), null()))?;
    let mut startup: STARTUPINFOEXW = zeroed(); startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES; startup.StartupInfo.hStdInput = handles[0]; startup.StartupInfo.hStdOutput = handles[1]; startup.StartupInfo.hStdError = handles[2]; startup.lpAttributeList = list;
    let mut command = wide(&std::iter::once(p.executable.as_str()).chain(p.args.iter().map(String::as_str)).map(quote_arg).collect::<Vec<_>>().join(" "));
    let executable = wide(&p.executable); let cwd = wide(&p.cwd);
    let mut environment: Vec<u16> = Vec::new();
    let mut values: std::collections::BTreeMap<String,String> = std::env::vars().filter(|(key,_)| !["USERPROFILE","LOCALAPPDATA","APPDATA"].contains(&key.to_uppercase().as_str())).collect();
    for key in ["USERPROFILE","LOCALAPPDATA","APPDATA"] { values.insert(key.to_string(),p.cwd.clone()); }
    let mut sorted: Vec<_> = values.into_iter().collect(); sorted.sort_by_key(|(key,_)| key.to_uppercase());
    for (key,value) in sorted { environment.extend(format!("{key}={value}").encode_utf16()); environment.push(0); } environment.push(0); let mut process: PROCESS_INFORMATION = zeroed();
    checked(CreateProcessW(executable.as_ptr(), command.as_mut_ptr(), null(), null(), 1, EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, environment.as_ptr() as *const c_void, cwd.as_ptr(), &startup.StartupInfo, &mut process)).map_err(|error| format!("CreateProcess AppContainer: {error}"))?;
    let child = Handle(process.hProcess); let thread = Handle(process.hThread);
    if let Err(error) = checked(AssignProcessToJobObject(job.0, child.0)) { TerminateProcess(child.0, 126); return Err(error); }
    if ResumeThread(thread.0) == u32::MAX { TerminateProcess(child.0, 126); return Err(std::io::Error::last_os_error().into()); }
    if WaitForSingleObject(child.0, INFINITE) == WAIT_FAILED { return Err(std::io::Error::last_os_error().into()); }
    let mut code = 126; checked(GetExitCodeProcess(child.0, &mut code))?; Ok(code as i32)
} }

// Called by the trusted supervisor after forced exit and on interrupted-job recovery.
pub fn cleanup(p: &Policy) -> Result<i32, Box<dyn std::error::Error>> { unsafe {
    let name = wide(&p.container); let mut sid = null_mut();
    let hr = DeriveAppContainerSidFromAppContainerName(name.as_ptr(), &mut sid);
    if hr < 0 { return Err(format!("cannot derive cleanup SID: {hr:x}").into()); }
    let container = Container { name, sid, paths: all_paths(p) };
    for path in &container.paths { if std::path::Path::new(path).exists() { edit_acl(path, sid, false, true, false)?; } }
    drop(container); Ok(0)
} }
