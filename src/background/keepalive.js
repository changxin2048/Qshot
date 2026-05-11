const ALARM_NAME = "qshot-keepalive";
const ALARM_PERIOD_MINUTES = 1;

export function setupKeepaliveAlarm() {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    // 触发一次 storage 读取，保持 SW 活跃
    chrome.storage.session?.get?.([]).catch?.(() => {});
  });
}
