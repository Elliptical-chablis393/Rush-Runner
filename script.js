
document.addEventListener('DOMContentLoaded', () => {
    // --- 定数定義 ---
    const RUSH_ALERT_SPEEDS = {
        walk: 1.4, // 歩く速度 (m/s)
        run: 4.0,  // 走る速度 (m/s)
    };

    // --- DOM要素の取得 ---
    const bodyElement = document.body;
    const themeSwitcherButtons = document.querySelectorAll('#theme-switcher button');
    const searchBox = document.getElementById('search-box');
    const searchResults = document.getElementById('search-results');
    const stationNameElement = document.getElementById('station-name');
    const directionElement = document.getElementById('direction');
    const timerElement = document.getElementById('timer');
    const timetableBody = document.querySelector('#timetable tbody');
    const dayButtons = document.querySelectorAll('.selectors button');
    const rushAlertElement = document.getElementById('rush-alert');
    const nextTrainTypeElement = document.getElementById('next-train-type');
    const nextTrainDestinationElement = document.getElementById('next-train-destination');

    // --- アプリケーションの状態管理 ---
    let stationData = {};
    let currentStationId = '';
    let currentDayType = 'weekday';
    let countdownInterval;
    let nextTrain = null; // 次の電車オブジェクトを保持

    // --- 関数定義 ---

    async function initializeApp() {
        try {
            const response = await fetch('./stations.json');
            stationData = await response.json();
            const initialStationId = Object.keys(stationData)[0];
            if (initialStationId) {
                changeStation(initialStationId);
            }
        } catch (error) {
            console.error("時刻表データの読み込みに失敗しました:", error);
            stationNameElement.textContent = "データ読込エラー";
        }
    }

    function changeStation(stationId) {
        currentStationId = stationId;
        const station = stationData[stationId];
        if (!station) return;

        stationNameElement.textContent = station.stationName;
        directionElement.textContent = station.lineName;
        searchBox.value = '';
        searchResults.innerHTML = '';
        searchResults.style.display = 'none';

        renderTimetable();
        startCountdown();
        updateRushAlert();
    }

    function renderTimetable() {
        timetableBody.innerHTML = '';
        if (!currentStationId) return;
        const trains = stationData[currentStationId].timetable[currentDayType];
        if (!trains) return;

        trains.forEach(train => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${train.type}</td><td>${train.destination}</td><td>${String(train.hour).padStart(2, '0')}:${String(train.minute).padStart(2, '0')}</td>`;
            timetableBody.appendChild(row);
        });
    }

    function startCountdown() {
        clearInterval(countdownInterval);
        updateCountdown();
        countdownInterval = setInterval(updateCountdown, 1000);
    }

    function updateCountdown() {
        if (!currentStationId) return;
        const now = new Date();
        const trains = stationData[currentStationId].timetable[currentDayType];
        
        nextTrain = null;
        if (trains && trains.length > 0) {
            for (const train of trains) {
                const trainTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), train.hour, train.minute, 0);
                if (trainTime > now) {
                    nextTrain = train;
                    break;
                }
            }
        }

        if (nextTrain === null) {
            // 今日の終電が行ってしまった場合、翌日の始発を探す
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);
            const dayOfWeek = tomorrow.getDay(); // 0:日曜, 6:土曜
            const nextDayType = (dayOfWeek === 0 || dayOfWeek === 6) ? 'holiday' : 'weekday';
            const nextDayTrains = stationData[currentStationId].timetable[nextDayType];

            if (nextDayTrains && nextDayTrains.length > 0) {
                nextTrain = nextDayTrains[0];
                // 翌日のダイヤタイプが現在と違う場合は、UIを更新
                if (nextDayType !== currentDayType) {
                    currentDayType = nextDayType;
                    document.querySelector(`.selectors button[data-day="${nextDayType}"]`).classList.add('active');
                    document.querySelector(`.selectors button[data-day="${currentDayType === 'weekday' ? 'holiday' : 'weekday'}"]`).classList.remove('active');
                    renderTimetable();
                }
            }
        }

        if (nextTrain) {
            const nextTrainDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), nextTrain.hour, nextTrain.minute, 0);
            // 終電後の場合、日付を1日進める
            if (nextTrainDate < now) {
                nextTrainDate.setDate(nextTrainDate.getDate() + 1);
            }

            const diff = nextTrainDate - now;
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff / 60000) % 60);
            const seconds = Math.floor((diff / 1000) % 60);

            timerElement.textContent = hours > 0
                ? `${hours}時間${minutes}分`
                : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            nextTrainTypeElement.textContent = nextTrain.type;
            nextTrainDestinationElement.textContent = `${nextTrain.destination}行き`;

        } else {
            timerElement.textContent = "--:--";
            nextTrainTypeElement.textContent = "本日の";
            nextTrainDestinationElement.textContent = "運行は終了しました";
            clearInterval(countdownInterval);
        }
    }

    function updateRushAlert() {
        if (!navigator.geolocation || !nextTrain) {
            rushAlertElement.classList.remove('visible');
            return;
        }
        
        const nextTrainDate = new Date();
        nextTrainDate.setHours(nextTrain.hour, nextTrain.minute, 0, 0);
        if (nextTrainDate < new Date()) {
            nextTrainDate.setDate(nextTrainDate.getDate() + 1);
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLon = position.coords.longitude;
                const station = stationData[currentStationId];
                const stationLat = station.latitude;
                const stationLon = station.longitude;

                const distance = calculateDistance(userLat, userLon, stationLat, stationLon);
                const timeToDeparture = (nextTrainDate - new Date()) / 1000;

                showRushAlert(distance, timeToDeparture);
            },
            (error) => {
                console.warn("現在地を取得できませんでした:", error.message);
                rushAlertElement.textContent = '現在地をONにすると、間に合うか判定できます';
                rushAlertElement.className = 'rush-alert'; // ステータスclassをリセット
                rushAlertElement.classList.add('visible');
            }
        );
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaPhi = (lat2 - lat1) * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function showRushAlert(distance, timeToDeparture) {
        const timeToWalk = distance / RUSH_ALERT_SPEEDS.walk;
        const timeToRun = distance / RUSH_ALERT_SPEEDS.run;

        let message = '';
        let alertClass = '';

        if (timeToDeparture > timeToWalk + 60) {
            message = `🚶 余裕です！ (駅まで徒歩 約${Math.ceil(timeToWalk / 60)}分)`;
            alertClass = 'safe';
        } else if (timeToDeparture > timeToRun + 10) {
            message = `🏃‍♂️ ダッシュで間に合うかも！ (駅まで走って 約${Math.ceil(timeToRun / 60)}分)`;
            alertClass = 'warning';
        } else {
            message = `😭 次の電車を狙いましょう…`;
            alertClass = 'danger';
        }

        rushAlertElement.textContent = message;
        rushAlertElement.className = `rush-alert ${alertClass} visible`;
    }

    function setTheme(themeName) {
        bodyElement.className = `theme-${themeName}`;
        themeSwitcherButtons.forEach(btn => {
            if (btn.dataset.theme === themeName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        localStorage.setItem('rushRunnerTheme', themeName);
    }

    // --- イベントリスナー設定 ---
    searchBox.addEventListener('input', () => {
        const query = searchBox.value.toLowerCase();
        searchResults.innerHTML = '';
        if (query.length === 0) {
            searchResults.style.display = 'none';
            return;
        }
        const matchedStations = Object.keys(stationData).filter(id => stationData[id].stationName.toLowerCase().includes(query));
        if (matchedStations.length > 0) {
            matchedStations.forEach(id => {
                const li = document.createElement('li');
                li.textContent = stationData[id].stationName;
                li.dataset.stationId = id;
                li.addEventListener('click', () => changeStation(id));
                searchResults.appendChild(li);
            });
            searchResults.style.display = 'block';
        } else {
            searchResults.style.display = 'none';
        }
    });

    dayButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            dayButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentDayType = e.target.dataset.day;
            renderTimetable();
            startCountdown();
            updateRushAlert();
        });
    });

    themeSwitcherButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const selectedTheme = e.target.dataset.theme;
            setTheme(selectedTheme);
        });
    });

    // --- 試験用ボタンのイベントリスナー ---
    document.getElementById('debug-safe').addEventListener('click', () => {
        // 余裕な状況: 駅まで200m, 電車まで10分(600秒)
        showRushAlert(200, 600);
    });

    document.getElementById('debug-warning').addEventListener('click', () => {
        // 走れば間に合う状況: 駅まで500m, 電車まで3分(180秒)
        showRushAlert(500, 180);
    });

    document.getElementById('debug-danger').addEventListener('click', () => {
        // 間に合わない状況: 駅まで1000m, 電車まで1分(60秒)
        showRushAlert(1000, 60);
    });

    // --- アプリケーション実行 ---
    const savedTheme = localStorage.getItem('rushRunnerTheme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        setTheme('glass'); // デフォルトテーマ
    }

    initializeApp();
});
