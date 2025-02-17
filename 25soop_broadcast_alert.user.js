// ==UserScript==
// @name         SOOP 방송 알림
// @namespace    http://tampermonkey.net/
// @version      154
// @description  사용자가 등록한 아프리카 숲 스트리머의 방송 상태를 확인하여 알림을 제공합니다.
// @author       che_dd_hyuji
// @match        *://play.sooplive.co.kr/*
// @match        *://www.sooplive.co.kr/*
// @match        *://vod.sooplive.co.kr/*
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @connect      live.afreecatv.com
// ==/UserScript==

(async function() {
    'use strict';

    const BROADCASTER_LIST_KEY = 'broadcasterList'; // { id: string, name: string } 형태로 저장
    const ALERT_INTERVAL_KEY = 'alertInterval';
    const NOTIFICATIONS_ENABLED_KEY = 'notificationsEnabled';
    let alertInterval = await GM.getValue(ALERT_INTERVAL_KEY, 300000); // 기본 5분

    // 알림 권한 요청
    async function ensureNotificationPermission() {
        const hasRequested = await GM.getValue("hasRequestedNotificationPermission", false);
        if (hasRequested) return;
        Notification.requestPermission().then((permission) => {
            GM.setValue("hasRequestedNotificationPermission", true);
            console.log("Notification permission:", permission);
        });
    }
    await ensureNotificationPermission();

    // 스트리머 목록 저장 및 불러오기 함수
    async function getBroadcasterList() {
        return await GM.getValue(BROADCASTER_LIST_KEY, []);
    }
    async function setBroadcasterList(list) {
        await GM.setValue(BROADCASTER_LIST_KEY, list);
    }

    // 스트리머 추가 함수
    async function addBroadcaster() {
        let broadcasterId = prompt("알림을 받을 스트리머의 ID를 입력하세요:");
        if (broadcasterId) {
            let broadcasterName = prompt("해당 스트리머의 이름을 입력하세요:");
            if (!broadcasterName) {
                alert("스트리머 이름이 필요합니다.");
                return;
            }
            let list = await getBroadcasterList();
            if (!list.some(b => b.id === broadcasterId)) {
                list.push({ id: broadcasterId, name: broadcasterName });
                await setBroadcasterList(list);
                alert(`스트리머 "${broadcasterName}" (${broadcasterId})이(가) 등록되었습니다.`);
            } else {
                alert("이미 등록된 스트리머입니다.");
            }
        }
    }

    // 스트리머 관리 함수
    async function manageBroadcasters() {
        let list = await getBroadcasterList();
        if (list.length === 0) {
            alert("등록된 스트리머가 없습니다.");
            return;
        }
        let message = "등록된 스트리머 목록:\n" +
                      list.map(b => `${b.name} (${b.id})`).join("\n") +
                      "\n\n삭제할 스트리머의 ID를 입력하거나, 취소를 누르세요:";
        let toRemove = prompt(message);
        if (toRemove) {
            const newList = list.filter(b => b.id !== toRemove);
            await setBroadcasterList(newList);
            alert(`스트리머 "${toRemove}"의 등록이 해제되었습니다.`);
        }
    }

    // 방송 상태 체크 함수 (AfecatV API 호출)
    async function fetchAfreecaLive(afreecaId) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: "POST",
                url: "https://live.afreecatv.com/afreeca/player_live_api.php",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                data: "bid=" + encodeURIComponent(afreecaId),
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const chan = data.CHANNEL;
                        if (!chan) return reject("No channel for " + afreecaId);
                        if (chan.RESULT === 1) {
                            resolve({
                                online: true,
                                title: chan.TITLE || ''
                            });
                        } else {
                            resolve({ online: false });
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function(err) {
                    reject(err);
                }
            });
        });
    }

    const broadcastState = {};
    
    async function checkBroadcasts() {
        let broadcasterList = await getBroadcasterList();
        if (!broadcasterList || broadcasterList.length === 0) {
            console.log("등록된 스트리머가 없습니다.");
            return;
        }

        const notificationsEnabled = await GM.getValue(NOTIFICATIONS_ENABLED_KEY, true);

        for (const broadcaster of broadcasterList) {
            try {
                const info = await fetchAfreecaLive(broadcaster.id);
                if (info.online && (!broadcastState[broadcaster.id] || broadcastState[broadcaster.id] === false)) {
                    broadcastState[broadcaster.id] = true;

                    if (notificationsEnabled) {
                        GM_notification({
                            title: `방송 알림: ${broadcaster.name}`,
                            text: `${broadcaster.name} (${broadcaster.id})님이 방송 중입니다!\n제목: ${info.title}`,
                            timeout: 5000,
                            onclick: () => window.focus()
                        });
                    }
                } else if (!info.online && broadcastState[broadcaster.id]) {
                    broadcastState[broadcaster.id] = false;
                }
            } catch (error) {
                console.error(`스트리머 ${broadcaster.id} 정보 가져오기 실패:`, error);
            }
        }
    }

    // 메뉴 명령 추가
    GM_registerMenuCommand("스트리머 추가", addBroadcaster);
    GM_registerMenuCommand("등록된 스트리머 관리", manageBroadcasters);

    // 주기적으로 방송 상태 확인
    setInterval(checkBroadcasts, alertInterval);

})();
