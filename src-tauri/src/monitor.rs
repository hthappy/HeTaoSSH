use crate::error::{Result, SshError};
use log::info;
use serde::{Deserialize, Serialize};

/// 远程系统资源使用情况
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemUsage {
    pub cpu_usage: f32,
    pub memory_usage: f32,
    pub memory_total: u64,
    pub memory_used: u64,
    pub memory_available: u64,
    pub network_rx: u64,
    pub network_tx: u64,
    pub uptime: u64,
    pub load_average: Vec<f64>,
    pub disk_usage: Vec<DiskUsage>,
}

/// 远程磁盘使用情况
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskUsage {
    pub mount_point: String,
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub usage_percent: f32,
}

/// 通过 SSH 在远程服务器上执行单条命令并返回 stdout
async fn exec_remote_command(
    session: &russh::client::Handle<crate::ssh::connection::ClientHandler>,
    command: &str,
) -> Result<String> {
    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| SshError::Channel(format!("Failed to open exec channel: {}", e)))?;

    channel
        .exec(true, command)
        .await
        .map_err(|e| SshError::Channel(format!("Failed to exec command: {}", e)))?;

    // 读取所有输出
    let mut output = Vec::new();
    let mut stream = channel.into_stream();
    use tokio::io::AsyncReadExt;
    let mut buf = vec![0u8; 8192];
    loop {
        match tokio::time::timeout(std::time::Duration::from_secs(5), stream.read(&mut buf)).await {
            Ok(Ok(0)) => break,
            Ok(Ok(n)) => output.extend_from_slice(&buf[..n]),
            Ok(Err(_)) => break,
            Err(_) => break, // 超时
        }
    }

    String::from_utf8(output)
        .map_err(|e| SshError::Channel(format!("Command output not valid UTF-8: {}", e)))
}

/// 从远程 Linux 服务器采集系统资源信息
/// 执行一条组合命令，一次性获取 CPU、内存、磁盘、网络数据
pub async fn get_remote_system_usage(
    session: &russh::client::Handle<crate::ssh::connection::ClientHandler>,
) -> Result<SystemUsage> {
    // 使用一条组合命令，减少 SSH channel 开销
    // 分隔符 "---SECTION---" 用来拆分不同部分的输出
    let combined_cmd = r#"echo "---CPU---" && grep 'cpu ' /proc/stat && echo "---MEM---" && cat /proc/meminfo && echo "---DISK---" && df -B1 2>/dev/null && echo "---NET---" && cat /proc/net/dev && echo "---UPTIME---" && cat /proc/uptime && echo "---LOAD---" && cat /proc/loadavg"#;

    let raw = exec_remote_command(session, combined_cmd).await?;

    let cpu_usage = parse_cpu_usage(&raw);
    let (memory_total, memory_used, memory_available, memory_usage) = parse_memory_info(&raw);
    let disk_usage = parse_disk_usage(&raw);
    let (network_rx, network_tx) = parse_network_info(&raw);
    let uptime = parse_uptime(&raw);
    let load_average = parse_load_average(&raw);

    info!(
        "Remote system: CPU {:.1}%, Memory {:.1}%, Uptime {}s, Load {:?}",
        cpu_usage, memory_usage, uptime, load_average
    );

    Ok(SystemUsage {
        cpu_usage,
        memory_usage,
        memory_total,
        memory_used,
        memory_available,
        network_rx,
        network_tx,
        uptime,
        load_average,
        disk_usage,
    })
}

/// 解析 /proc/stat 获取 CPU 使用率（瞬时快照近似值）
fn parse_cpu_usage(raw: &str) -> f32 {
    let section = extract_section(raw, "---CPU---", "---MEM---");
    for line in section.lines() {
        if line.starts_with("cpu ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 5 {
                // user nice system idle iowait irq softirq steal
                let user: u64 = parts[1].parse().unwrap_or(0);
                let nice: u64 = parts[2].parse().unwrap_or(0);
                let system: u64 = parts[3].parse().unwrap_or(0);
                let idle: u64 = parts[4].parse().unwrap_or(0);
                let iowait: u64 = parts.get(5).and_then(|v| v.parse().ok()).unwrap_or(0);
                let irq: u64 = parts.get(6).and_then(|v| v.parse().ok()).unwrap_or(0);
                let softirq: u64 = parts.get(7).and_then(|v| v.parse().ok()).unwrap_or(0);
                let steal: u64 = parts.get(8).and_then(|v| v.parse().ok()).unwrap_or(0);

                let total = user + nice + system + idle + iowait + irq + softirq + steal;
                let busy = total - idle - iowait;
                if total > 0 {
                    return (busy as f32 / total as f32) * 100.0;
                }
            }
        }
    }
    0.0
}

