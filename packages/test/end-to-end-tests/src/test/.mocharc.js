/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const testDriver = process.env.FLUID_TEST_DRIVER ? process.env.FLUID_TEST_DRIVER  : "local";
const packageDir = `${__dirname}/../..`;
const testPackagesDir = `${packageDir}/..`;

const config ={
  "exit": true,
  "recursive": true,
  // "parallel": testDriver === "local",
  "require": [
    `${testPackagesDir}/mocha-test-setup`,
    `${testPackagesDir}/test-drivers`,
  ],
  "unhandled-rejections": "strict"
};

if(process.env.FLUID_TEST_REPORT === "1"){
  config["reporter"] = `mocha-junit-reporter`;
  config["reporter-options"] = [
    // give the report file a unique name based on driver config
    `mochaFile=${packageDir}/nyc/${testDriver}-junit-report.xml`
  ];
}

module.exports = config
