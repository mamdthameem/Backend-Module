const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'SSEC-Backend-Service',
  description: 'Backend module for EasyTimePro-Firebase bridge',
  script: path.join(__dirname, 'server.js'),
  env: [{ name: 'NODE_ENV', value: 'production' }],
});

svc.on('install', () => {
  console.log('Service installed');
  svc.start();
});

svc.on('start', () => console.log('SSEC-Backend-Service started'));
svc.on('stop', () => console.log('SSEC-Backend-Service stopped'));
svc.on('alreadyinstalled', () => console.log('Service already installed'));
svc.on('error', (err) => console.error('Service error:', err));

svc.install();