/// 解析 /proc/meminfo 获取内存信息（字节）
fn parse_memory_info(raw: &str) -> (u64, u64, u64, f32) {
    let section = extract_section(raw, "---MEM---", "---DISK---");
    let mut mem_total: u64 = 0;
    let mut mem_free: u64 = 0;
    let mut mem_available: u64 = 0;
    let mut buffers: u64 = 0;
    let mut cached: u64 = 0;

    for line in section.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            // /proc/meminfo 中的值是 kB
            let value_kb: u64 = parts[1].parse().unwrap_or(0);
            match parts[0] {
                "MemTotal:" => mem_total = value_kb * 1024,
                "MemFree:" => mem_free = value_kb * 1024,
                "MemAvailable:" => mem_available = value_kb * 1024,
                "Buffers:" => buffers = value_kb * 1024,
                "Cached:" => cached = value_kb * 1024,
                _ => {}
            }
        }
    }

    // 如果 MemAvailable 不存在（旧内核），则用 Free + Buffers + Cached 估算
    if mem_available == 0 {
        mem_available = mem_free + buffers + cached;
    }

    let mem_used = mem_total.saturating_sub(mem_available);
    let mem_usage = if mem_total > 0 {
        (mem_used as f32 / mem_total as f32) * 100.0
    } else {
        0.0
    };

    (mem_total, mem_used, mem_available, mem_usage)
}

/// 解析 df -B1 输出获取磁盘使用情况
fn parse_disk_usage(raw: &str) -> Vec<DiskUsage> {
    let section = extract_section(raw, "---DISK---", "---NET---");
    let mut disks = Vec::new();

    for line in section.lines().skip(1) {
        // 跳过标题行
        let parts: Vec<&str> = line.split_whitespace().collect();
        // 格式: Filesystem 1B-blocks Used Available Use% Mounted_on
        if parts.len() >= 6 {
            let mount_point = parts[5].to_string();
            // 只显示真实文件系统挂载点
            if !mount_point.starts_with('/')
                || mount_point.starts_with("/dev")
                || mount_point.starts_with("/sys")
                || mount_point.starts_with("/proc")
                || mount_point.starts_with("/run")
                || mount_point.starts_with("/snap")
            {
                if mount_point != "/" {
                    continue;
                }
            }

            let total: u64 = parts[1].parse().unwrap_or(0);
            let used: u64 = parts[2].parse().unwrap_or(0);
            let available: u64 = parts[3].parse().unwrap_or(0);
            // df 的 Use% 口径与 used/total 不同（会受保留块等影响），优先直接解析 Use% 列以保持一致
            let usage_percent: f32 = parts[4]
                .trim_end_matches('%')
                .parse::<f32>()
                .ok()
                .or_else(|| {
                    let denom = used.saturating_add(available);
                    if denom > 0 {
                        Some((used as f32 / denom as f32) * 100.0)
                    } else {
                        None
                    }
                })
                .unwrap_or(0.0);

            disks.push(DiskUsage {
                mount_point,
                total,
                used,
                available,
                usage_percent,
            });
        }
    }

    disks
}

/// 解析 /proc/net/dev 获取网络流量（字节）
fn parse_network_info(raw: &str) -> (u64, u64) {
    let section = extract_section(raw, "---NET---", "---UPTIME---");
    let mut rx: u64 = 0;
    let mut tx: u64 = 0;

    for line in section.lines() {
        let line = line.trim();
        if line.contains(':') && !line.starts_with("Inter") && !line.starts_with("face") {
            // 格式: iface: rx_bytes rx_packets ... tx_bytes tx_packets ...
            if let Some(data) = line.split(':').nth(1) {
                let parts: Vec<&str> = data.split_whitespace().collect();
                if parts.len() >= 9 {
                    let iface_rx: u64 = parts[0].parse().unwrap_or(0);
                    let iface_tx: u64 = parts[8].parse().unwrap_or(0);
                    // 跳过 lo 回环接口
                    let iface_name = line.split(':').next().unwrap_or("").trim();
                    if iface_name != "lo" {
                        rx += iface_rx;
                        tx += iface_tx;
                    }
                }
            }
        }
    }

    (rx, tx)
}

/// 解析 /proc/uptime 获取运行时间（秒）
fn parse_uptime(raw: &str) -> u64 {
    let section = extract_section(raw, "---UPTIME---", "---LOAD---");
    let line = section.lines().next().unwrap_or("").trim();
    line.split_whitespace()
        .next()
        .and_then(|v| v.parse::<f64>().ok())
        .map(|v| v as u64)
        .unwrap_or(0)
}

/// 解析 /proc/loadavg 获取系统负载
fn parse_load_average(raw: &str) -> Vec<f64> {
    let section = extract_section(raw, "---LOAD---", "");
    let line = section.lines().next().unwrap_or("").trim();
    line.split_whitespace()
        .take(3)
        .filter_map(|v| v.parse::<f64>().ok())
        .collect()
}

/// 从组合命令输出中提取指定段落
fn extract_section(raw: &str, start_marker: &str, end_marker: &str) -> String {
    let start = raw.find(start_marker).map(|i| i + start_marker.len()).unwrap_or(0);
    let end = if end_marker.is_empty() {
        raw.len()
    } else {
        raw[start..].find(end_marker).map(|i| start + i).unwrap_or(raw.len())
    };
    raw[start..end].to_string()
}
