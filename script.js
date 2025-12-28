document.addEventListener('DOMContentLoaded', () => {
    // --- 定数定義 ---
    const API_ACCESS_TOKEN = 'stzjsste7nc0cvkirknr8dylepy6bjgkgbuxn2i0av7r4r6186gregrz645w7331';
    const API_BASE_URL = 'https://api.odpt.org/api/v4/';

    const RUSH_ALERT_SPEEDS = {
        walk: 1.4, // 歩く速度 (m/s)
        run: 4.0,  // 走る速度 (m/s)
    };
    const DAY_TYPES = {
        WEEKDAY: 'weekday',
        HOLIDAY: 'holiday',
    };

    // --- DOM要素の取得 ---
    const elements = {
        body: document.body,
        themeSwitcherButtons: document.querySelectorAll('#theme-switcher button'),
        searchBox: document.getElementById('search-box'),
        searchResults: document.getElementById('search-results'),
        searchType: document.getElementById('search-type'), // New
        stationName: document.getElementById('station-name'),
        direction: document.getElementById('direction'),
        lineSelector: document.getElementById('line-selector'),
        timer: document.getElementById('timer'),
        timetableBody: document.querySelector('#timetable tbody'),
        dayButtons: document.querySelectorAll('.selectors button'),
        rushAlert: document.getElementById('rush-alert'),
        alertMessage: document.querySelector('.alert-message'),
        emergencyLabel: document.querySelector('.emergency-label'),
        nextTrainType: document.getElementById('next-train-type'),
        nextTrainDestination: document.getElementById('next-train-destination'),
        debugSafe: document.getElementById('debug-safe'),
        debugWarning: document.getElementById('debug-warning'),
        debugDanger: document.getElementById('debug-danger'),
        timetableWrapper: document.querySelector('.timetable-wrapper'),
        timetableHeader: document.getElementById('timetable-header'),
        toggleIcon: document.querySelector('.toggle-icon'),
    };

    // --- アプリケーション本体 ---
    const app = {
        // --- 状態管理 ---
        stationCache: {}, 
        currentStation: null, 
        currentTimetable: [], 
        currentDayType: DAY_TYPES.WEEKDAY,
        // 新しい状態：現在表示している路線の情報
        currentLine: { railway: null, direction: null },
        countdownInterval: null,
        nextTrain: null,
        isTimetableCollapsed: false,

        // --- API通信 ---
        async fetchFromApi(endpoint, params = {}) {
            const url = new URL(API_BASE_URL + endpoint);
            url.searchParams.append('acl:consumerKey', API_ACCESS_TOKEN);
            for (const key in params) {
                url.searchParams.append(key, params[key]);
            }
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 403) console.error("APIキーが無効、またはアクセスが拒否されました。");
                    if (response.status >= 400 && response.status < 500) return [];
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }
                return await response.json();
            } catch (error) {
                console.error(`API call to ${endpoint} failed:`, error);
                elements.stationName.textContent = "データ取得エラー";
                return null;
            }
        },

        // --- 初期化 ---
        async initialize() {
            this.setupEventListeners();
            this.loadTheme();
            this.loadTimetableState();
            
            const defaultStationTitle = '渋谷';
            const stations = await this.fetchFromApi('odpt:Station', { 'dc:title': defaultStationTitle });
            if (stations && stations.length > 0) {
                const groupedStations = {};
                stations.forEach(station => {
                    const title = station['dc:title'];
                    if (!groupedStations[title]) {
                        groupedStations[title] = {
                            ids: [],
                            latitude: station['geo:lat'],
                            longitude: station['geo:long'],
                            operator: station['odpt:operator'].split('.').pop()
                        };
                    }
                    groupedStations[title].ids.push(station['owl:sameAs']);
                });
                this.stationCache = groupedStations;
                await this.changeStation(defaultStationTitle);
            } else {
                elements.stationName.textContent = "駅を検索してください";
            }
        },

        // --- 駅選択後の処理 ---
        async changeStation(stationTitle, railwayId = null) {
            const stationGroup = this.stationCache[stationTitle];
            if (!stationGroup) return;

            elements.stationName.textContent = stationTitle;
            elements.direction.textContent = '時刻表を検索中...';
            elements.lineSelector.innerHTML = '';
            elements.timetableBody.innerHTML = '';
            elements.timer.textContent = "--:--";
            elements.searchBox.value = '';
            elements.searchResults.innerHTML = '';
            elements.searchResults.style.display = 'none';
            clearInterval(this.countdownInterval);

            let timetables = [];
            for (const stationId of stationGroup.ids) {
                let params = { 'odpt:station': stationId };
                if (railwayId) {
                    params['odpt:railway'] = railwayId;
                }
                const result = await this.fetchFromApi('odpt:StationTimetable', params);
                if (result && result.length > 0) {
                    timetables.push(...result);
                }
            }
            
            this.currentStation = {
                title: stationTitle,
                latitude: stationGroup.latitude,
                longitude: stationGroup.longitude,
                timetables: timetables
            };

            if (timetables.length === 0) {
                elements.direction.textContent = '時刻表データがありません';
                return;
            }

            const uniqueLines = this.getUniqueLines(timetables);

            if (uniqueLines.length === 1) {
                const line = uniqueLines[0];
                this.displayTimetableForLine(line.railway, line.direction);
            } else {
                this.renderLineSelector(uniqueLines);
            }
        },

        getUniqueLines(timetables) {
            const lines = new Map();
            timetables.forEach(table => {
                const railway = table['odpt:railway'];
                const direction = table['odpt:railDirection'];
                const key = `${railway}-${direction}`;
                if (!lines.has(key)) {
                    lines.set(key, {
                        railway: railway,
                        direction: direction,
                        railwayTitle: table['odpt:railwayTitle']?.ja || direction?.split('.').pop(),
                        directionTitle: direction?.split('.').pop()
                    });
                }
            });
            return Array.from(lines.values());
        },

        // --- 路線選択UIの描画 ---
        renderLineSelector(uniqueLines) {
            elements.direction.textContent = '路線・方面を選択してください';
            elements.lineSelector.innerHTML = '';
            uniqueLines.forEach(line => {
                const button = document.createElement('button');
                button.textContent = `${line.railwayTitle} (${line.directionTitle})`;
                button.addEventListener('click', () => this.displayTimetableForLine(line.railway, line.direction));
                elements.lineSelector.appendChild(button);
            });
        },

        // --- 時刻表の表示 ---
        displayTimetableForLine(railway, direction) {
            this.currentLine = { railway, direction }; // 現在の路線を記憶
            const calendarKey = this.currentDayType === DAY_TYPES.WEEKDAY ? "odpt.Calendar:Weekday" : "odpt.Calendar:Holiday";

            const timetableData = this.currentStation.timetables.find(table => 
                table['odpt:railway'] === railway && 
                table['odpt:railDirection'] === direction &&
                table['odpt:calendar'] === calendarKey
            );

            if (!timetableData || !timetableData['odpt:stationTimetableObject']) {
                elements.timetableBody.innerHTML = `<tr><td colspan="3">選択された曜日の時刻表データがありません。</td></tr>`;
                elements.direction.textContent = 'データがありません';
                elements.timer.textContent = "--:--";
                clearInterval(this.countdownInterval);
                return;
            }

            this.currentTimetable = timetableData['odpt:stationTimetableObject'].map(obj => {
                const time = obj['odpt:departureTime'].split(':');
                return {
                    hour: parseInt(time[0], 10),
                    minute: parseInt(time[1], 10),
                    type: obj['odpt:trainType']?.split('.').pop(),
                    destination: obj['odpt:destinationStation']?.[0]?.split('.').pop() || '---'
                };
            });
            
            const title = timetableData['odpt:railwayTitle']?.ja || '';
            const dir = timetableData['odpt:railDirection'] ? `(${timetableData['odpt:railDirection'].split('.').pop()})` : '';
            elements.direction.textContent = `${title} ${dir}`;
            elements.lineSelector.innerHTML = '';

            this.renderTimetable();
            this.startCountdown();
            this.updateRushAlert();
        },

        // --- 描画関連 ---
        renderTimetable() {
            elements.timetableBody.innerHTML = '';
            if (!this.currentTimetable || this.currentTimetable.length === 0) {
                elements.timetableBody.innerHTML = `<tr><td colspan="3">本日分の運行は終了、またはデータがありません。</td></tr>`;
                return;
            }

            this.currentTimetable.forEach(train => {
                const row = document.createElement('tr');
                row.innerHTML = `<td>${train.type}</td><td>${train.destination}</td><td>${String(train.hour).padStart(2, '0')}:${String(train.minute).padStart(2, '0')}</td>`;
                elements.timetableBody.appendChild(row);
            });
        },

        // --- カウントダウン関連 ---
        startCountdown() {
            clearInterval(this.countdownInterval);
            this.updateCountdown();
            this.countdownInterval = setInterval(() => this.updateCountdown(), 1000);
        },

        findNextTrain(now) {
            if (!this.currentTimetable || this.currentTimetable.length === 0) {
                return { train: null };
            }
            const foundTrain = this.currentTimetable.find(train => {
                const trainTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), train.hour, train.minute, 0);
                return trainTime > now;
            });
            return { train: foundTrain || this.currentTimetable[0] };
        },

        updateCountdown() {
            if (!this.currentStation) return;
            
            const now = new Date();
            const { train }_ = this.findNextTrain(now);
            this.nextTrain = train;

            if (this.nextTrain) {
                const nextTrainDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), this.nextTrain.hour, this.nextTrain.minute, 0);
                if (nextTrainDate < now) {
                    nextTrainDate.setDate(nextTrainDate.getDate() + 1);
                }

                const diff = nextTrainDate - now;
                const hours = Math.floor(diff / 3600000);
                const minutes = Math.floor((diff / 60000) % 60);
                const seconds = Math.floor((diff / 1000) % 60);

                elements.timer.textContent = hours > 0
                    ? `${hours}時間${minutes}分`
                    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                
                elements.nextTrainType.textContent = this.nextTrain.type;
                elements.nextTrainDestination.textContent = `${this.nextTrain.destination}行き`;
            } else {
                elements.timer.textContent = "--:--";
                elements.nextTrainType.textContent = "本日の";
                elements.nextTrainDestination.textContent = "運行は終了しました";
                clearInterval(this.countdownInterval);
            }
        },

        // --- 駆け込みアラート関連 ---
        updateRushAlert() {
            if (!navigator.geolocation || !this.nextTrain || !this.currentStation) {
                elements.rushAlert.classList.remove('visible');
                return;
            }
            
            const nextTrainDate = new Date();
            nextTrainDate.setHours(this.nextTrain.hour, this.nextTrain.minute, 0, 0);
            if (nextTrainDate < new Date()) {
                nextTrainDate.setDate(nextTrainDate.getDate() + 1);
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLon = position.coords.longitude;
                    const distance = this.calculateDistance(userLat, userLon, this.currentStation.latitude, this.currentStation.longitude);
                    const timeToDeparture = (nextTrainDate - new Date()) / 1000;
                    this.showRushAlert(distance, timeToDeparture);
                },
                (error) => {
                    console.warn("現在地を取得できませんでした:", error.message);
                    elements.alertMessage.textContent = '現在地をONにすると、間に合うか判定できます';
                    elements.emergencyLabel.textContent = '';
                    elements.rushAlert.className = 'rush-alert';
                    elements.rushAlert.classList.add('visible');
                }
            );
        },

        calculateDistance(lat1, lon1, lat2, lon2) {
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
        },

        showRushAlert(distance, timeToDeparture) {
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

            elements.alertMessage.textContent = message;
            elements.rushAlert.className = `rush-alert ${alertClass} visible`;

            const currentTheme = localStorage.getItem('rushRunnerTheme');
            if (currentTheme === 'nerv' && alertClass === 'danger') {
                elements.emergencyLabel.textContent = 'EMERGENCY';
            } else {
                elements.emergencyLabel.textContent = '';
            }
        },

        // --- UI状態管理 ---
        setTheme(themeName) {
            elements.body.className = `theme-${themeName}`;
            elements.themeSwitcherButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === themeName);
            });
            localStorage.setItem('rushRunnerTheme', themeName);
        },

        loadTheme() {
            const savedTheme = localStorage.getItem('rushRunnerTheme');
            this.setTheme(savedTheme || 'light');
        },

        toggleTimetable(isCollapsed = !this.isTimetableCollapsed) {
            this.isTimetableCollapsed = isCollapsed;
            elements.timetableWrapper.classList.toggle('collapsed', this.isTimetableCollapsed);
            elements.toggleIcon.textContent = this.isTimetableCollapsed ? '▶' : '▼';
            localStorage.setItem('timetableCollapsed', this.isTimetableCollapsed);
        },

        loadTimetableState() {
            const savedState = localStorage.getItem('timetableCollapsed') === 'true';
            this.toggleTimetable(savedState);
        },

        // --- イベントリスナー設定 ---
        setupEventListeners() {
            let searchTimer;
            elements.searchBox.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => this.handleSearch(), 300);
            });

            elements.searchType.addEventListener('change', () => {
                elements.searchBox.value = '';
                elements.searchResults.innerHTML = '';
                elements.searchResults.style.display = 'none';
                const searchType = elements.searchType.value;
                let placeholder = '';
                switch (searchType) {
                    case 'station':
                        placeholder = '駅名を入力 (例: 渋谷)';
                        break;
                    case 'railway':
                        placeholder = '路線名を入力 (例: 山手線)';
                        break;
                    case 'operator':
                        placeholder = '事業者名を入力 (例: JR東日本)';
                        break;
                }
                elements.searchBox.placeholder = placeholder;
                this.handleSearch(); // Trigger search on type change
            });

            elements.dayButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    this.currentDayType = e.target.dataset.day;
                    elements.dayButtons.forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    if (this.currentStation && this.currentLine.railway) {
                        this.displayTimetableForLine(this.currentLine.railway, this.currentLine.direction);
                    }
                });
            });

            elements.themeSwitcherButtons.forEach(button => {
                button.addEventListener('click', (e) => this.setTheme(e.target.dataset.theme));
            });

            elements.timetableHeader.addEventListener('click', () => this.toggleTimetable());

            elements.debugSafe.addEventListener('click', () => this.showRushAlert(200, 600));
            elements.debugWarning.addEventListener('click', () => this.showRushAlert(500, 180));
            elements.debugDanger.addEventListener('click', () => this.showRushAlert(1000, 60));
        },

        async handleSearch() {
            const query = elements.searchBox.value.trim();
            const type = elements.searchType.value;

            if ((type === 'station' || type === 'railway') && query.length < 1) {
                elements.searchResults.innerHTML = '';
                elements.searchResults.style.display = 'none';
                return;
            }

            let endpoint = '';
            let params = {};
            if (query) {
                params['dc:title'] = query;
            }

            switch (type) {
                case 'station':
                    endpoint = 'odpt:Station';
                    break;
                case 'railway':
                    endpoint = 'odpt:Railway';
                    break;
                case 'operator':
                    endpoint = 'odpt:Operator';
                    break;
            }

            const results = await this.fetchFromApi(endpoint, params);
            this.displaySearchResults(results, type);
        },

        displaySearchResults(results, type, context = {}) {
            elements.searchResults.innerHTML = '';
            this.stationCache = {}; // Reset station cache

            if (!results || results.length === 0) {
                elements.searchResults.style.display = 'none';
                return;
            }

            if (type === 'station') {
                const groupedStations = {};
                results.forEach(station => {
                    const title = station['dc:title'];
                    if (!groupedStations[title]) {
                        groupedStations[title] = {
                            ids: [],
                            latitude: station['geo:lat'],
                            longitude: station['geo:long'],
                            operator: station['odpt:operator'].split('.').pop()
                        };
                    }
                    groupedStations[title].ids.push(station['owl:sameAs']);
                });
                this.stationCache = groupedStations;

                Object.keys(groupedStations).forEach(title => {
                    const stationGroup = groupedStations[title];
                    const li = document.createElement('li');
                    li.textContent = `[駅] ${title} (${stationGroup.operator})`;
                    li.dataset.stationTitle = title;
                    li.addEventListener('click', () => this.changeStation(title, context.railway));
                    elements.searchResults.appendChild(li);
                });
            } else if (type === 'railway') {
                results.forEach(railway => {
                    const title = railway['dc:title'];
                    const operator = railway['odpt:operator'].split('.').pop();
                    const li = document.createElement('li');
                    li.textContent = `[路線] ${title} (${operator})`;
                    li.addEventListener('click', async () => {
                        const stations = await this.fetchFromApi('odpt:Station', { 'odpt:railway': railway['owl:sameAs'] });
                        this.displaySearchResults(stations, 'station', { railway: railway['owl:sameAs'] });
                    });
                    elements.searchResults.appendChild(li);
                });
            } else if (type === 'operator') {
                results.forEach(operator => {
                    const title = operator['dc:title'];
                    const li = document.createElement('li');
                    li.textContent = `[事業者] ${title}`;
                    li.addEventListener('click', async () => {
                        const railways = await this.fetchFromApi('odpt:Railway', { 'odpt:operator': operator['owl:sameAs'] });
                        this.displaySearchResults(railways, 'railway');
                    });
                    elements.searchResults.appendChild(li);
                });
            }

            elements.searchResults.style.display = 'block';
        }
    };

    app.initialize();
});