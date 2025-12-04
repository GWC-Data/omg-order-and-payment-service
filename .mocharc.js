'use strict';

module.exports = {
  require: ['tsconfig-paths/register', 'ts-node/register', `${process.cwd()}/test/env`],
  ui: 'bdd',
  reporter: 'nyan',
  exit: true,
  extension: ['ts'],
};
