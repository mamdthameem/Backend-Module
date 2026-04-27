const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'SSEC-Backend-Service',
  script: path.join(__dirname, 'server.js'),
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully');
});

svc.uninstall();
