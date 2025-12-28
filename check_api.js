const https = require('https');
const { API_ACCESS_TOKEN } = require('./config');

const params = new URLSearchParams({
    'acl:consumerKey': API_ACCESS_TOKEN,
    'odpt:operator': 'odpt.Operator:JR-East',
    'odpt:railway': 'odpt.Railway:JR-East.Yamanote'
});

const url = `https://api.odpt.org/api/v4/odpt:Station?${params.toString()}`;

console.log(`Requesting: ${url}`);

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
            const json = JSON.parse(data);
            console.log(`Found ${json.length} stations.`);
            if (json.length > 0) {
                console.log('First station:', JSON.stringify(json[0], null, 2));
            }
        } else {
            console.log('Body:', data);
        }
    });
}).on('error', err => {
    console.error('Error:', err.message);
});
