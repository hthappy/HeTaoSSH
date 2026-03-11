use crate::error::Result;
use log::info;
use serde::{Deserialize, Serialize};
use sysinfo::{Disks, Networks, System};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemUsage {
    pub cpu_usage: f32,
    pub memory_usage: f32,
    pub memory_total: u64,
    pub memory_used: u64,
    pub memory_available: u64,
    pub network_rx: u64,
    pub network_tx: u64,
    pub disk_usage: Vec<DiskUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskUsage {
    pub mount_point: String,
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub usage_percent: f32,
}

pub fn get_system_usage() -> Result<SystemUsage> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_usage = sys.global_cpu_usage();
    let memory_total = sys.total_memory();
    let memory_used = sys.used_memory();
    let memory_available = sys.available_memory();
    let memory_usage = if memory_total > 0 {
        (memory_used as f32 / memory_total as f32) * 100.0
    } else {
        0.0
    };

    let networks = Networks::new_with_refreshed_list();
    let mut network_rx = 0u64;
    let mut network_tx = 0u64;
    for (_, data) in networks.iter() {
        network_rx += data.total_received();
        network_tx += data.total_transmitted();
    }

    let disks = Disks::new_with_refreshed_list();
    let mut disk_usage = Vec::new();
    for disk in disks.iter() {
        let total = disk.total_space();
        let used = disk.total_space() - disk.available_space();
        let available = disk.available_space();
        let usage_percent = if total > 0 {
            (used as f32 / total as f32) * 100.0
        } else {
            0.0
        };

        disk_usage.push(DiskUsage {
            mount_point: disk.mount_point().to_string_lossy().to_string(),
            total,
            used,
            available,
            usage_percent,
        });
    }

    info!("System usage: CPU {}%, Memory {}%", cpu_usage, memory_usage);

    Ok(SystemUsage {
        cpu_usage,
        memory_usage,
        memory_total,
        memory_used,
        memory_available,
        network_rx,
        network_tx,
        disk_usage,
    })
}
