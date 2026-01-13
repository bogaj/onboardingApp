module.exports = {
  appId: 'com.topgun.academy',
  productName: 'TopGun Academy',
  directories: {
    output: 'release',
  },
  files: ['dist/**', 'dist-electron/**', 'package.json'],
  asar: true,
  mac: {
    target: ['dmg', 'zip'],
  },
  win: {
    target: ['nsis', 'zip'],
  },
}
