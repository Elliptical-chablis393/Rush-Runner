const https = require('https');
const { API_ACCESS_TOKEN } = require('./config');

const stationId = 'odpt.Station:JR-East.Yamanote.Tokyo';
const params = new URLSearchParams({
    'acl:consumerKey': API_ACCESS_TOKEN,
    // 'odpt:station': stationId
    'odpt:railway': 'odpt.Railway:TokyoMetro.Ginza'
});

const url = `https://api.odpt.org/api/v4/odpt:StationTimetable?${params.toString()}`;

console.log(`Requesting: ${url}`);

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
            const json = JSON.parse(data);
            console.log(`Found ${json.length} timetables.`);
            if (json.length > 0) {
                console.log('First timetable keys:', Object.keys(json[0]));
                // 少しだけ中身を表示
                console.log('Calendar:', json[0]['odpt:calendar']);
            }
        } else {
            console.log('Body:', data);
        }
    });
}).on('error', err => {
    console.error('Error:', err.message);
});
