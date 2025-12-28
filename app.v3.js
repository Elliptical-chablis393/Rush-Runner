document.addEventListener('DOMContentLoaded', () => {
    console.log('RushRunner script loaded v=20250925-API-METRO');
    // --- 定数定義 ---
    const RUSH_ALERT_SPEEDS = {
        walk: 1.4, // 歩く速度 (m/s)
        run: 4.0,  // 走る速度 (m/s)
    };

    // --- DOM要素の取得 ---
    const elements = {
        body: document.body,
        themeSwitcherButtons: document.querySelectorAll('#theme-switcher button'),
        searchBox: document.getElementById('search-box'),
        searchResults: document.getElementById('search-results'),
        stationName: document.getElementById('station-name'),
        direction: document.getElementById('direction'),
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
        settingsToggle: document.getElementById('settings-toggle'),
        settingsOverlay: document.getElementById('settings-overlay'),
        bufferInput: document.getElementById('buffer-input'),
        saveSettings: document.getElementById('save-settings'),
        closeSettings: document.getElementById('close-settings'),
        directionSelect: document.getElementById('direction-select'),
    };

    // --- アプリケーション本体 ---
    const app = {
        // --- 状態管理 ---
        currentStation: null, // 現在表示している駅の全データ
        currentDayType: 'weekday',
        countdownInterval: null,
        nextTrain: null,
        isTimetableCollapsed: false,
        _lastRushAlertUpdate: 0,
        _searchTimeout: null,
        bufferTime: 0, // 駅構内移動時間 (分)
        currentDirection: null, // 選択中の方面

        // --- 初期化 ---
        async initialize() {
            this.setupEventListeners();
            this.loadTheme();
            this.loadTimetableState();
            this.loadSettings();

            const today = new Date();
            const dow = today.getDay();
            this.currentDayType = (dow === 0 || dow === 6) ? 'holiday' : 'weekday';
            elements.dayButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.day === this.currentDayType));

            // 保存された駅があればそれを読み込む、なければ初期値（渋谷）
            const savedStationId = localStorage.getItem('rushRunnerLastStation');
            const defaultStationId = 'odpt.Station:TokyoMetro.Ginza.Shibuya';

            this.changeStation(savedStationId || defaultStationId);
        },

        // --- 駅検索 (API) ---
        searchStations(query) {
            clearTimeout(this._searchTimeout);
            if (!query.trim()) {
                elements.searchResults.innerHTML = '';
                elements.searchResults.style.display = 'none';
                return;
            }

            this._searchTimeout = setTimeout(async () => {
                try {
                    const response = await fetch(`/api/stations?name=${encodeURIComponent(query)}`);
                    const stations = await response.json();

                    elements.searchResults.innerHTML = '';
                    if (stations.length > 0) {
                        elements.searchResults.style.display = 'block';
                        stations.forEach(station => {
                            const li = document.createElement('li');
                            // 路線IDから可読な部分を抽出 (例: odpt.Railway:TokyoMetro.Ginza -> TokyoMetro.Ginza)
                            // さらにシンプルに "Ginza" だけでも良いが、一旦は短縮形で表示
                            const lineName = station.line.replace('odpt.Railway:', '').split('.').pop();
                            li.textContent = `${station.name} (${lineName})`;
                            li.dataset.stationId = station.id;
                            li.addEventListener('click', () => {
                                this.changeStation(station.id);
                            });
                            elements.searchResults.appendChild(li);
                        });
                    } else {
                        elements.searchResults.style.display = 'none';
                    }
                } catch (error) {
                    console.error('駅検索でエラーが発生しました:', error);
                }
            }, 300); // 300msのデバウンス
        },

        // --- 駅の変更 ---
        async changeStation(stationId) {
            try {
                const response = await fetch(`/api/timetable/${stationId}`);
                this.currentStation = await response.json();
                if (!this.currentStation) return;

                elements.stationName.textContent = this.currentStation.stationName;
                elements.direction.textContent = this.currentStation.lineName;
                elements.searchBox.value = '';
                elements.searchResults.innerHTML = '';
                elements.searchResults.style.display = 'none';

                // 駅IDを保存
                localStorage.setItem('rushRunnerLastStation', stationId);

                // 方面セレクタを更新
                this.populateDirectionSelector();

                this.renderTimetable();
                this.startCountdown();

                // 運行情報の取得と表示更新
                const railwayId = this.currentStation.line;
                if (railwayId) {
                    this.updateTrainInfo(railwayId);
                } else {
                    console.warn('Railway ID not found for station:', this.currentStation);
                }

                this.updateRushAlert();
            } catch (error) {
                console.error('Change station error:', error);
                alert('駅データの読み込みに失敗しました。');
            }
        },

        // --- 運行情報取得・表示 ---
        async updateTrainInfo(railwayId) {
            const container = document.getElementById('train-info-container') || this.createTrainInfoContainer();
            container.innerHTML = '<span class="loading">運行情報確認中...</span>';
            container.className = 'train-info'; // Reset class

            try {
                const res = await fetch(`/api/info?railway=${encodeURIComponent(railwayId)}`);
                const data = await res.json();

                if (data && data.length > 0) {
                    const info = data[0];
                    const statusText = info['odpt:trainInformationText']?.ja || '情報なし';
                    container.textContent = `【運行情報】 ${statusText}`;

                    // 単純なキーワード判定で色を変える
                    if (statusText.includes('遅れ') || statusText.includes('見合わせ')) {
                        container.classList.add('warning');
                    } else if (statusText.includes('平常')) {
                        container.classList.add('normal');
                    }
                } else {
                    container.textContent = '運行情報: データなし';
                }
            } catch (e) {
                console.error('Failed to fetch train info', e);
                container.textContent = '運行情報: 取得失敗';
            }
        },

        createTrainInfoContainer() {
            const header = document.querySelector('header');
            const div = document.createElement('div');
            div.id = 'train-info-container';
            div.className = 'train-info';
            // ヘッダータイトルの下に挿入
            header.insertBefore(div, header.querySelector('#station-info'));
            return div;
        },

        // --- 方面セレクタ ---
        populateDirectionSelector() {
            elements.directionSelect.innerHTML = '';
            const directions = this.currentStation.directions || [];

            if (directions.length === 0) {
                elements.directionSelect.style.display = 'none';
                return;
            }

            elements.directionSelect.style.display = 'inline-block';

            directions.forEach((dir, index) => {
                const option = document.createElement('option');
                option.value = dir;
                // 方面名を日本語化（簡易マッピング）
                const directionNames = {
                    'Shibuya': '渋谷方面',
                    'Asakusa': '浅草方面',
                    'Ikebukuro': '池袋方面',
                    'Ogikubo': '荻窪方面',
                    'KitaSenju': '北千住方面',
                    'NakaMeguro': '中目黒方面',
                    'RailDirection:Eastbound': '東行',
                    'RailDirection:Westbound': '西行'
                };
                option.textContent = directionNames[dir] || dir;
                elements.directionSelect.appendChild(option);
            });

            // 保存された方面があれば選択
            const savedDirection = localStorage.getItem('rushRunnerDirection');
            if (savedDirection && directions.includes(savedDirection)) {
                this.currentDirection = savedDirection;
                elements.directionSelect.value = savedDirection;
            } else {
                this.currentDirection = directions[0];
            }
        },

        // --- 描画関連 ---
        renderTimetable() {
            elements.timetableBody.innerHTML = '';
            if (!this.currentStation) return;

            // 方面別時刻表から現在の方面を取得
            const timetableByDir = this.currentStation.timetableByDirection;
            const currentTimetable = timetableByDir
                ? timetableByDir[this.currentDirection]
                : this.currentStation.timetable;

            if (!currentTimetable) return;
            const trains = currentTimetable[this.currentDayType];
            if (!trains) return;

            trains.forEach(train => {
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

        updateCountdown() {
            if (!this.currentStation) return;
            const now = new Date();

            // 方面別時刻表から現在の方面を取得
            const timetableByDir = this.currentStation.timetableByDirection;
            const currentTimetable = timetableByDir
                ? timetableByDir[this.currentDirection]
                : this.currentStation.timetable;

            if (!currentTimetable) return;
            const trains = currentTimetable[this.currentDayType];

            this.nextTrain = null;
            if (trains && trains.length > 0) {
                for (const train of trains) {
                    const trainTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), train.hour, train.minute, 0);
                    if (trainTime > now) {
                        this.nextTrain = train;
                        break;
                    }
                }
            }

            if (this.nextTrain === null && trains && trains.length > 0) {
                const tomorrow = new Date(now);
                tomorrow.setDate(now.getDate() + 1);
                const dayOfWeek = tomorrow.getDay();
                const nextDayType = (dayOfWeek === 0 || dayOfWeek === 6) ? 'holiday' : 'weekday';
                const nextDayTimetable = timetableByDir
                    ? timetableByDir[this.currentDirection]
                    : this.currentStation.timetable;
                const nextDayTrains = nextDayTimetable ? nextDayTimetable[nextDayType] : null;

                if (nextDayTrains && nextDayTrains.length > 0) {
                    this.nextTrain = nextDayTrains[0];
                    if (nextDayType !== this.currentDayType) {
                        this.currentDayType = nextDayType;
                        document.querySelector(`.selectors button[data-day="${nextDayType}"]`).classList.add('active');
                        document.querySelector(`.selectors button[data-day="${this.currentDayType === 'weekday' ? 'holiday' : 'weekday'}"]`).classList.remove('active');
                        this.renderTimetable();
                    }
                }
            }

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

            this.updateRushAlert();
        },

        // --- 駆け込みアラート関連 ---
        updateRushAlert() {
            if (!this.nextTrain || !this.currentStation) {
                elements.rushAlert.classList.remove('visible');
                return;
            }
            const nowTs = Date.now();
            if (nowTs - this._lastRushAlertUpdate < 10000) {
                return;
            }
            this._lastRushAlertUpdate = nowTs;
            if (!navigator.geolocation) {
                elements.alertMessage.textContent = '現在地取得に未対応の環境です';
                elements.emergencyLabel.textContent = '';
                elements.rushAlert.className = 'rush-alert';
                elements.rushAlert.classList.add('visible');
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

            // 駅構内の移動時間を差し引く
            const effectiveTime = timeToDeparture - (this.bufferTime * 60);

            let message = '';
            let alertClass = '';

            if (effectiveTime > timeToWalk + 60) {
                message = `🚶 余裕です！ (駅まで徒歩 約${Math.ceil(timeToWalk / 60)}分)`;
                alertClass = 'safe';
            } else if (effectiveTime > timeToRun + 10) {
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

        loadSettings() {
            this.bufferTime = parseInt(localStorage.getItem('rushRunnerBuffer') || '0', 10);
            elements.bufferInput.value = this.bufferTime;
        },

        saveSettings() {
            this.bufferTime = parseInt(elements.bufferInput.value || '0', 10);
            localStorage.setItem('rushRunnerBuffer', this.bufferTime);
            elements.settingsOverlay.style.display = 'none';
            // 設定反映のためアラート更新をリセットして再実行
            this._lastRushAlertUpdate = 0;
            this.updateRushAlert();
        },

        // --- イベントリスナー設定 ---
        setupEventListeners() {
            elements.settingsToggle.addEventListener('click', () => {
                elements.settingsOverlay.style.display = 'flex';
            });

            elements.saveSettings.addEventListener('click', () => this.saveSettings());
            elements.closeSettings.addEventListener('click', () => {
                elements.settingsOverlay.style.display = 'none';
            });

            // 方面セレクタの変更
            elements.directionSelect.addEventListener('change', (e) => {
                this.currentDirection = e.target.value;
                localStorage.setItem('rushRunnerDirection', this.currentDirection);
                this.renderTimetable();
                this.startCountdown();
            });

            elements.searchBox.addEventListener('input', (e) => {
                this.searchStations(e.target.value);
            });

            elements.dayButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    elements.dayButtons.forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                    this.currentDayType = e.target.dataset.day;
                    this.renderTimetable();
                    this.startCountdown();
                    this.updateRushAlert();
                });
            });

            elements.themeSwitcherButtons.forEach(button => {
                button.addEventListener('click', (e) => this.setTheme(e.target.dataset.theme));
            });

            elements.timetableHeader.addEventListener('click', () => this.toggleTimetable());

            // --- 試験用ボタン ---
            elements.debugSafe.addEventListener('click', () => this.showRushAlert(200, 600));
            elements.debugWarning.addEventListener('click', () => this.showRushAlert(500, 180));
            elements.debugDanger.addEventListener('click', () => this.showRushAlert(1000, 60));
        }
    };

    // --- アプリケーション実行 ---
    app.initialize();
});